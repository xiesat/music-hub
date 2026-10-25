import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import { parseFile } from 'music-metadata'
import type { ScanProgress } from '@shared/types'
import { loadExistingByPath, pruneMissingTracks, upsertTracks, type UpsertTrackInput } from './repository'

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.wav', '.ogg', '.opus',
  '.wma', '.ape', '.aiff', '.aif', '.dsf', '.mp4'
])

const PARSE_CONCURRENCY = 6
const FLUSH_SIZE = 40

let coverDirCache: string | null = null

function coverDir(): string {
  if (!coverDirCache) {
    coverDirCache = join(app.getPath('userData'), 'covers')
    fs.mkdirSync(coverDirCache, { recursive: true })
  }
  return coverDirCache
}

async function* walkAudioFiles(dir: string): AsyncGenerator<string> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkAudioFiles(full)
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield full
    }
  }
}

function fallbackFromFilename(filePath: string): { title: string; artist: string | null } {
  const raw = basename(filePath, extname(filePath))
  const cleaned = raw.replace(/^\s*\d{1,3}[.\-\s]+/, '').trim()
  const parts = cleaned.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(' - ') }
  return { title: cleaned || raw, artist: null }
}

function saveCover(data: Uint8Array, format: string | undefined, albumKey: string): string | null {
  try {
    const ext = format && format.includes('png') ? '.png' : '.jpg'
    const hash = createHash('sha1').update(albumKey).digest('hex').slice(0, 20)
    const file = join(coverDir(), hash + ext)
    if (!fs.existsSync(file)) fs.writeFileSync(file, data)
    return file
  } catch {
    return null
  }
}

/** 把标签里的内嵌歌词（含逐字 syncText）转成 LRC 文本 */
interface LyricsTagLike {
  text?: string
  syncText?: { timestamp: number; text: string }[]
}

function embeddedLyricToLrc(lyrics: readonly unknown[] | undefined): string | null {
  if (!lyrics || lyrics.length === 0) return null
  const first = lyrics[0] as LyricsTagLike
  const syncText = first.syncText as { timestamp: number; text: string }[] | undefined
  if (syncText && syncText.length > 0) {
    const pad = (value: number, size = 2): string => String(value).padStart(size, '0')
    return syncText
      .map((entry) => {
        const totalMs = entry.timestamp
        const minutes = Math.floor(totalMs / 60000)
        const seconds = Math.floor((totalMs % 60000) / 1000)
        const centis = Math.floor((totalMs % 1000) / 10)
        return '[' + pad(minutes) + ':' + pad(seconds) + '.' + pad(centis) + ']' + entry.text
      })
      .join('\n')
  }
  const plain = first.text?.trim()
  return plain && plain.length > 0 ? plain : null
}

/** 解析器版本：逻辑变更时 +1，旧库会在下次扫描时强制重新解析 */
export const PARSER_VERSION = 2

/** 歌词文件常见 UTF-8(BOM) / GBK，UTF-8 解不出来时回退 GB18030 */
function decodeText(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8')
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le')
  }
  const utf8 = buffer.toString('utf8')
  if (utf8.includes('\uFFFD')) {
    try {
      return new TextDecoder('gb18030').decode(buffer)
    } catch {
      return utf8
    }
  }
  return utf8
}

function lrcPathFor(filePath: string): string {
  return filePath.slice(0, filePath.length - extname(filePath).length) + '.lrc'
}

/** 侧车歌词的修改时间，用来判断歌词是否需要重解析 */
function sidecarMtime(filePath: string): number | null {
  try {
    const lrcPath = lrcPathFor(filePath)
    if (!fs.existsSync(lrcPath)) return null
    return Math.floor(fs.statSync(lrcPath).mtimeMs)
  } catch {
    return null
  }
}

function readSidecarLyric(filePath: string): string | null {
  try {
    const lrcPath = lrcPathFor(filePath)
    if (!fs.existsSync(lrcPath)) return null
    return decodeText(fs.readFileSync(lrcPath))
  } catch {
    return null
  }
}

