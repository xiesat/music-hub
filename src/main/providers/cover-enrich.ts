// 本地曲目没有内嵌封面时，按 标题+艺人 在线找一张，下载到本地缓存并写回库
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDb } from '../db'
import { httpRequest } from './http'
import { searchProvider } from './index'

interface MissingRow {
  id: string
  title: string
  artist: string | null
  album: string | null
  cover_path: string | null
}

function coverDir(): string {
  const dir = join(app.getPath('userData'), 'covers')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function downloadCover(url: string, key: string): Promise<string | null> {
  try {
    const response = await httpRequest(url, { timeoutMs: 20_000 })
    if (!response.ok) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength < 512) return null

    const hash = createHash('sha1').update(key).digest('hex').slice(0, 20)
    const file = join(coverDir(), hash + '.jpg')
    fs.writeFileSync(file, buffer)
    return file
  } catch {
    return null
  }
}

/** 同一张专辑已补过封面就直接复用，避免重复请求 */
function existingAlbumCover(album: string): string | null {
  const row = getDb()
    .prepare(
      "SELECT cover_path FROM tracks WHERE album = ? AND cover_path IS NOT NULL LIMIT 1"
    )
    .get(album) as { cover_path: string } | undefined
  if (!row?.cover_path) return null
  return fs.existsSync(row.cover_path) ? row.cover_path : null
}

/** 只补缺失字段，不覆盖用户已有标签 */
function assignMeta(
  track: MissingRow,
  coverPath: string | null,
  artist: string | null,
  album: string | null
): void {
  const db = getDb()
  const sets: string[] = ['updated_at = ?']
  const params: unknown[] = [Date.now()]

  if (coverPath) {
    sets.push('cover_path = ?')
    params.push(coverPath)
  }
  if (!track.artist && artist) {
    sets.push('artist = ?')
    params.push(artist)
  }
  if ((!track.album || track.album === '未知专辑') && album && album !== '未知专辑') {
    sets.push('album = ?')
    params.push(album)
  }

  params.push(track.id)
  db.prepare('UPDATE tracks SET ' + sets.join(', ') + ' WHERE id = ?').run(...params)
}

function assignCover(track: MissingRow, coverPath: string): void {
  const db = getDb()
  if (track.album) {
    db.prepare(
      "UPDATE tracks SET cover_path = ?, updated_at = ? WHERE album = ? AND cover_path IS NULL"
    ).run(coverPath, Date.now(), track.album)
  } else {
    db.prepare('UPDATE tracks SET cover_path = ?, updated_at = ? WHERE id = ?').run(
      coverPath,
      Date.now(),
      track.id
    )
  }
}

export interface CoverEnrichResult {
  checked: number
  filled: number
}

export async function enrichMissingCovers(
  limit = 20,
  providerId = 'netease'
): Promise<CoverEnrichResult> {
  const db = getDb()
  const rows = db
    .prepare(
      "SELECT id, title, artist, album, cover_path FROM tracks WHERE kind = 'local'" +
        " AND (cover_path IS NULL OR artist IS NULL OR artist = ''" +
        " OR album IS NULL OR album = '' OR album = '未知专辑')" +
        ' ORDER BY created_at ASC LIMIT ?'
    )
    .all(limit) as MissingRow[]

  let filled = 0
  for (const row of rows) {
    if (row.album) {
      const cached = existingAlbumCover(row.album)
      if (cached && !row.cover_path) {
        assignCover(row, cached)
        filled += 1
        continue
      }
    }

    try {
      const keyword = [row.title, row.artist].filter(Boolean).join(' ')
      const page = await searchProvider(providerId, keyword, 1)
      const normalized = row.title.replace(/\s+/g, '').toLowerCase()
      const best =
        page.items.find((item) => item.title.replace(/\s+/g, '').toLowerCase() === normalized) ??
        page.items[0]
      if (!best) continue

      const coverPath = row.cover_path
        ? row.cover_path
        : best.coverUrl
          ? await downloadCover(best.coverUrl, row.album || row.title)
          : null

      const nextArtist = row.artist || best.artist || null
      const nextAlbum = row.album && row.album !== '未知专辑' ? row.album : (best.album ?? null)

      const changed = Boolean(coverPath && coverPath !== row.cover_path)
      const metaChanged =
        (!row.artist && nextArtist) || ((!row.album || row.album === '未知专辑') && nextAlbum)
      if (!changed && !metaChanged) continue

      assignMeta(row, changed ? coverPath : null, nextArtist, nextAlbum)
      filled += 1
    } catch {
      /* 单曲失败不影响其它曲目 */
    }
  }

  return { checked: rows.length, filled }
}