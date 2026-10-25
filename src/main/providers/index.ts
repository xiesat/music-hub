import fs from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type {
  DownloadResult,
  LyricResult,
  ProviderInfo,
  RemoteTrack,
  SearchPage,
  StreamSource
} from '@shared/provider'
import { getDb } from '../db'
import { ingestFile } from '../library/scanner'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { getSetting } from '../settings'
import { httpRequest } from './http'
import { neteaseProvider } from './netease'
import { callScriptProvider, disposeScriptProvider, getScriptPlatform } from './sandbox'

interface BuiltinProvider {
  info: ProviderInfo
  search(keyword: string, page: number): Promise<SearchPage>
  stream(key: string): Promise<StreamSource | null>
  lyric(key: string): Promise<LyricResult>
}

const builtins: BuiltinProvider[] = [neteaseProvider]

function ensureSeeded(): void {
  const db = getDb()
  const statement = db.prepare(
    'INSERT INTO providers (id, name, version, source_type, enabled) VALUES (?, ?, ?, ?, 1)' +
      ' ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version'
  )
  for (const provider of builtins) {
    statement.run(provider.info.id, provider.info.name, provider.info.version, provider.info.kind)
  }
}

interface ScriptRow {
  id: string
  name: string
  version: string | null
  script_path: string | null
  enabled: number
  last_ok_at: number | null
  last_error: string | null
}

function scriptRows(): ScriptRow[] {
  return getDb()
    .prepare(
      "SELECT id, name, version, script_path, enabled, last_ok_at, last_error FROM providers WHERE source_type = 'script'"
    )
    .all() as ScriptRow[]
}

export function listProviders(): ProviderInfo[] {
  ensureSeeded()
  const rows = getDb()
    .prepare("SELECT id, enabled, last_ok_at, last_error FROM providers WHERE source_type <> 'script'")
    .all() as { id: string; enabled: number; last_ok_at: number | null; last_error: string | null }[]

  const builtinInfos = builtins.map((provider) => {
    const row = rows.find((item) => item.id === provider.info.id)
    return {
      ...provider.info,
      enabled: row ? row.enabled === 1 : true,
      lastOkAt: row?.last_ok_at ?? null,
      lastError: row?.last_error ?? null
    }
  })

  const scripts = scriptRows().map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version ?? '1.0.0',
    kind: 'script' as const,
    enabled: row.enabled === 1,
    capabilities: ['search', 'stream', 'lyric'],
    lastOkAt: row.last_ok_at,
    lastError: row.last_error
  }))

  return [...builtinInfos, ...scripts]
}

