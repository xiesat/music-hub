import { app, ipcMain } from 'electron'
import type { AppInfo } from '@shared/types'
import { getDbStats } from './db'

export function registerIpc(): void {
  ipcMain.handle('app:info', (): AppInfo => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      node: process.versions.node,
      chrome: process.versions.chrome ?? 'unknown',
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
      isDev: !app.isPackaged
    }
  })

  ipcMain.handle('db:stats', () => getDbStats())
}
