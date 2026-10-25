// 主进程 / 预加载 / 渲染进程共用的类型（唯一真源）

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  chrome: string
  platform: string
  arch: string
  userDataPath: string
  isDev: boolean
}

export interface TableStat {
  name: string
  rows: number
}

export interface DbStats {
  path: string
  sizeBytes: number
  schemaVersion: number
  tables: TableStat[]
}

export interface Track {
  id: string
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  format: string | null
  bitrate: number | null
  size: number | null
  path: string | null
  coverPath: string | null
  favorite: boolean
  playCount: number
  createdAt: number
}

export type TrackSort = 'title' | 'artist' | 'album' | 'addedAt' | 'duration'

export interface TrackQuery {
  keyword?: string
  sort?: TrackSort
  order?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export interface TrackPage {
  items: Track[]
  total: number
}

export type ScanPhase = 'idle' | 'walking' | 'parsing' | 'done' | 'error'

export interface ScanProgress {
  phase: ScanPhase
  scanned: number
  total: number
  current: string | null
  added: number
  updated: number
  skipped: number
  failed: number
  error?: string
}

export interface LibraryStats {
  tracks: number
  artists: number
  albums: number
  totalDurationMs: number
  totalSize: number
  roots: string[]
}

export interface LibraryApi {
  pickFolder(): Promise<string[]>
  scan(): Promise<ScanProgress>
  list(query: TrackQuery): Promise<TrackPage>
  stats(): Promise<LibraryStats>
  removeTrack(id: string): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}

export interface IpcApi {
  getAppInfo(): Promise<AppInfo>
  getDbStats(): Promise<DbStats>
  library: LibraryApi
}
