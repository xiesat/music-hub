import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { closeDb } from './db'
import { registerIpc } from './ipc'
import { setProgressSink } from './library'
import { getSetting, setSetting } from './settings'
import { registerMediaProtocol, registerMediaScheme } from './media-protocol'
import { captureWindow } from './screenshot'
import { runSmokeTest } from './smoke'

app.setName('MusicHub')

// 测试隔离：允许用环境变量覆盖 userData 目录
const customUserData = process.env.MUSIC_HUB_USER_DATA
if (customUserData) app.setPath('userData', customUserData)

const isSmoke = process.argv.includes('--smoke')
const isShot = process.argv.includes('--shot')

// 必须在 app ready 之前注册自定义协议
registerMediaScheme()

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

  // 恢复上次的窗口位置与大小（离屏时不采用）
  const savedBounds = getSetting<{ x: number; y: number; width: number; height: number } | null>(
    'window.bounds',
    null
  )
  if (savedBounds) {
    const { screen } = require('electron') as typeof import('electron')
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea
      return (
        savedBounds.x < area.x + area.width &&
        savedBounds.x + savedBounds.width > area.x &&
        savedBounds.y < area.y + area.height &&
        savedBounds.y + savedBounds.height > area.y
      )
    })
    if (visible) win.setBounds(savedBounds)
  }

  win.on('close', () => {
    const bounds = win.getNormalBounds()
    setSetting('window.bounds', bounds)
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
  registerMediaProtocol()

  // 扫描进度广播给所有窗口
  setProgressSink((progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('library:scan-progress', progress)
    }
  })

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