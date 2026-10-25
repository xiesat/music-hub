import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Compass, Download, Heart, Library, ListMusic, Pencil, Plus, Plug, Settings, SquareArrowDown, Trash2 } from 'lucide-react'
import { usePlaylists } from '../stores/playlists'
import { useUi } from '../stores/ui'

export type ViewId = 'discover' | 'library' | 'playlists' | 'downloads' | 'providers' | 'settings'

const NAV: { id: ViewId; label: string; icon: typeof Compass }[] = [
  { id: 'discover', label: '发现音乐', icon: Compass },
  { id: 'library', label: '本地曲库', icon: Library },
  { id: 'downloads', label: '下载管理', icon: Download },
  { id: 'providers', label: '音源插件', icon: Plug },
  { id: 'settings', label: '设置', icon: Settings }
]

interface Props {
  active: ViewId
  activePlaylistId: string | null
  onChange: (id: ViewId) => void
  onSelectPlaylist: (id: string) => void
  version: string
}

export function Sidebar({
  active,
  activePlaylistId,
  onChange,
  onSelectPlaylist,
  version
}: Props): JSX.Element {
  const playlists = usePlaylists((state) => state.items)
  const refresh = usePlaylists((state) => state.refresh)
  const createPlaylist = usePlaylists((state) => state.create)
  const addTracks = usePlaylists((state) => state.addTracks)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const openImport = useUi((state) => state.openImport)
  const setEditing = usePlaylists((state) => state.setEditing)
  const removePlaylist = usePlaylists((state) => state.remove)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (): Promise<void> => {
    const playlist = await createPlaylist('新建歌单')
    onSelectPlaylist(playlist.id)
  }

  const handleDrop = async (event: React.DragEvent, playlistId: string): Promise<void> => {
    event.preventDefault()
    setDropTarget(null)
    const raw = event.dataTransfer.getData('application/x-musichub-tracks')
    if (!raw) return
    try {
      const ids = JSON.parse(raw) as string[]
      if (ids.length > 0) await addTracks(playlistId, ids)
    } catch {
      /* 忽略非法拖拽数据 */
    }
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-white/5 bg-ink-950/60">
      <nav className="flex flex-col gap-1 p-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={[
                "no-drag flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                isActive ? 'bg-white/8 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-ink-50'
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={1.8} className={isActive ? "text-brand-400" : ""} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="flex items-center justify-between px-4 pb-1 pt-2 text-[11px] text-ink-500">
        <span>歌单</span>
        <span className="flex items-center gap-1">
          <button
            onClick={openImport}
            className="text-ink-400 transition-colors hover:text-brand-400"
            title="导入平台歌单"
          >
            <SquareArrowDown size={13} />
          </button>
          <button
            onClick={() => void handleCreate()}
          className="text-ink-400 transition-colors hover:text-brand-400"
            title="新建歌单"
          >
            <Plus size={14} />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {playlists.map((playlist) => {
          const isActive = active === 'playlists' && activePlaylistId === playlist.id
          const isDropTarget = dropTarget === playlist.id
          return (
            <div key={playlist.id} className="group/pl relative">
            <button
              onClick={() => onSelectPlaylist(playlist.id)}
              onDragOver={(event) => {
                if (!playlist.isSystem) {
                  event.preventDefault()
                  setDropTarget(playlist.id)
                }
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(event) => void handleDrop(event, playlist.id)}
              className={[
                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12px] transition-colors",
                isActive ? 'bg-white/8 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-ink-50',
                isDropTarget ? 'ring-1 ring-brand-500/60' : ''
              ].join(' ')}
            >
              {playlist.isSystem ? (
                <Heart size={13} className="shrink-0 text-brand-400" />
              ) : (
                <ListMusic size={13} className="shrink-0 opacity-60" />
              )}
              <span className="truncate">{playlist.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-ink-500 group-hover/pl:hidden">
                {playlist.trackCount}
              </span>
            </button>
            {!playlist.isSystem ? (
              <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover/pl:flex">
                <button
                  onClick={() => {
                    setEditing(playlist.id)
                    onSelectPlaylist(playlist.id)
                  }}
                  title="重命名"
                  className="rounded p-0.5 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('删除歌单「' + playlist.name + '」？歌曲不会从曲库删除。')) {
                      void removePlaylist(playlist.id)
                    }
                  }}
                  title="删除"
                  className="rounded p-0.5 text-ink-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ) : null}
            </div>
          )
        })}
        {playlists.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-ink-500">还没有歌单，点右上角 + 新建</p>
        ) : null}
      </div>

      <div className="border-t border-white/5 p-4">
        <p className="text-[11px] leading-relaxed text-ink-400">
          播放器 + 插件化音源
          <br />
          仅供个人学习使用
        </p>
        <p className="mt-2 text-[11px] text-ink-400">v{version}</p>
      </div>
    </aside>
  )
}