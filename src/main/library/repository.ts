import type { LibraryStats, Track, TrackPage, TrackQuery, TrackSort } from '@shared/types'
import { getDb } from '../db'

interface TrackRow {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration_ms: number | null
  format: string | null
  bitrate: number | null
  size: number | null
  path: string | null
  cover_path: string | null
  cover_url?: string | null
  provider?: string | null
  provider_key?: string | null
  favorite: number
  play_count: number
  created_at: number
}

function toTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    format: row.format,
    bitrate: row.bitrate,
    size: row.size,
    path: row.path,
    coverPath: row.cover_path,
    coverUrl: row.cover_url ?? undefined,
    providerId: row.provider ?? undefined,
    providerKey: row.provider_key ?? undefined,
    favorite: row.favorite === 1,
    playCount: row.play_count,
    createdAt: row.created_at
  }
}

const SORT_COLUMN: Record<TrackSort, string> = {
  title: 'title COLLATE NOCASE',
  artist: 'artist COLLATE NOCASE',
  album: 'album COLLATE NOCASE',
  addedAt: 'created_at',
  duration: 'duration_ms'
}

const SELECT_FIELDS =
  'id, title, artist, album, duration_ms, format, bitrate, size, path, cover_path, cover_url, provider, provider_key, favorite, play_count, created_at'

/**
 * 关键词拆成多个词元：词元之间是 AND，每个词元在 标题/艺人/专辑/歌词 之间是 OR。
 * 这样「晴天 周杰伦」这种组合、以及只记得一句歌词的搜索都能命中。
 */
export function buildKeywordFilter(
  keyword: string,
  extraConditions: string[] = []
): { where: string; params: Record<string, string> } {
  const tokens = keyword
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)

  const conditions = [...extraConditions]
  const params: Record<string, string> = {}

  tokens.forEach((token, index) => {
    const key = 'kw' + index
    params[key] = '%' + token + '%'
    conditions.push(
      '(title LIKE @' +
        key +
        ' OR artist LIKE @' +
        key +
        ' OR album LIKE @' +
        key +
        ' OR lyric LIKE @' +
        key +
        ')'
    )
  })

  return { where: conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '', params }
}

export function listTracks(query: TrackQuery): TrackPage {
  const db = getDb()
  // 「我喜欢的音乐」要包含在线曲目，所以收藏视图不再限定 kind = 'local'
  const extra = query.favoriteOnly ? ['favorite = 1'] : ["kind = 'local'"]

  const filter = buildKeywordFilter(query.keyword ?? '', extra)
  const where = filter.where
  const params = {
    ...filter.params,
    limit: Math.min(query.limit ?? 200, 1000),
    offset: Math.max(query.offset ?? 0, 0)
  }

  const column = SORT_COLUMN[query.sort ?? 'title']
  const direction = query.order === 'desc' ? 'DESC' : 'ASC'

  const rows = db
    .prepare(
      'SELECT ' +
        SELECT_FIELDS +
        ' FROM tracks ' +
        where +
        ' ORDER BY ' +
        column +
        ' ' +
        direction +
        ' LIMIT @limit OFFSET @offset'
    )
    .all(params) as TrackRow[]

  const total = (db.prepare('SELECT COUNT(*) AS c FROM tracks ' + where).get(filter.params) as { c: number }).c

  return { items: rows.map(toTrack), total }
}

export interface ExistingTrack {
  id: string
  mtime: number | null
  size: number | null
  lyricMtime: number | null
}

export function loadExistingByPath(): Map<string, ExistingTrack> {
  const rows = getDb()
    .prepare(
      "SELECT id, path, file_mtime, size, lyric_mtime FROM tracks WHERE kind = 'local' AND path IS NOT NULL"
    )
    .all() as {
    id: string
    path: string
    file_mtime: number | null
    size: number | null
    lyric_mtime: number | null
  }[]

  const map = new Map<string, ExistingTrack>()
  for (const row of rows) {
    map.set(row.path, {
      id: row.id,
      mtime: row.file_mtime,
      size: row.size,
      lyricMtime: row.lyric_mtime
    })
  }
  return map
}

export interface UpsertTrackInput {
  id: string
  title: string
  artist: string | null
  album: string | null
  albumArtist: string | null
  durationMs: number | null
  trackNo: number | null
  discNo: number | null
  year: number | null
  genre: string | null
  path: string
  format: string | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  size: number | null
  mtime: number | null
  coverPath: string | null
  lyric: string | null
  lyricMtime: number | null
}

