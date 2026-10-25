// 界面截图：启动真实窗口，等渲染完成后截图存盘再退出。
// 用法：electron . --shot   （可用 MUSIC_HUB_SHOT_OUT 指定输出路径）
import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export async function captureWindow(win: BrowserWindow): Promise<void> {
  const out = process.env.MUSIC_HUB_SHOT_OUT ?? resolve(process.cwd(), 'screenshot.png')

  try {
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('渲染进程加载超时')), 30_000)
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer)
        done()
      })
    })

    win.showInactive()
    await new Promise((done) => setTimeout(done, 1200))

    // 可选：截图前执行一段脚本（模拟点击、滚动等），便于做 UI 自检
    const inject = process.env.MUSIC_HUB_SHOT_JS
    if (inject) {
      await win.webContents.executeJavaScript(inject)
      await new Promise((done) => setTimeout(done, 600))
    }

    await new Promise((done) => setTimeout(done, 300))

    const image = await win.webContents.capturePage()
    writeFileSync(out, image.toPNG())
    console.log('screenshot saved:', out)
    app.exit(0)
  } catch (error) {
    console.error('screenshot failed:', (error as Error).message)
    app.exit(1)
  }
}