import fs from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { AppInfo, TrackMenuPayload } from '@shared/types'
import { getDbStats } from './db'
import {
  addRoots,
  deleteTracks,
  getLibraryRoots,
  getLibraryStats,
  getTrackById,
  favoriteRemoteTrack,
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
import {
  cancelDownload,
  getDownloadDir,
  setDownloadDir,
  clearFinished,
  enqueueDownload,
  listDownloads,
  retryDownload,
  revealDownload
} from './downloads'
import { enrichMissingCovers } from './providers/cover-enrich'
import {
  downloadRemoteTrack,
  getProviderAuthState,
  importScriptProvider,
  loginScriptProvider,
  logoutScriptProvider,
  removeScriptProvider,
  listProviders,
  lyricProvider,
  onlineLyric,
  searchProvider,
  searchAllProviders,
  streamProvider,
  toggleProvider
} from './providers'
import { importPlatformPlaylist, listPlatformPlaylists } from './providers/playlist-import'
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

  ipcMain.handle('downloads:list', () => listDownloads())
  ipcMain.handle('downloads:add', (_event, input) => enqueueDownload(input))
  ipcMain.handle('downloads:cancel', (_event, id: string) => {
    cancelDownload(id)
  })
  ipcMain.handle('downloads:retry', (_event, id: string) => {
    retryDownload(id)
  })
  ipcMain.handle('downloads:clear', () => {
    clearFinished()
  })
  ipcMain.handle('downloads:dir', () => getDownloadDir())
  ipcMain.handle('downloads:pick-dir', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: '选择下载目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return getDownloadDir()
    return setDownloadDir(result.filePaths[0])
  })
  ipcMain.handle('downloads:set-dir', (_event, path: string) => {
    const target = String(path ?? '').trim()
    if (!target) throw new Error('目录不能为空')
    fs.mkdirSync(target, { recursive: true })
    return setDownloadDir(target)
  })

  ipcMain.handle('downloads:reset-dir', () => setDownloadDir(''))
  ipcMain.handle('downloads:open-dir', async () => {
    await shell.openPath(getDownloadDir())
  })

  ipcMain.handle('downloads:reveal', (_event, id: string) => {
    revealDownload(id)
  })

  ipcMain.handle('library:enrich-covers', (_event, limit?: number) =>
    enrichMissingCovers(limit ?? 30)
  )

  ipcMain.handle('library:favorite-remote', (_event, track) => {
    favoriteRemoteTrack(track)
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

  ipcMain.handle('providers:import-script', async (_event, filePath?: string) => {
    let target = filePath
    if (!target) {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const picked = await dialog.showOpenDialog(win, {
        title: '选择音源脚本',
        properties: ['openFile'],
        filters: [{ name: '音源脚本', extensions: ['js'] }]
      })
      if (picked.canceled || picked.filePaths.length === 0) return null
      target = picked.filePaths[0]
    }
    return importScriptProvider(target)
  })

  ipcMain.handle('providers:remove-script', (_event, id: string) => {
    removeScriptProvider(id)
  })

  ipcMain.handle('providers:auth-state', (_event, id: string) => getProviderAuthState(id))
  ipcMain.handle('providers:login', (_event, id: string) => loginScriptProvider(id))
  ipcMain.handle('providers:logout', (_event, id: string) => {
    logoutScriptProvider(id)
  })

  ipcMain.handle('providers:list', () => listProviders())
  ipcMain.handle('providers:toggle', (_event, id: string, enabled: boolean) => {
    toggleProvider(id, enabled)
  })
  ipcMain.handle('providers:search', (_event, id: string, keyword: string, page: number) =>
    searchProvider(id, keyword, page)
  )
  ipcMain.handle('providers:search-all', (_event, keyword: string, page: number) =>
    searchAllProviders(keyword, page)
  )
  ipcMain.handle(
    'providers:stream',
    (_event, id: string, key: string, meta?: { title?: string; artist?: string | null }) =>
      streamProvider(id, key, meta)
  )
  ipcMain.handle('providers:lyric', (_event, id: string, key: string) => lyricProvider(id, key))
  ipcMain.handle('providers:online-lyric', (_event, title: string, artist: string | null) =>
    onlineLyric(title, artist)
  )
  ipcMain.handle(
    'providers:download',
    async (event, id: string, key: string, title: string, artist: string) => {
      return downloadRemoteTrack(id, key, title, artist, (received, total) => {
        event.sender.send('providers:download-progress', { key, received, total })
      })
    }
  )

  ipcMain.handle('playlists:platform-list', (_event, platform: 'netease' | 'qq', uid: string) =>
    listPlatformPlaylists(platform, uid)
  )
  ipcMain.handle(
    'playlists:platform-import',
    (_event, platform: 'netease' | 'qq', id: string) => importPlatformPlaylist(platform, id)
  )

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