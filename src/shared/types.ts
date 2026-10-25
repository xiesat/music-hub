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
  /** 在线曲目：直接播放的流地址 */
  streamUrl?: string
  /** 在线曲目：封面外链 */
  coverUrl?: string
  providerId?: string
  providerKey?: string
}

export type TrackSort = 'title' | 'artist' | 'album' | 'addedAt' | 'duration'

export interface TrackQuery {
  keyword?: string
  favoriteOnly?: boolean
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
  | 'add-to-playlist'
  | 'play-next'
  | 'append-queue'
  | 'favorite'
  | 'unfavorite'
  | 'remove'
  | 'download'

export interface TrackMenuPayload {
  ids: string[]
  favorite: boolean
  /** 选中项是否全部是在线曲目（决定「下载到本地」是否可用） */
  canDownload?: boolean
}

export interface TrackMenuResult {
  action: TrackMenuAction
  ids: string[]
  playlistId?: string
}

export interface LibraryApi {
  pickFolder(): Promise<string[]>
  scan(): Promise<ScanProgress>
  list(query: TrackQuery): Promise<TrackPage>
  stats(): Promise<LibraryStats>
  removeTrack(id: string): Promise<void>
  removeTracks(ids: string[]): Promise<void>
  setFavorite(ids: string[], favorite: boolean): Promise<void>
  lyric(id: string): Promise<{ lrc: string | null; title: string } | null>
  enrichCovers(limit?: number): Promise<{ checked: number; filled: number }>
  /** 收藏一首在线曲目（自动落库为远程曲目） */
  favoriteRemote(track: {
    id: string
    provider: string
    providerKey: string
    title: string
    artist: string | null
    album: string | null
    durationMs: number | null
    coverUrl: string | null
  }): Promise<void>
  onScanProgress(listener: (progress: ScanProgress) => void): () => void
}

export interface UiApi {
  /** 弹出原生右键菜单；返回 null 表示用户取消 */
  showTrackMenu(payload: TrackMenuPayload): Promise<TrackMenuResult | null>
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

export interface Playlist {
  id: string
  name: string
  description: string | null
  trackCount: number
  isSystem: boolean
  createdAt: number
  updatedAt: number
}

export interface PlaylistQuery {
  offset?: number
  limit?: number
  keyword?: string
}

export type PlatformId = 'netease' | 'qq'

export interface PlatformAuthStateLike {
  loggedIn: boolean
  uid?: string | null
  nickname?: string | null
}

export interface PlatformPlaylist {
  id: string
  name: string
  trackCount: number
  coverUrl: string | null
  platform: PlatformId
}

export interface PlatformImportResult {
  playlistId: string
  name: string
  imported: number
  total: number
  playable: boolean
}

export interface PlaylistApi {
  list(): Promise<Playlist[]>
  create(name: string): Promise<Playlist>
  rename(id: string, name: string): Promise<void>
  remove(id: string): Promise<void>
  tracks(id: string, query: PlaylistQuery): Promise<TrackPage>
  addTracks(id: string, trackIds: string[]): Promise<number>
  removeTracks(id: string, trackIds: string[]): Promise<void>
  reorder(id: string, orderedTrackIds: string[]): Promise<void>
  listPlatform(platform: PlatformId, uid: string): Promise<PlatformPlaylist[]>
  importPlatform(platform: PlatformId, id: string): Promise<PlatformImportResult>
}

export type DownloadStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface DownloadTask {
  id: string
  title: string
  artist: string
  providerId: string
  providerKey: string
  status: DownloadStatus
  received: number
  total: number
  filePath: string | null
  error: string | null
  createdAt: number
}

export interface DownloadsApi {
  list(): Promise<DownloadTask[]>
  add(input: { title: string; artist: string; providerId: string; providerKey: string }): Promise<DownloadTask>
  cancel(id: string): Promise<void>
  retry(id: string): Promise<void>
  clear(): Promise<void>
  reveal(id: string): Promise<void>
  onProgress(listener: (task: DownloadTask) => void): () => void
}

export interface IpcApi {
  getAppInfo(): Promise<AppInfo>
  getDbStats(): Promise<DbStats>
  library: LibraryApi
  ui: UiApi
  settings: SettingsApi
  playlists: PlaylistApi
  providers: import('./provider').ProviderApi
  downloads: DownloadsApi
}