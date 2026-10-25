import { getDb } from './db'

export function getSetting<T>(key: string, fallback: T): T {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string | null }
      | undefined
    if (!row || row.value === null) return fallback
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

export const LIBRARY_ROOTS_KEY = 'library.roots'

export function getLibraryRoots(): string[] {
  return getSetting<string[]>(LIBRARY_ROOTS_KEY, [])
}

export function setLibraryRoots(roots: string[]): void {
  setSetting(LIBRARY_ROOTS_KEY, Array.from(new Set(roots)))
}
