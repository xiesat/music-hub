import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppInfo,
  DbStats,
  LibraryApi,
  LibraryStats,
  ScanProgress,
  TrackPage,
  TrackQuery
} from '@shared/types'

const library: LibraryApi = {
  pickFolder: (): Promise<string[]> => ipcRenderer.invoke('library:pick-folder'),
  scan: (): Promise<ScanProgress> => ipcRenderer.invoke('library:scan'),
  list: (query: TrackQuery): Promise<TrackPage> => ipcRenderer.invoke('library:list', query),
  stats: (): Promise<LibraryStats> => ipcRenderer.invoke('library:stats'),
  removeTrack: (id: string): Promise<void> => ipcRenderer.invoke('library:remove', id),
  onScanProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
    const handler = (_event: unknown, progress: ScanProgress): void => listener(progress)
    ipcRenderer.on('library:scan-progress', handler)
    return () => {
      ipcRenderer.removeListener('library:scan-progress', handler)
    }
  }
}

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  getDbStats: (): Promise<DbStats> => ipcRenderer.invoke('db:stats'),
  library
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(globalThis as unknown as { api: typeof api }).api = api
}

export type MusicHubApi = typeof api
