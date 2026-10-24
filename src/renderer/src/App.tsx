import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { FolderPlus, Search } from 'lucide-react'
import type { AppInfo, DbStats } from '@shared/types'
import { InfoPanel } from './components/InfoPanel'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar, type ViewId } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'

const VIEW_META: Record<ViewId, { title: string; desc: string }> = {
  discover: { title: '发现音乐', desc: '接入音源后，这里会展示多平台搜索结果' },
  library: { title: '本地曲库', desc: '扫描并管理本地音乐文件' },
  playlists: { title: '歌单', desc: '创建、编辑与排序你的歌单' },
  downloads: { title: '下载管理', desc: '下载队列、进度与失败重试' },
  providers: { title: '音源插件', desc: '导入 LX / MusicFree 音源脚本并管理健康状态' },
  settings: { title: '设置', desc: '下载目录、命名模板、代理与外观' }
}

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewId>('discover')
  const [app, setApp] = useState<AppInfo | null>(null)
  const [db, setDb] = useState<DbStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [info, stats] = await Promise.all([window.api.getAppInfo(), window.api.getDbStats()])
        if (!alive) return
        setApp(info)
        setDb(stats)
      } catch (err) {
        if (alive) setError((err as Error).message)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const meta = VIEW_META[view]

  return (
    <div className="flex h-full flex-col bg-ink-900 text-ink-50">
      <TitleBar />

      <div className="flex min-h-0 flex-1">
        <Sidebar active={view} onChange={setView} version={app?.version ?? '0.1.0'} />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium text-white">{meta.title}</h1>
              <p className="mt-0.5 text-[12px] text-ink-400">{meta.desc}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <label className="no-drag flex h-9 w-[260px] items-center gap-2 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-400 focus-within:border-brand-500/60">
                <Search size={14} />
                <input
                  className="h-full w-full bg-transparent text-ink-100 outline-none placeholder:text-ink-400"
                  placeholder="搜索歌曲、歌手、专辑"
                  disabled
                />
              </label>
              <button className="no-drag flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400">
                <FolderPlus size={14} />
                导入目录
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <InfoPanel app={app} db={db} error={error} />

            <section className="mt-5 rounded-xl border border-white/5 bg-ink-850/40">
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <span className="text-[12px] font-medium text-ink-200">曲库</span>
                <span className="text-[11px] text-ink-400">0 首</span>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                <p className="text-[13px] text-ink-300">曲库还是空的</p>
                <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
                  M1 阶段将实现目录扫描、标签解析与入库。当前 M0 已跑通 Electron 主进程、IPC 桥与 SQLite 数据库。
                </p>
              </div>
            </section>
          </div>
        </main>
      </div>

      <PlayerBar />
    </div>
  )
}
