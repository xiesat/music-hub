import fs from 'node:fs'
import { join } from 'node:path'
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
import { getSetting } from '../settings'
import { httpRequest } from './http'
import { neteaseProvider } from './netease'

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

export function listProviders(): ProviderInfo[] {
  ensureSeeded()
  const rows = getDb()
    .prepare('SELECT id, enabled, last_ok_at, last_error FROM providers')
    .all() as { id: string; enabled: number; last_ok_at: number | null; last_error: string | null }[]

  return builtins.map((provider) => {
    const row = rows.find((item) => item.id === provider.info.id)
    return {
      ...provider.info,
      enabled: row ? row.enabled === 1 : true,
      lastOkAt: row?.last_ok_at ?? null,
      lastError: row?.last_error ?? null
    }
  })
}

export function toggleProvider(id: string, enabled: boolean): void {
  ensureSeeded()
  getDb().prepare('UPDATE providers SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
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

export async function searchProvider(id: string, keyword: string, page = 1): Promise<SearchPage> {
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

export async function streamProvider(id: string, key: string): Promise<StreamSource | null> {
  const provider = getProvider(id)
  try {
    return await provider.stream(key)
  } catch (error) {
    markHealth(id, false, (error as Error).message)
    return null
  }
}

export async function lyricProvider(id: string, key: string): Promise<LyricResult> {
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
