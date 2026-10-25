import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { AppInfo } from '@shared/types'
import { getDbStats } from './db'
import {
  addRoots,
  deleteTrack,
  getLibraryRoots,
  getLibraryStats,
  listTracks,
  scanLibrary
} from './library'

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

  ipcMain.handle('library:pick-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '选择音乐目录',
      properties: ['openDirectory', 'multiSelections']
    })
    if (result.canceled) return []
    return addRoots(result.filePaths)
  })

  ipcMain.handle('library:scan', () => scanLibrary())
  ipcMain.handle('library:list', (_event, query) => listTracks(query))
  ipcMain.handle('library:stats', () => getLibraryStats(getLibraryRoots()))
  ipcMain.handle('library:remove', (_event, id: string) => {
    deleteTrack(id)
  })
}
