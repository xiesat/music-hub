// 冒烟测试：无人值守启动真实窗口，跑一遍 IPC + 数据库链路，结果写文件后退出。
// 用法：electron . --smoke  （可用 MUSIC_HUB_SMOKE_OUT 指定输出路径）
import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export async function runSmokeTest(win: BrowserWindow): Promise<void> {
  const out = process.env.MUSIC_HUB_SMOKE_OUT ?? resolve(process.cwd(), 'smoke.json')
  const result: Record<string, unknown> = { ok: false }

  try {
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('渲染进程加载超时')), 30_000)
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer)
        done()
      })
    })

    const payload = (await win.webContents.executeJavaScript(
      `(async () => {
         const app = await window.api.getAppInfo()
         const db = await window.api.getDbStats()
         return { app, db, bridge: typeof window.api === 'object' }
       })()`
    )) as { app: unknown; db: unknown; bridge: boolean }

    Object.assign(result, payload, { ok: true })
  } catch (error) {
    result.error = (error as Error).message
  }

  writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  app.exit(result.ok ? 0 : 1)
}
