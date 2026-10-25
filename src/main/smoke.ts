// 冒烟测试：无人值守启动真实窗口，跑一遍 IPC + 数据库 + 曲库 + 音频协议链路。
// 用法：electron . --smoke
//   MUSIC_HUB_SMOKE_OUT   结果输出路径
//   MUSIC_HUB_FIXTURES    指定后追加执行「入库 → 查询 → 音频协议」检查
import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { addRoots, getLibraryRoots, listTracks, scanLibrary } from './library'

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
    )) as Record<string, unknown>

    Object.assign(result, payload)

    // 调试钩子：在渲染进程里执行一段脚本，结果写入 smoke.json
    const evalScript = process.env.MUSIC_HUB_EVAL
    if (evalScript) {
      result.eval = await win.webContents.executeJavaScript(evalScript)
    }

    const fixtures = process.env.MUSIC_HUB_FIXTURES
    if (fixtures) {
      const library = await runLibraryChecks(fixtures)
      result.library = library
      result.audio = await runAudioChecks(win, library)
      result.mutations = await runMutationChecks(win, library)
    }

    result.ok = true
  } catch (error) {
    result.error = (error as Error).message
  }

  writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8')
  app.exit(result.ok ? 0 : 1)
}

interface LibraryReport {
  total: number
  roots: string[]
  firstScan: Record<string, unknown>
  secondScan: Record<string, unknown>
  withDuration: number
  tagged: number
  sample: unknown[]
  firstTrackId: string | null
  sampleIds: string[]
}

async function runLibraryChecks(fixtures: string): Promise<LibraryReport> {
  addRoots([fixtures])

  const first = await scanLibrary()
  const second = await scanLibrary()

  const page = listTracks({ sort: 'title', order: 'asc', offset: 0, limit: 50 })

  return {
    total: page.total,
    roots: getLibraryRoots(),
    firstScan: {
      phase: first.phase,
      added: first.added,
      skipped: first.skipped,
      failed: first.failed,
      error: first.error ?? null
    },
    secondScan: {
      phase: second.phase,
      added: second.added,
      skipped: second.skipped,
      failed: second.failed,
      error: second.error ?? null
    },
    withDuration: page.items.filter((item) => (item.durationMs ?? 0) > 0).length,
    tagged: page.items.filter((item) => item.artist && item.album).length,
    sample: page.items.slice(0, 5).map((item) => ({
      title: item.title,
      artist: item.artist,
      album: item.album,
      durationMs: item.durationMs,
      format: item.format
    })),
    firstTrackId: page.items[0]?.id ?? null,
    sampleIds: page.items.map((item) => item.id)
  }
}

/** 通过 preload 桥验证收藏 / 批量移除，确保 IPC 契约端到端可用 */
async function runMutationChecks(
  win: BrowserWindow,
  library: LibraryReport
): Promise<Record<string, unknown>> {
  const ids = library.sampleIds
  if (ids.length < 2) return { skipped: '样本不足' }

  const script = `(async () => {
    const ids = ${JSON.stringify(ids.slice(0, 2))}
    const api = window.api
    await api.library.setFavorite(ids, true)
    const afterFavorite = await api.library.list({ offset: 0, limit: 50 })
    const favorited = afterFavorite.items.filter((item) => ids.includes(item.id) && item.favorite).length

    await api.library.setFavorite(ids, false)
    const afterUnfavorite = await api.library.list({ offset: 0, limit: 50 })
    const stillFavorite = afterUnfavorite.items.filter((item) => ids.includes(item.id) && item.favorite).length

    const before = afterUnfavorite.total
    await api.library.removeTracks([ids[0]])
    const afterRemove = await api.library.list({ offset: 0, limit: 50 })

    return {
      favorited,
      stillFavorite,
      totalBefore: before,
      totalAfter: afterRemove.total,
      uiApi: typeof api.ui.showTrackMenu
    }
  })()`

  return win.webContents.executeJavaScript(script)
}

async function runAudioChecks(
  win: BrowserWindow,
  library: LibraryReport
): Promise<Record<string, unknown>> {
  if (!library.firstTrackId) return { skipped: '曲库为空' }
  const url = 'media://track/' + encodeURIComponent(library.firstTrackId)

  const script = `(async () => {
    const url = ${JSON.stringify(url)}
    const out = {}
    try {
      const plain = await fetch(url)
      out.plain = { status: plain.status, type: plain.headers.get('content-type'), length: (await plain.arrayBuffer()).byteLength }
    } catch (error) { out.plainError = String(error) }
    try {
      const ranged = await fetch(url, { headers: { Range: 'bytes=0-1023' } })
      out.ranged = { status: ranged.status, range: ranged.headers.get('content-range'), length: (await ranged.arrayBuffer()).byteLength }
    } catch (error) { out.rangedError = String(error) }
    try {
      out.mediaElement = await new Promise((resolve) => {
        const el = new Audio(url)
        const timer = setTimeout(() => resolve('timeout'), 8000)
        el.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve('metadata duration=' + el.duration) })
        el.addEventListener('error', () => { clearTimeout(timer); resolve('error code=' + (el.error ? el.error.code : '?')) })
      })
    } catch (error) { out.mediaElementError = String(error) }
    return out
  })()`

  return win.webContents.executeJavaScript(script)
}