import { randomUUID } from 'node:crypto'
import type { Playlist, Track, TrackPage } from '@shared/types'
import { getDb } from './db'
import { buildKeywordFilter, listTracks } from './library/repository'

export const FAVORITES_ID = 'favorites'

interface PlaylistRow {
  id: string
  name: string
  description: string | null
  is_system: number
  created_at: number
  updated_at: number
  track_count: number
}

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trackCount: row.track_count,
    isSystem: row.id === FAVORITES_ID,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listPlaylists(): Playlist[] {
  const rows = getDb()
    .prepare(
      'SELECT p.id, p.name, p.description, p.is_system, p.created_at, p.updated_at,' +
        ' (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) AS track_count' +
        ' FROM playlists p ORDER BY p.sort ASC, p.created_at ASC'
    )
    .all() as PlaylistRow[]

  const db = getDb()
  const favoriteCount = (
    db.prepare('SELECT COUNT(*) AS c FROM tracks WHERE favorite = 1').get() as { c: number }
  ).c

  // 「我喜欢的音乐」是虚拟歌单：直接映射 tracks.favorite
  const favorites: Playlist = {
    id: FAVORITES_ID,
    name: '我喜欢的音乐',
    description: null,
    trackCount: favoriteCount,
    isSystem: true,
    createdAt: 0,
    updatedAt: 0
  }

  return [favorites, ...rows.map(toPlaylist)]
}

export function createPlaylist(name: string): Playlist {
  const db = getDb()
  const trimmed = name.trim() || '新建歌单'
  const id = randomUUID()
  const now = Date.now()
  const maxSort = (
    db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM playlists').get() as { m: number }
  ).m

  db.prepare(
    'INSERT INTO playlists (id, name, description, cover_path, is_system, sort, created_at, updated_at)' +
      ' VALUES (?, ?, NULL, NULL, 0, ?, ?, ?)'
  ).run(id, trimmed, maxSort + 1, now, now)

  return {
    id,
    name: trimmed,
    description: null,
    trackCount: 0,
    isSystem: false,
    createdAt: now,
    updatedAt: now
  }
}

export function renamePlaylist(id: string, name: string): void {
  if (id === FAVORITES_ID) return
  const trimmed = name.trim()
  if (!trimmed) return
  getDb()
    .prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?')
    .run(trimmed, Date.now(), id)
}

export function deletePlaylist(id: string): void {
  if (id === FAVORITES_ID) return
  getDb().prepare('DELETE FROM playlists WHERE id = ?').run(id)
}

export function listPlaylistTracks(
  id: string,
  query: { offset?: number; limit?: number; keyword?: string }
): TrackPage {
  if (id === FAVORITES_ID) {
    return listTracks({
      keyword: query.keyword,
      offset: query.offset,
      limit: query.limit,
      sort: 'addedAt',
      order: 'desc',
      favoriteOnly: true
    })
  }

  const db = getDb()
  const limit = Math.min(query.limit ?? 300, 1000)
  const offset = Math.max(query.offset ?? 0, 0)
  const keyword = (query.keyword ?? '').trim()
  const tokenFilter = buildKeywordFilter(keyword)
  const where = tokenFilter.where ? ' AND ' + tokenFilter.where.replace(/^WHERE /, '').replace(/title LIKE/g, 't.title LIKE').replace(/artist LIKE/g, 't.artist LIKE').replace(/album LIKE/g, 't.album LIKE').replace(/lyric LIKE/g, 't.lyric LIKE') : ''
  const keywordParams = tokenFilter.params

  const rows = db
    .prepare(
      'SELECT t.id, t.kind, t.provider, t.provider_key, t.cover_url, t.title, t.artist, t.album, t.duration_ms, t.format, t.bitrate, t.size,' +
        ' t.path, t.cover_path, t.favorite, t.play_count, t.created_at' +
        ' FROM playlist_items pi JOIN tracks t ON t.id = pi.track_id' +
        ' WHERE pi.playlist_id = @id' +
        where +
        ' ORDER BY pi.position ASC LIMIT @limit OFFSET @offset'
    )
    .all({ id, ...keywordParams, limit, offset }) as Record<string, unknown>[]

  const total = (
    db
      .prepare(
        'SELECT COUNT(*) AS c FROM playlist_items pi JOIN tracks t ON t.id = pi.track_id' +
          ' WHERE pi.playlist_id = @id' +
          where
      )
      .get({ id, ...keywordParams }) as { c: number }
  ).c

  const items: Track[] = rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    artist: (row.artist as string | null) ?? null,
    album: (row.album as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    format: (row.format as string | null) ?? null,
    bitrate: (row.bitrate as number | null) ?? null,
    size: (row.size as number | null) ?? null,
    path: (row.path as string | null) ?? null,
    coverPath: (row.cover_path as string | null) ?? null,
    coverUrl: (row.cover_url as string | null) ?? undefined,
    providerId: (row.provider as string | null) ?? undefined,
    providerKey: (row.provider_key as string | null) ?? undefined,
    favorite: row.favorite === 1,
    playCount: (row.play_count as number) ?? 0,
    createdAt: (row.created_at as number) ?? 0
  }))

  return { items, total }
}

export function addTracksToPlaylist(id: string, trackIds: string[]): number {
  if (id === FAVORITES_ID) {
    setFavoriteTracks(trackIds, true)
    return trackIds.length
  }
  if (trackIds.length === 0) return 0

  const db = getDb()
  const maxPosition = (
    db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM playlist_items WHERE playlist_id = ?').get(id) as {
      m: number
    }
  ).m

  const insert = db.prepare(
    'INSERT OR IGNORE INTO playlist_items (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)'
  )
  const now = Date.now()
  let added = 0

  db.transaction((ids: string[]) => {
    ids.forEach((trackId, index) => {
      const result = insert.run(id, trackId, maxPosition + index + 1, now)
      added += result.changes
    })
  })(trackIds)

  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, id)
  return added
}

export function removeTracksFromPlaylist(id: string, trackIds: string[]): void {
  if (id === FAVORITES_ID) {
    setFavoriteTracks(trackIds, false)
    return
  }
  if (trackIds.length === 0) return
  const db = getDb()
  const statement = db.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND track_id = ?')
  db.transaction((ids: string[]) => ids.forEach((trackId) => statement.run(id, trackId)))(trackIds)
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

export function reorderPlaylist(id: string, orderedTrackIds: string[]): void {
  if (id === FAVORITES_ID || orderedTrackIds.length === 0) return
  const db = getDb()
  const update = db.prepare('UPDATE playlist_items SET position = ? WHERE playlist_id = ? AND track_id = ?')
  db.transaction((ids: string[]) => ids.forEach((trackId, index) => update.run(index + 1, id, trackId)))(orderedTrackIds)
  db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}

function setFavoriteTracks(trackIds: string[], favorite: boolean): void {
  const db = getDb()
  const statement = db.prepare('UPDATE tracks SET favorite = ?, updated_at = ? WHERE id = ?')
  const now = Date.now()
  db.transaction((ids: string[]) => ids.forEach((id) => statement.run(favorite ? 1 : 0, now, id)))(trackIds)
}