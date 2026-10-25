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

/** 右键菜单点击后回传给渲染进程的动作 */
export type TrackMenuAction =
  | 'play'
  | 'play-next'
  | 'append-queue'
  | 'favorite'
  | 'unfavorite'
  | 'remove'

export interface TrackMenuPayload {
  ids: string[]
  favorite: boolean
}

export interface TrackMenuResult {
  action: TrackMenuAction
  ids: string[]
}

export interface LibraryApi {
  pickFolder(): Promise<string[]>
  scan(): Promise<ScanProgress>
  list(query: TrackQuery): Promise<TrackPage>
  stats(): Promise<LibraryStats>
  removeTrack(id: string): Promise<void>
  removeTracks(ids: string[]): Promise<void>
  setFavorite(ids: string[], favorite: boolean): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}

export interface UiApi {
  /** 弹出原生右键菜单；返回 null 表示用户取消 */
  showTrackMenu(payload: TrackMenuPayload): Promise<TrackMenuAction | null>
  /** 在资源管理器中定位文件 */
  revealInFolder(path: string): Promise<void>
}

export interface SettingsApi {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

/** 退出时持久化的播放器状态 */
export interface PlayerSnapshot {
  volume: number
  muted: boolean
  mode: 'sequence' | 'loop' | 'single' | 'shuffle'
  queue: Track[]
  index: number
  positionMs: number
}

export interface IpcApi {
  getAppInfo(): Promise<AppInfo>
  getDbStats(): Promise<DbStats>
  library: LibraryApi
  ui: UiApi
  settings: SettingsApi
}