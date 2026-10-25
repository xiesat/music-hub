import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { Compass, ListMusic, Plug, Search } from 'lucide-react'
import type { AppInfo, DbStats } from '@shared/types'
import { InfoPanel } from './components/InfoPanel'
import { LibraryView } from './components/LibraryView'
import { LyricsView } from './components/LyricsView'
import { PlaylistView } from './components/PlaylistView'
import { QueuePanel } from './components/QueuePanel'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar, type ViewId } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { hydratePlayer, savePlayerState } from './stores/player'
import { useUi } from './stores/ui'

const VIEW_META: Record<ViewId, { title: string; desc: string }> = {
  discover: { title: '发现音乐', desc: '接入音源后，这里会展示多平台搜索结果' },
  library: { title: '本地曲库', desc: '扫描、搜索与管理本地音乐文件' },
  playlists: { title: '歌单', desc: '创建、编辑与排序你的歌单' },
  downloads: { title: '下载管理', desc: '下载队列、进度与失败重试' },
  providers: { title: '音源插件', desc: '导入 LX / MusicFree 音源脚本并管理健康状态' },
  settings: { title: '设置', desc: '下载目录、命名模板、代理与外观' }
}

export default function App(): JSX.Element {
  const [view, setView] = useState<ViewId>('library')
  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const queueOpen = useUi((state) => state.queueOpen)
  const [app, setApp] = useState<AppInfo | null>(null)
  const [db, setDb] = useState<DbStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 启动时恢复上次的播放器状态（音量、模式、队列、进度）
  useEffect(() => {
    void hydratePlayer()
  }, [])

  // 退出前落盘一次，避免防抖窗口内丢状态
  useEffect(() => {
    const flush = (): void => savePlayerState()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])

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
        <Sidebar
          active={view}
          activePlaylistId={playlistId}
          onChange={setView}
          onSelectPlaylist={(id) => {
            setPlaylistId(id)
            setView('playlists')
          }}
          version={app?.version ?? '0.1.0'}
        />

        <main
          className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-200"
          style={{ marginRight: queueOpen ? 360 : 0 }}
        >
          <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
            <div className="min-w-0">
              <h1 className="text-[15px] font-medium text-white">{meta.title}</h1>
              <p className="mt-0.5 text-[12px] text-ink-400">{meta.desc}</p>
            </div>
          </div>

          {view === 'playlists' && playlistId ? (
            <PlaylistView key={playlistId} playlistId={playlistId} />
          ) : view === 'library' ? (
            <LibraryView />
          ) : view === 'discover' ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <InfoPanel app={app} db={db} error={error} />
              <section className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border border-white/5 bg-ink-850/40 px-4 py-16 text-center">
                <Compass size={22} className="text-ink-400" />
                <p className="text-[13px] text-ink-300">多平台搜索尚未接入</p>
                <p className="max-w-[460px] text-[12px] leading-relaxed text-ink-400">
                  M3 阶段将接入音源沙箱与首个音源。当前 M1 已完成本地曲库扫描、标签解析与播放器内核。
                </p>
              </section>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
              {view === 'playlists' ? (
                <ListMusic size={22} className="text-ink-400" />
              ) : view === 'providers' ? (
                <Plug size={22} className="text-ink-400" />
              ) : (
                <Search size={22} className="text-ink-400" />
              )}
              <p className="text-[13px] text-ink-300">{meta.title}将在后续里程碑实现</p>
              <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
                详见项目 README 的路线图（M2 歌单、M3 音源、M4 插件、M5 打磨）。
              </p>
            </div>
          )}
        </main>
      </div>

      <PlayerBar />
      <LyricsView />
      <QueuePanel />
    </div>
  )
}