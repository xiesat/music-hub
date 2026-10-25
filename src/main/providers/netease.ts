// 内置音源：网易云音乐（匿名可用：搜索 / 歌词 / 部分曲目播放地址）
import type { LyricResult, ProviderInfo, RemoteTrack, SearchPage, StreamSource } from '@shared/provider'
import { httpJson, httpRequest } from './http'

const BASE = 'https://music.163.com'

interface SearchResponse {
  code: number
  result?: {
    songCount: number
    songs: {
      id: number
      name: string
      duration: number
      artists: { name: string }[]
      album: { name: string; picUrl?: string }
    }[]
  }
}

interface LyricResponse {
  code: number
  lrc?: { lyric?: string }
  tlyric?: { lyric?: string }
}

interface DetailResponse {
  songs?: {
    id: number
    album?: { picUrl?: string }
    artists?: { name: string }[]
  }[]
}

interface UrlResponse {
  code: number
  data?: { url: string | null; br: number; type?: string }[]
}

let cookieReadyAt = 0

interface CacheEntry {
  at: number
  page: SearchPage
}

const searchCache = new Map<string, CacheEntry>()
const SEARCH_TTL_MS = 3 * 60 * 1000

/** 把平台返回的错误码翻译成人能看懂的原因 */
function assertOk(code: number | undefined, fallback: string): void {
  if (code === 200 || code === undefined) return
  if (code === 405 || code === -460) {
    throw new Error('请求过于频繁，请稍后再试（平台风控）')
  }
  if (code === 400 || code === 403) {
    throw new Error('平台拒绝了这次请求（可能需要登录）')
  }
  throw new Error(fallback + '（code ' + code + '）')
}

/** 先访问一次首页拿游客 cookie，之后接口才会返回播放地址 */
async function ensureCookies(): Promise<void> {
  if (Date.now() - cookieReadyAt < 20 * 60 * 1000) return
  try {
    await httpRequest(BASE + '/', { referer: BASE, timeoutMs: 8000 })
  } catch {
    /* 拿不到 cookie 时仍可尝试后续请求 */
  }
  cookieReadyAt = Date.now()
}

type Song = NonNullable<SearchResponse['result']>['songs'][number]

interface ExtraMeta {
  coverUrl: string | null
  artist: string | null
}

function toTrack(song: Song, extra?: ExtraMeta): RemoteTrack {
  return {
    providerId: 'netease',
    key: String(song.id),
    title: song.name,
    artist: extra?.artist || song.artists.map((item) => item.name).join(' / '),
    album: song.album?.name ?? null,
    durationMs: song.duration ?? null,
    coverUrl: extra?.coverUrl ?? (song.album?.picUrl ? song.album.picUrl + '?param=120y120' : null)
  }
}

export const neteaseProvider = {
  info: {
    id: 'netease',
    name: '网易云音乐',
    version: '1.0.0',
    kind: 'builtin',
    enabled: true,
    capabilities: ['search', 'stream', 'lyric'],
    lastOkAt: null,
    lastError: null
  } satisfies ProviderInfo,

  async search(keyword: string, page: number): Promise<SearchPage> {
    const cacheKey = keyword.trim().toLowerCase() + '#' + page
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.at < SEARCH_TTL_MS) return cached.page

    const limit = 30
    const offset = Math.max(0, (page - 1) * limit)
    const url =
      BASE +
      '/api/search/get/web?s=' +
      encodeURIComponent(keyword) +
      '&type=1&limit=' +
      limit +
      '&offset=' +
      offset
    const json = await httpJson<SearchResponse>(url, { referer: BASE + '/' })
    assertOk(json.code, '搜索失败')
    const songs = json.result?.songs ?? []
    const total = json.result?.songCount ?? songs.length

    // 搜索接口只给 picId，封面与规范化艺人名要再查一次详情（一次请求拿全部）
    const extras = new Map<number, ExtraMeta>()
    if (songs.length > 0) {
      try {
        const ids = encodeURIComponent(JSON.stringify(songs.map((song) => song.id)))
        const detail = await httpJson<DetailResponse>(BASE + '/api/song/detail?ids=' + ids, {
          referer: BASE + '/'
        })
        for (const item of detail.songs ?? []) {
          extras.set(item.id, {
            coverUrl: item.album?.picUrl ? item.album.picUrl + '?param=120y120' : null,
            artist: item.artists?.map((artist) => artist.name).join(' / ') || null
          })
        }
      } catch {
        /* 封面拿不到不影响搜索 */
      }
    }

    const result: SearchPage = {
      items: songs.map((song) => toTrack(song, extras.get(song.id))),
      total,
      hasMore: offset + songs.length < total
    }
    searchCache.set(cacheKey, { at: Date.now(), page: result })
    if (searchCache.size > 50) {
      const oldest = searchCache.keys().next().value
      if (oldest) searchCache.delete(oldest)
    }
    return result
  },

  async stream(key: string): Promise<StreamSource | null> {
    await ensureCookies()
    const candidates = [
      BASE + '/api/song/enhance/player/url/v1?ids=%5B' + key + '%5D&level=standard&encodeType=mp3',
      BASE + '/api/song/enhance/player/url?ids=%5B' + key + '%5D&br=320000'
    ]
    for (const url of candidates) {
      try {
        const json = await httpJson<UrlResponse>(url, { referer: BASE + '/' })
        const first = json.data?.[0]
        if (first?.url) {
          const expires = /[?&]expires=([^&]+)/.exec(first.url)
          return {
            url: first.url,
            mime: 'audio/mpeg',
            expiresAt: expires ? Number(expires[1]) * 1000 : null
          }
        }
      } catch {
        /* 换下一个接口 */
      }
    }
    return null
  },

  async lyric(key: string): Promise<LyricResult> {
    const url = BASE + '/api/song/lyric?id=' + key + '&lv=1&kv=1&tv=-1'
    const json = await httpJson<LyricResponse>(url, { referer: BASE + '/' })
    assertOk(json.code, '获取歌词失败')
    return {
      lrc: json.lrc?.lyric?.trim() || null,
      translated: json.tlyric?.lyric?.trim() || null
    }
  }
}