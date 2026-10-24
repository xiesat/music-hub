import { app } from 'electron'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { DbStats } from '@shared/types'
import { migrations } from './migrations'

type SqliteDb = Database.Database

let db: SqliteDb | null = null
let dbFilePath = ''

export function getDb(): SqliteDb {
  if (db) return db
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  dbFilePath = join(dir, 'music-hub.db')

  db = new Database(dbFilePath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  migrate(db)
  return db
}

function migrate(database: SqliteDb): void {
  const current = database.pragma('user_version', { simple: true }) as number
  for (let i = current; i < migrations.length; i += 1) {
    database.exec('BEGIN')
    try {
      database.exec(migrations[i])
      database.pragma('user_version = ' + (i + 1))
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw new Error('数据库迁移失败 (v' + (i + 1) + '): ' + (error as Error).message)
    }
  }
}

export function getDbStats(): DbStats {
  const database = getDb()
  const names = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]

  const tables = names.map((row) => {
    const count = database.prepare('SELECT COUNT(*) AS c FROM "' + row.name + '"').get() as { c: number }
    return { name: row.name, rows: count.c }
  })

  return {
    path: dbFilePath,
    sizeBytes: existsSync(dbFilePath) ? statSync(dbFilePath).size : 0,
    schemaVersion: database.pragma('user_version', { simple: true }) as number,
    tables
  }
}

export function closeDb(): void {
  if (!db) return
  try {
    db.close()
  } finally {
    db = null
  }
}