async function parseOne(filePath: string, stat: fs.Stats): Promise<UpsertTrackInput> {
  const fallback = fallbackFromFilename(filePath)
  const id = randomUUID()
  const base: UpsertTrackInput = {
    id,
    title: fallback.title,
    artist: fallback.artist,
    album: null,
    albumArtist: null,
    durationMs: null,
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    path: filePath,
    format: extname(filePath).replace('.', '').toLowerCase(),
    bitrate: null,
    sampleRate: null,
    channels: null,
    size: stat.size,
    mtime: Math.floor(stat.mtimeMs),
    coverPath: null,
    lyric: readSidecarLyric(filePath),
    lyricMtime: sidecarMtime(filePath)
  }

  try {
    const metadata = await parseFile(filePath, { duration: true, skipCovers: false })
    const common = metadata.common
    const format = metadata.format
    const title = common.title?.trim()
    const artist = common.artist?.trim() || common.albumartist?.trim()
    const album = common.album?.trim()

    const picture = common.picture?.[0]
    let coverPath: string | null = null
    if (picture?.data) {
      const albumKey = [album ?? '', common.albumartist ?? artist ?? '', artist ?? ''].join('|') || filePath
      coverPath = saveCover(picture.data, picture.format, albumKey)
    }

    return {
      ...base,
      title: title || fallback.title,
      artist: artist || fallback.artist,
      album: album ?? null,
      albumArtist: common.albumartist?.trim() ?? null,
      durationMs: format.duration ? Math.round(format.duration * 1000) : null,
      trackNo: common.track?.no ?? null,
      discNo: common.disk?.no ?? null,
      year: common.year ?? null,
      genre: common.genre?.[0] ?? null,
      format: format.container?.toLowerCase() || base.format,
      bitrate: format.bitrate ? Math.round(format.bitrate) : null,
      sampleRate: format.sampleRate ?? null,
      channels: format.numberOfChannels ?? null,
      coverPath: coverPath ?? null,
      lyric: base.lyric ?? embeddedLyricToLrc(common.lyrics),
      lyricMtime: base.lyricMtime
    }
  } catch {
    // 解析失败也要入库，避免文件被反复重试
    return base
  }
}

/** 单文件入库（下载完成后调用），返回曲目 id */
export async function ingestFile(filePath: string): Promise<string> {
  const stat = await fs.promises.stat(filePath)
  const parsed = await parseOne(filePath, stat)
  const existing = loadExistingByPath().get(filePath)
  if (existing) parsed.id = existing.id
  upsertTracks([parsed])
  return parsed.id
}

export interface ScanOptions {
  onProgress: (progress: ScanProgress) => void
  /** 扫描结束后删除磁盘上已不存在的记录 */
  prune?: boolean
  /** 忽略缓存，对所有文件重新解析（解析器升级后使用） */
  forceReparse?: boolean
}

export async function scanDirectories(roots: string[], options: ScanOptions): Promise<ScanProgress> {
  const progress: ScanProgress = {
    phase: 'walking',
    scanned: 0,
    total: 0,
    current: null,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  }

  const files: string[] = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for await (const file of walkAudioFiles(root)) {
      files.push(file)
      progress.total = files.length
      if (files.length % 200 === 0) options.onProgress({ ...progress })
    }
  }

  progress.phase = 'parsing'
  progress.total = files.length
  options.onProgress({ ...progress })

  const existing = loadExistingByPath()
  const seen = new Set<string>()
  const buffer: UpsertTrackInput[] = []
  let cursor = 0

  const flush = (): void => {
    if (buffer.length === 0) return
    upsertTracks(buffer.splice(0, buffer.length))
  }

  const worker = async (): Promise<void> => {
    while (cursor < files.length) {
      const file = files[cursor]
      cursor += 1
      progress.scanned += 1
      progress.current = file
      seen.add(file)

      try {
        const stat = await fs.promises.stat(file)
        const mtime = Math.floor(stat.mtimeMs)
        const cached = existing.get(file)
        const lrcMtime = sidecarMtime(file)

        const cacheHit =
          cached &&
          !options.forceReparse &&
          cached.mtime === mtime &&
          cached.size === stat.size &&
          (cached.lyricMtime ?? null) === lrcMtime

        if (cacheHit) {
          progress.skipped += 1
        } else {
          const parsed = await parseOne(file, stat)
          if (cached) {
            parsed.id = cached.id
            progress.updated += 1
          } else {
            progress.added += 1
          }
          buffer.push(parsed)
          if (buffer.length >= FLUSH_SIZE) flush()
        }
      } catch {
        progress.failed += 1
      }

      if (progress.scanned % 10 === 0 || progress.scanned === files.length) {
        options.onProgress({ ...progress })
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(PARSE_CONCURRENCY, files.length || 1) }, worker))
  flush()

  if (options.prune) pruneMissingTracks(seen)

  progress.phase = 'done'
  progress.current = null
  options.onProgress({ ...progress })
  return progress
}