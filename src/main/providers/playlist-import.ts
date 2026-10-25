// 平台歌单导入：完全走外部音源脚本（不再硬编码平台实现）
import type { RemoteTrackInput } from '../library/repository'
import { upsertRemoteTracks } from '../library/repository'
import { addTracksToPlaylist, createPlaylist } from '../playlists'
import { getDb } from '../db'
import { listProviders } from './index'
import { callScriptProvider } from './sandbox'

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

interface ScriptPlaylist {
  id: string
  name: string
  trackCount?: number
  coverUrl?: string | null
}

interface ScriptTrack {
  id: string
  title: string
  artist?: string
  album?: string
  duration?: number | null
  cover?: string | null
}

const PLATFORM_LABEL: Record<Platform, string> = {
  netease: '网易云',
  qq: 'QQ音乐'
}

/** 平台 → 对应的外部脚本音源 */
function resolveScript(platform: Platform): { providerId: string; scriptPath: string } {
  const providerId = 'script:' + platform
  const provider = listProviders().find((item) => item.id === providerId)
  if (!provider) {
    throw new Error('未安装 ' + PLATFORM_LABEL[platform] + ' 音源脚本，请先在「音源插件」里导入')
  }
  const row = getDb()
    .prepare('SELECT script_path FROM providers WHERE id = ?')
    .get(providerId) as { script_path: string | null } | undefined
  if (!row?.script_path) throw new Error('音源脚本路径缺失，请重新导入')
  return { providerId, scriptPath: row.script_path }
}

export async function listPlatformPlaylists(
  platform: Platform,
  uid: string
): Promise<PlatformPlaylist[]> {
  const { scriptPath } = resolveScript(platform)
  const raw = await callScriptProvider<ScriptPlaylist[]>(scriptPath, 'getUserPlaylists', [uid], 20_000)
  if (!Array.isArray(raw)) throw new Error('音源脚本未实现「查询用户歌单」')

  return raw.map((item) => ({
    id: String(item.id),
    name: item.name ?? '未命名歌单',
    trackCount: item.trackCount ?? 0,
    coverUrl: item.coverUrl ?? null,
    platform
  }))
}

export async function importPlatformPlaylist(
  platform: Platform,
  id: string
): Promise<ImportResult> {
  const { providerId, scriptPath } = resolveScript(platform)
  const detail = await callScriptProvider<{ name: string; tracks: ScriptTrack[] }>(
    scriptPath,
    'getPlaylistTracks',
    [id],
    30_000
  )
  if (!detail?.tracks?.length) throw new Error('这个歌单里没有可导入的曲目')

  const tracks: RemoteTrackInput[] = detail.tracks
    .filter((track) => track.id)
    .map((track) => ({
      id: 'remote:' + providerId + ':' + track.id,
      provider: providerId,
      providerKey: String(track.id),
      title: track.title ?? '未知标题',
      artist: track.artist ?? null,
      album: track.album ?? null,
      durationMs: track.duration ?? null,
      coverUrl: track.cover ?? null
    }))

  upsertRemoteTracks(tracks)

  const playlist = createPlaylist(PLATFORM_LABEL[platform] + ' · ' + detail.name)
  const added = addTracksToPlaylist(
    playlist.id,
    tracks.map((track) => track.id)
  )

  return {
    playlistId: playlist.id,
    name: playlist.name,
    imported: added,
    total: tracks.length,
    // QQ 音乐取流需要登录态，脚本里 getMediaSource 返回 null
    playable: platform === 'netease'
  }
}
