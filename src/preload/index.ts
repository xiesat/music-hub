import { contextBridge, ipcRenderer } from 'electron'
import type { ProviderApi } from '@shared/provider'
import type {
  AppInfo,
  DbStats,
  LibraryApi,
  LibraryStats,
  ScanProgress,
  TrackMenuPayload,
  TrackMenuResult,
  TrackPage,
  SettingsApi,
  TrackQuery,
  UiApi,
  Playlist,
  PlaylistApi,
  PlaylistQuery
} from '@shared/types'

const library: LibraryApi = {
  pickFolder: (): Promise<string[]> => ipcRenderer.invoke('library:pick-folder'),
  scan: (): Promise<ScanProgress> => ipcRenderer.invoke('library:scan'),
  list: (query: TrackQuery): Promise<TrackPage> => ipcRenderer.invoke('library:list', query),
  stats: (): Promise<LibraryStats> => ipcRenderer.invoke('library:stats'),
  removeTrack: (id: string): Promise<void> => ipcRenderer.invoke('library:remove', id),
  removeTracks: (ids: string[]): Promise<void> => ipcRenderer.invoke('library:remove-many', ids),
  favoriteRemote: (track) => ipcRenderer.invoke('library:favorite-remote', track),
  enrichCovers: (limit?: number): Promise<{ checked: number; filled: number }> =>
    ipcRenderer.invoke('library:enrich-covers', limit),
  lyric: (id: string): Promise<{ lrc: string | null; title: string } | null> =>
    ipcRenderer.invoke('library:lyric', id),
  setFavorite: (ids: string[], favorite: boolean): Promise<void> =>
    ipcRenderer.invoke('library:set-favorite', ids, favorite),
  onScanProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
    const handler = (_event: unknown, progress: ScanProgress): void => listener(progress)
    ipcRenderer.on('library:scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('library:scan-progress', handler)
    }
  }
}

const ui: UiApi = {
  showTrackMenu: (payload: TrackMenuPayload): Promise<TrackMenuResult | null> =>
    ipcRenderer.invoke('ui:track-menu', payload),
  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('ui:reveal', path)
}

const playlists: PlaylistApi = {
  list: (): Promise<Playlist[]> => ipcRenderer.invoke('playlists:list'),
  create: (name: string): Promise<Playlist> => ipcRenderer.invoke('playlists:create', name),
  rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke('playlists:rename', id, name),
  remove: (id: string): Promise<void> => ipcRenderer.invoke('playlists:remove', id),
  tracks: (id: string, query: PlaylistQuery): Promise<TrackPage> =>
    ipcRenderer.invoke('playlists:tracks', id, query),
  addTracks: (id: string, trackIds: string[]): Promise<number> =>
    ipcRenderer.invoke('playlists:add', id, trackIds),
  removeTracks: (id: string, trackIds: string[]): Promise<void> =>
    ipcRenderer.invoke('playlists:remove-tracks', id, trackIds),
  reorder: (id: string, orderedTrackIds: string[]): Promise<void> =>
    ipcRenderer.invoke('playlists:reorder', id, orderedTrackIds),
  listPlatform: (platform, uid) => ipcRenderer.invoke('playlists:platform-list', platform, uid),
  importPlatform: (platform, id) => ipcRenderer.invoke('playlists:platform-import', platform, id)
}

const providers: ProviderApi = {
  list: () => ipcRenderer.invoke('providers:list'),
  toggle: (id: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('providers:toggle', id, enabled),
  search: (providerId: string, keyword: string, page: number) =>
    ipcRenderer.invoke('providers:search', providerId, keyword, page),
  searchAll: (keyword: string, page: number) => ipcRenderer.invoke('providers:search-all', keyword, page),
  stream: (providerId: string, key: string, meta?: { title?: string; artist?: string | null }) =>
    ipcRenderer.invoke('providers:stream', providerId, key, meta),
  lyric: (providerId: string, key: string) => ipcRenderer.invoke('providers:lyric', providerId, key),
  onlineLyric: (title: string, artist: string | null) =>
    ipcRenderer.invoke('providers:online-lyric', title, artist),
  download: (providerId: string, key: string, title: string, artist: string) =>
    ipcRenderer.invoke('providers:download', providerId, key, title, artist),
  importScript: (path?: string) => ipcRenderer.invoke('providers:import-script', path),
  removeScript: (id: string): Promise<void> => ipcRenderer.invoke('providers:remove-script', id),
  onDownloadProgress: (listener: (payload: { key: string; received: number; total: number }) => void) => {
    const handler = (_event: unknown, payload: { key: string; received: number; total: number }): void =>
      listener(payload)
    ipcRenderer.on('providers:download-progress', handler)
    return () => {
      ipcRenderer.removeListener('providers:download-progress', handler)
    }
  }
}

const downloads = {
  list: () => ipcRenderer.invoke('downloads:list'),
  add: (input: { title: string; artist: string; providerId: string; providerKey: string }) =>
    ipcRenderer.invoke('downloads:add', input),
  cancel: (id: string): Promise<void> => ipcRenderer.invoke('downloads:cancel', id),
  retry: (id: string): Promise<void> => ipcRenderer.invoke('downloads:retry', id),
  clear: (): Promise<void> => ipcRenderer.invoke('downloads:clear'),
  reveal: (id: string): Promise<void> => ipcRenderer.invoke('downloads:reveal', id),
  onProgress: (listener: (task: unknown) => void) => {
    const handler = (_event: unknown, task: unknown): void => listener(task)
    ipcRenderer.on('downloads:progress', handler)
    return () => {
      ipcRenderer.removeListener('downloads:progress', handler)
    }
  }
}

const settings: SettingsApi = {
  get: <T>(key: string): Promise<T | null> => ipcRenderer.invoke('settings:get', key),
  set: (key: string, value: unknown): Promise<void> => ipcRenderer.invoke('settings:set', key, value)
}

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  getDbStats: (): Promise<DbStats> => ipcRenderer.invoke('db:stats'),
  library,
  ui,
  settings,
  playlists,
  providers,
  downloads
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(globalThis as unknown as { api: typeof api }).api = api
}

export type MusicHubApi = typeof api