export function toggleProvider(id: string, enabled: boolean): void {
  ensureSeeded()
  getDb().prepare('UPDATE providers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
}

export function providersDir(): string {
  const dir = join(app.getPath('userData'), 'providers')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 导入音源脚本：复制到 userData/providers 并试加载一次 */
export async function importScriptProvider(sourcePath: string): Promise<ProviderInfo> {
  const fileName = basename(sourcePath)
  const target = join(providersDir(), fileName)
  copyFileSync(sourcePath, target)

  const id = 'script:' + fileName.replace(/\.js$/i, '')
  // 先跑一次极简调用，确认脚本能加载并拿到它自报的平台名
  await callScriptProvider<unknown>(target, 'search', [''], 8000).catch(() => undefined)
  const platform = getScriptPlatform(target)

  getDb()
    .prepare(
      'INSERT INTO providers (id, name, version, source_type, script_path, enabled)' +
        " VALUES (?, ?, '1.0.0', 'script', ?, 1)" +
        ' ON CONFLICT(id) DO UPDATE SET script_path = excluded.script_path, enabled = 1'
    )
    .run(id, platform || fileName.replace(/\.js$/i, ''), target)

  const created = listProviders().find((item) => item.id === id)
  if (!created) throw new Error('音源脚本注册失败')
  return created
}

export function removeScriptProvider(id: string): void {
  const row = getDb().prepare('SELECT script_path FROM providers WHERE id = ?').get(id) as
    | { script_path: string | null }
    | undefined
  if (row?.script_path) {
    disposeScriptProvider(row.script_path)
    if (existsSync(row.script_path)) {
      try {
        // 脚本文件由应用托管，删除时一并清理
        require('node:fs').unlinkSync(row.script_path)
      } catch {
        /* 忽略 */
      }
    }
  }
  getDb().prepare('DELETE FROM providers WHERE id = ?').run(id)
}

function getProvider(id: string): BuiltinProvider {
  const provider = builtins.find((item) => item.info.id === id)
  if (!provider) throw new Error('未知音源: ' + id)
  const row = getDb().prepare('SELECT enabled FROM providers WHERE id = ?').get(id) as
    | { enabled: number }
    | undefined
  if (row && row.enabled === 0) throw new Error('音源已禁用: ' + id)
  return provider
}

function markHealth(id: string, ok: boolean, error?: string): void {
  try {
    getDb()
      .prepare('UPDATE providers SET last_ok_at = ?, last_error = ?, fail_count = fail_count + ? WHERE id = ?')
      .run(ok ? Date.now() : null, ok ? null : (error ?? 'unknown'), ok ? 0 : 1, id)
  } catch {
    /* 健康状态记录失败不影响主流程 */
  }
}

function scriptFor(id: string): ScriptRow | null {
  const row = scriptRows().find((item) => item.id === id)
  return row?.script_path ? row : null
}

interface ScriptTrack {
  id?: string | number
  title?: string
  artist?: string
  album?: string
  duration?: number
  cover?: string
}

export async function searchProvider(id: string, keyword: string, page = 1): Promise<SearchPage> {
  const script = scriptFor(id)
  if (script?.script_path) {
    const raw = await callScriptProvider<ScriptTrack[]>(script.script_path, 'search', [keyword, page])
    const items = (Array.isArray(raw) ? raw : []).map((item) => ({
      providerId: id,
      key: String(item.id ?? ''),
      title: item.title ?? '未知标题',
      artist: item.artist ?? '未知艺术家',
      album: item.album ?? null,
      durationMs: item.duration ?? null,
      coverUrl: item.cover ?? null
    }))
    return { items, total: items.length, hasMore: false }
  }

  const provider = getProvider(id)
  try {
    const result = await provider.search(keyword, page)
    markHealth(id, true)
    return result
  } catch (error) {
    markHealth(id, false, (error as Error).message)
    throw error
  }
}

export interface MultiSearchResult {
  items: RemoteTrack[]
  total: number
  sources: { id: string; name: string; ok: boolean; count: number; error: string | null }[]
}

/** 并行搜索所有启用音源；单个音源失败只记录状态，不影响其它 */
export async function searchAllProviders(keyword: string, page = 1): Promise<MultiSearchResult> {
  const enabled = listProviders().filter((item) => item.enabled)
  const settled = await Promise.all(
    enabled.map(async (provider) => {
      try {
        const result = await searchProvider(provider.id, keyword, page)
        return {
          id: provider.id,
          name: provider.name,
          ok: true,
          count: result.items.length,
          error: null,
          items: result.items
        }
      } catch (error) {
        return {
          id: provider.id,
          name: provider.name,
          ok: false,
          count: 0,
          error: (error as Error).message,
          items: [] as RemoteTrack[]
        }
      }
    })
  )

  // 交错合并，让每个音源的结果都能出现在前面
  const merged: RemoteTrack[] = []
  const maxLength = Math.max(0, ...settled.map((item) => item.items.length))
  for (let i = 0; i < maxLength; i += 1) {
    for (const source of settled) {
      const item = source.items[i]
      if (item) merged.push(item)
    }
  }

  return {
    items: merged,
    total: settled.reduce((sum, item) => sum + item.count, 0),
    sources: settled.map(({ id, name, ok, count, error }) => ({ id, name, ok, count, error }))
  }
}

export async function streamProvider(
  id: string,
  key: string,
  meta?: { title?: string; artist?: string | null }
): Promise<StreamSource | null> {
  const script = scriptFor(id)
  if (script?.script_path) {
    try {
      const raw = await callScriptProvider<{ url?: string } | null>(script.script_path, 'getMediaSource', [{ id: key }])
      if (!raw?.url) return null
      return { url: raw.url, mime: null, expiresAt: null }
    } catch {
      return null
    }
  }

  const provider = getProvider(id)
  try {
    const direct = await provider.stream(key)
    if (direct) return direct
  } catch (error) {
    markHealth(id, false, (error as Error).message)
  }

  // 换源兜底：拿不到地址时，去其它音源按 标题+艺人 找同一首
  if (!meta?.title) return null
  const others = listProviders().filter((item) => item.enabled && item.id !== id)
  const normalized = meta.title.replace(/\s+/g, '').toLowerCase()
  for (const other of others) {
    try {
      const page = await searchProvider(other.id, [meta.title, meta.artist].filter(Boolean).join(' '), 1)
      const match = page.items.find((item) => item.title.replace(/\s+/g, '').toLowerCase() === normalized)
      if (!match) continue
      if (match.providerId !== other.id) continue
      const source = await streamProvider(other.id, match.key)
      if (source) return source
    } catch {
      /* 换下一个音源 */
    }
  }
  return null
}

export async function lyricProvider(id: string, key: string): Promise<LyricResult> {
  const script = scriptFor(id)
  if (script?.script_path) {
    try {
      const raw = await callScriptProvider<{ lrc?: string } | string | null>(
        script.script_path,
        'getLyric',
        [{ id: key }]
      )
      const lrc = typeof raw === 'string' ? raw : (raw?.lrc ?? null)
      return { lrc: lrc?.trim() || null, translated: null }
    } catch {
      return { lrc: null, translated: null }
    }
  }

  const provider = getProvider(id)
  try {
    return await provider.lyric(key)
  } catch (error) {
    markHealth(id, false, (error as Error).message)
    return { lrc: null, translated: null }
  }
}

/** 本地曲目没有歌词时，按 标题 + 艺人 去在线搜一个最像的 */
export async function onlineLyric(title: string, artist: string | null): Promise<LyricResult> {
  const keyword = [title, artist].filter(Boolean).join(' ')
  for (const provider of builtins) {
    try {
      const page = await provider.search(keyword, 1)
      const normalizedTitle = title.replace(/\s+/g, '').toLowerCase()
      const best =
        page.items.find((item) => item.title.replace(/\s+/g, '').toLowerCase() === normalizedTitle) ??
        page.items[0]
      if (!best) continue
      const lyric = await provider.lyric(best.key)
      if (lyric.lrc) return lyric
    } catch {
      /* 换下一个音源 */
    }
  }
  return { lrc: null, translated: null }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120).trim() || 'track'
}

export function getDownloadDir(): string {
  const configured = getSetting<string>('download.dir', '')
  const dir = configured || join(app.getPath('music'), 'MusicHub')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function downloadRemoteTrack(
  providerId: string,
  key: string,
  title: string,
  artist: string,
  onProgress?: (received: number, total: number) => void
): Promise<DownloadResult> {
  const source = await streamProvider(providerId, key)
  if (!source) throw new Error('该曲目拿不到播放地址（可能需要会员或已下架）')

  const dir = getDownloadDir()
  const fileName = sanitizeFileName(artist ? artist + ' - ' + title : title) + '.mp3'
  const filePath = join(dir, fileName)

  const response = await httpRequest(source.url, { timeoutMs: 60_000 })
  if (!response.ok || !response.body) throw new Error('下载失败: HTTP ' + response.status)

  const total = Number(response.headers.get('content-length') ?? 0)
  const stream = response.body.getReader()
  const handle = await fs.promises.open(filePath, 'w')
  let received = 0
  try {
    for (;;) {
      const { done, value } = await stream.read()
      if (done) break
      if (value) {
        await handle.write(value)
        received += value.byteLength
        onProgress?.(received, total)
      }
    }
  } finally {
    await handle.close()
  }

  const trackId = await ingestFile(filePath)
  return { trackId, filePath, bytes: received }
}

export type { RemoteTrack }