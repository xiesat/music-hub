// media:// 自定义协议：把本地文件安全地暴露给渲染进程的音视频元素/图片元素
//   media://track/<trackId>   曲目音频（支持 Range，可拖动进度）
//   media://cover/<trackId>   曲目内嵌封面
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { extname } from 'node:path'
import { protocol } from 'electron'
import { getTrackById } from './library/repository'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.ape': 'audio/x-ape',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
}

export const MEDIA_SCHEME = 'media'

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    }
  ])
}

function notFound(): Response {
  return new Response('not found', { status: 404 })
}

function toWebStream(file: string, start?: number, end?: number): ReadableStream {
  const nodeStream = fs.createReadStream(file, { start, end })
  return Readable.toWeb(nodeStream) as unknown as ReadableStream
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  const start = rawStart ? Number(rawStart) : 0
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) return null
  return { start, end }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type'
}

export function registerMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    // Range 属于非简单请求头，浏览器会先发 OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    try {
      const url = new URL(request.url)
      const kind = url.hostname
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!id) return notFound()

      const track = getTrackById(id)
      if (!track) return notFound()

      const file = kind === 'cover' ? track.coverPath : track.path
      if (!file || !fs.existsSync(file)) return notFound()

      const stat = await fs.promises.stat(file)
      const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
      const range = parseRange(request.headers.get('Range'), stat.size)

      if (range) {
        const { start, end } = range
        return new Response(toWebStream(file, start, end), {
          status: 206,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': mime,
            'Content-Length': String(end - start + 1),
            'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*'
          }
        })
      }

      return new Response(toWebStream(file), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': mime,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } catch (error) {
      if (process.env.MUSIC_HUB_DEBUG) console.error('[media]', (error as Error).message)
      return notFound()
    }
  })
}

export function trackMediaUrl(trackId: string): string {
  return MEDIA_SCHEME + '://track/' + encodeURIComponent(trackId)
}

export function coverMediaUrl(trackId: string): string {
  return MEDIA_SCHEME + '://cover/' + encodeURIComponent(trackId)
}