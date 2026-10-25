import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  DbStats,
  LibraryApi,
  LibraryStats,
  ScanProgress,
  TrackMenuAction,
  TrackMenuPayload,
  TrackPage,
  SettingsApi,
  TrackQuery,
  UiApi
} from '@shared/types'

const library: LibraryApi = {
  pickFolder: (): Promise<string[]> => ipcRenderer.invoke('library:pick-folder'),
  scan: (): Promise<ScanProgress> => ipcRenderer.invoke('library:scan'),
  list: (query: TrackQuery): Promise<TrackPage> => ipcRenderer.invoke('library:list', query),
  stats: (): Promise<LibraryStats> => ipcRenderer.invoke('library:stats'),
  removeTrack: (id: string): Promise<void> => ipcRenderer.invoke('library:remove', id),
  removeTracks: (ids: string[]): Promise<void> => ipcRenderer.invoke('library:remove-many', ids),
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
  showTrackMenu: (payload: TrackMenuPayload): Promise<TrackMenuAction | null> =>
    ipcRenderer.invoke('ui:track-menu', payload),
  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('ui:reveal', path)
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
  settings
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(globalThis as unknown as { api: typeof api }).api = api
}

export type MusicHubApi = typeof api