const UPSERT_SQL = `
INSERT INTO tracks (
  id, kind, title, artist, album, album_artist, duration_ms, track_no, disc_no, year, genre,
  path, format, bitrate, sample_rate, channels, size, file_mtime, cover_path, lyric, lyric_mtime,
  created_at, updated_at
) VALUES (
  @id, 'local', @title, @artist, @album, @albumArtist, @durationMs, @trackNo, @discNo, @year, @genre,
  @path, @format, @bitrate, @sampleRate, @channels, @size, @mtime, @coverPath, @lyric, @lyricMtime,
  @now, @now
)
ON CONFLICT(path) DO UPDATE SET
  title = excluded.title,
  artist = excluded.artist,
  album = excluded.album,
  album_artist = excluded.album_artist,
  duration_ms = excluded.duration_ms,
  track_no = excluded.track_no,
  disc_no = excluded.disc_no,
  year = excluded.year,
  genre = excluded.genre,
  format = excluded.format,
  bitrate = excluded.bitrate,
  sample_rate = excluded.sample_rate,
  channels = excluded.channels,
  size = excluded.size,
  file_mtime = excluded.file_mtime,
  cover_path = COALESCE(excluded.cover_path, tracks.cover_path),
  lyric = COALESCE(excluded.lyric, tracks.lyric),
  lyric_mtime = excluded.lyric_mtime,
  updated_at = excluded.updated_at
`

export function upsertTracks(inputs: UpsertTrackInput[]): void {
  if (inputs.length === 0) return
  const db = getDb()
  const statement = db.prepare(UPSERT_SQL)
  const now = Date.now()
  db.transaction((batch: UpsertTrackInput[]) => {
    for (const input of batch) statement.run({ ...input, now })
  })(inputs)
}

export function getLibraryStats(roots: string[]): LibraryStats {
  const row = getDb()
    .prepare(
      'SELECT COUNT(*) AS tracks, COUNT(DISTINCT artist) AS artists, COUNT(DISTINCT album) AS albums,' +
        ' COALESCE(SUM(duration_ms), 0) AS duration, COALESCE(SUM(size), 0) AS size' +
        " FROM tracks WHERE kind = 'local'"
    )
    .get() as { tracks: number; artists: number; albums: number; duration: number; size: number }

  return {
    tracks: row.tracks,
    artists: row.artists,
    albums: row.albums,
    totalDurationMs: row.duration,
    totalSize: row.size,
    roots
  }
}

export function getTrackById(id: string): { id: string; path: string; coverPath: string | null } | null {
  const row = getDb().prepare('SELECT id, path, cover_path FROM tracks WHERE id = ?').get(id) as
    | { id: string; path: string | null; cover_path: string | null }
    | undefined
  if (!row || !row.path) return null
  return { id: row.id, path: row.path, coverPath: row.cover_path }
}

export interface RemoteTrackInput {
  id: string
  provider: string
  providerKey: string
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  coverUrl: string | null
}

/** 平台歌单导入的曲目：只写元数据，播放时再向音源要流地址 */
export function upsertRemoteTracks(items: RemoteTrackInput[]): number {
  if (items.length === 0) return 0
  const db = getDb()
  const statement = db.prepare(
    'INSERT OR IGNORE INTO tracks (id, kind, title, artist, album, duration_ms, provider, provider_key, cover_url, created_at, updated_at)' +
      ' VALUES (@id, \'remote\', @title, @artist, @album, @durationMs, @provider, @providerKey, @coverUrl, @now, @now)'
  )
  const now = Date.now()
  let inserted = 0
  db.transaction((batch: RemoteTrackInput[]) => {
    for (const item of batch) inserted += statement.run({ ...item, now }).changes
  })(items)
  return inserted
}

export function getTrackLyric(id: string): { lrc: string | null; title: string } | null {
  const row = getDb().prepare('SELECT title, lyric FROM tracks WHERE id = ?').get(id) as
    | { title: string; lyric: string | null }
    | undefined
  if (!row) return null
  return { lrc: row.lyric, title: row.title }
}

export function deleteTracks(ids: string[]): void {
  if (ids.length === 0) return
  const db = getDb()
  const statement = db.prepare('DELETE FROM tracks WHERE id = ?')
  db.transaction((batch: string[]) => batch.forEach((id) => statement.run(id)))(ids)
}

export function setFavorite(ids: string[], favorite: boolean): void {
  if (ids.length === 0) return
  const db = getDb()
  const statement = db.prepare('UPDATE tracks SET favorite = ?, updated_at = ? WHERE id = ?')
  const now = Date.now()
  db.transaction((batch: string[]) =>
    batch.forEach((id) => statement.run(favorite ? 1 : 0, now, id))
  )(ids)
}

export function pruneMissingTracks(existingPaths: Set<string>): number {
  const rows = getDb().prepare("SELECT id, path FROM tracks WHERE kind = 'local'").all() as {
    id: string
    path: string | null
  }[]
  const stale = rows.filter((row) => row.path && !existingPaths.has(row.path))
  if (stale.length === 0) return 0
  const db = getDb()
  const statement = db.prepare('DELETE FROM tracks WHERE id = ?')
  db.transaction((ids: string[]) => ids.forEach((id) => statement.run(id)))(stale.map((row) => row.id))
  return stale.length
}