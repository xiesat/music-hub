// 平台歌单导入：网易云（可播放）/ QQ 音乐（仅导入结构，播放需登录）
import type { RemoteTrackInput } from '../library/repository'
import { upsertRemoteTracks } from '../library/repository'
import { addTracksToPlaylist, createPlaylist } from '../playlists'
import { httpJson } from './http'

export type Platform = 'netease' | 'qq'

export interface PlatformPlaylist {
  id: string
  name: string
  trackCount: number
  coverUrl: string | null
  platform: Platform
}

export interface ImportResult {
  playlistId: string
  name: string
  imported: number
  total: number
  playable: boolean
}

const NE = 'https://music.163.com'

// ---------- 网易云 ----------

interface NePlaylistRow {
  id: number
  name: string
  trackCount?: number
  coverImgUrl?: string
}

interface NeUserPlaylists {
  code: number
  playlist?: NePlaylistRow[]
}

interface NeSong {
  id: number
  name: string
  dt?: number
  ar?: { name: string }[]
  al?: { name?: string; picUrl?: string }
}

interface NePlaylistDetail {
  code: number
  playlist?: { name: string; tracks?: NeSong[] }
}

function neCover(url: string | undefined): string | null {
  if (!url) return null
  return url.replace(/^http:/, 'https:') + '?param=200y200'
}

export async function listNetEasePlaylists(uid: string): Promise<PlatformPlaylist[]> {
  const json = await httpJson<NeUserPlaylists>(
    NE + '/api/user/playlist?uid=' + encodeURIComponent(uid) + '&limit=100&offset=0',
    { referer: NE + '/' }
  )
  if (json.code !== 200) throw new Error('查询失败（code ' + json.code + '），请确认用户 ID 是否正确')
  return (json.playlist ?? []).map((item) => ({
    id: String(item.id),
    name: item.name,
    trackCount: item.trackCount ?? 0,
    coverUrl: neCover(item.coverImgUrl),
    platform: 'netease' as const
  }))
}

export async function fetchNetEasePlaylist(id: string): Promise<{ name: string; tracks: RemoteTrackInput[] }> {
  const json = await httpJson<NePlaylistDetail>(
    NE + '/api/v6/playlist/detail?id=' + encodeURIComponent(id) + '&n=1000&s=0',
    { referer: NE + '/' }
  )
  if (json.code !== 200 || !json.playlist) throw new Error('歌单不存在或不可访问（code ' + json.code + '）')

  const tracks = (json.playlist.tracks ?? []).map((song) => ({
    id: 'remote:netease:' + song.id,
    provider: 'netease',
    providerKey: String(song.id),
    title: song.name,
    artist: (song.ar ?? []).map((item) => item.name).join(' / ') || null,
    album: song.al?.name ?? null,
    durationMs: song.dt ?? null,
    coverUrl: neCover(song.al?.picUrl)
  }))

  return { name: json.playlist.name, tracks }
}

// ---------- QQ 音乐 ----------

interface QqSong {
  mid: string
  name: string
  title?: string
  interval?: number
  singer?: { name: string }[]
  album?: { mid?: string; name?: string }
}

interface QqCdList {
  code: number
  cdlist?: { dissname: string; songnum?: number; songlist?: QqSong[] }[]
}

interface QqUserDiss {
  code: number
  data?: { disslist?: { disstid?: string; dissid?: string; dissname?: string; songnum?: number; imgurl?: string }[] }
}

function qqCover(albumMid: string | undefined): string | null {
  if (!albumMid) return null
  return 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg'
}

export async function listQqPlaylists(uin: string): Promise<PlatformPlaylist[]> {
  const json = await httpJson<QqUserDiss>(
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?hostuin=' +
      encodeURIComponent(uin) +
      '&format=json&inCharset=utf8&outCharset=utf-8',
    { referer: 'https://y.qq.com/' }
  )
  const list = json.data?.disslist ?? []
  return list.map((item) => ({
    id: String(item.disstid ?? item.dissid ?? ''),
    name: item.dissname ?? '未命名歌单',
    trackCount: item.songnum ?? 0,
    coverUrl: item.imgurl ?? null,
    platform: 'qq' as const
  })).filter((item) => item.id)
}

export async function fetchQqPlaylist(id: string): Promise<{ name: string; tracks: RemoteTrackInput[] }> {
  const json = await httpJson<QqCdList>(
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&new_format=1' +
      '&disstid=' +
      encodeURIComponent(id) +
      '&format=json',
    { referer: 'https://y.qq.com/' }
  )
  const cd = json.cdlist?.[0]
  if (!cd) throw new Error('歌单不存在或不可访问')

  const tracks = (cd.songlist ?? [])
    .filter((song) => song.mid)
    .map((song) => ({
      id: 'remote:qq:' + song.mid,
      provider: 'qq',
      providerKey: song.mid,
      title: song.name || song.title || '未知标题',
      artist: (song.singer ?? []).map((item) => item.name).join(' / ') || null,
      album: song.album?.name ?? null,
      durationMs: song.interval ? song.interval * 1000 : null,
      coverUrl: qqCover(song.album?.mid)
    }))

  return { name: cd.dissname, tracks }
}

// ---------- 统一入口 ----------

export async function listPlatformPlaylists(
  platform: Platform,
  uid: string
): Promise<PlatformPlaylist[]> {
  return platform === 'netease' ? listNetEasePlaylists(uid) : listQqPlaylists(uid)
}

export async function importPlatformPlaylist(
  platform: Platform,
  id: string
): Promise<ImportResult> {
  const detail = platform === 'netease' ? await fetchNetEasePlaylist(id) : await fetchQqPlaylist(id)
  if (detail.tracks.length === 0) throw new Error('这个歌单里没有可导入的曲目')

  upsertRemoteTracks(detail.tracks)

  const label = platform === 'netease' ? '网易云' : 'QQ音乐'
  const playlist = createPlaylist(label + ' · ' + detail.name)
  const added = addTracksToPlaylist(
    playlist.id,
    detail.tracks.map((track) => track.id)
  )

  return {
    playlistId: playlist.id,
    name: playlist.name,
    imported: added,
    total: detail.tracks.length,
    playable: platform === 'netease'
  }
}
