import { contextBridge, ipcRenderer } from 'electron'
import type { AppInfo, DbStats } from '@shared/types'

const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  getDbStats: (): Promise<DbStats> => ipcRenderer.invoke('db:stats')
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // 理论上不会发生：contextIsolation 恒为 true
  ;(globalThis as unknown as { api: typeof api }).api = api
}

export type MusicHubApi = typeof api
