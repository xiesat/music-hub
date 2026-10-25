import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { AppInfo, TrackMenuPayload } from '@shared/types'
import { getDbStats } from './db'
import {
  addRoots,
  deleteTracks,
  getLibraryRoots,
  getLibraryStats,
  getTrackById,
  getTrackLyric,
  listTracks,
  scanLibrary,
  setFavorite
} from './library'
import { getSetting, setSetting } from './settings'
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  listPlaylistTracks,
  listPlaylists,
  removeTracksFromPlaylist,
  renamePlaylist,
  reorderPlaylist
} from './playlists'
import { popupTrackMenu } from './track-menu'

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
    deleteTracks([id])
  })

  ipcMain.handle('library:remove-many', (_event, ids: string[]) => {
    deleteTracks(ids)
  })

  ipcMain.handle('library:lyric', (_event, id: string) => getTrackLyric(id))

  ipcMain.handle('library:set-favorite', (_event, ids: string[], favorite: boolean) => {
    setFavorite(ids, favorite)
  })

  ipcMain.handle('settings:get', (_event, key: string) => getSetting<unknown>(key, null))

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    setSetting(key, value)
  })

  ipcMain.handle('playlists:list', () => listPlaylists())
  ipcMain.handle('playlists:create', (_event, name: string) => createPlaylist(name))
  ipcMain.handle('playlists:rename', (_event, id: string, name: string) => {
    renamePlaylist(id, name)
  })
  ipcMain.handle('playlists:remove', (_event, id: string) => {
    deletePlaylist(id)
  })
  ipcMain.handle('playlists:tracks', (_event, id: string, query) => listPlaylistTracks(id, query))
  ipcMain.handle('playlists:add', (_event, id: string, trackIds: string[]) =>
    addTracksToPlaylist(id, trackIds)
  )
  ipcMain.handle('playlists:remove-tracks', (_event, id: string, trackIds: string[]) => {
    removeTracksFromPlaylist(id, trackIds)
  })
  ipcMain.handle('playlists:reorder', (_event, id: string, orderedTrackIds: string[]) => {
    reorderPlaylist(id, orderedTrackIds)
  })

  ipcMain.handle('ui:reveal', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('ui:track-menu', async (event, payload: TrackMenuPayload) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const first = payload.ids.length === 1 ? getTrackById(payload.ids[0]) : null
    return popupTrackMenu(win, payload, first?.path ?? null, listPlaylists())
  })
}