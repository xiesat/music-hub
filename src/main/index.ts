import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDb } from './db'
import { registerIpc } from './ipc'
import { captureWindow } from './screenshot'
import { runSmokeTest } from './smoke'

app.setName('MusicHub')

const isSmoke = process.argv.includes('--smoke')
const isShot = process.argv.includes('--shot')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0a0f', symbolColor: '#b9b9c6', height: 44 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    if (!isSmoke && !isShot) win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

void app.whenReady().then(async () => {
  registerIpc()
  const win = createWindow()

  if (isSmoke) {
    await runSmokeTest(win)
    return
  }

  if (isShot) {
    await captureWindow(win)
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})