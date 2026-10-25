import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Heart, Pencil, Play, Search, Trash2, X } from 'lucide-react'
import type { Track, TrackMenuResult, TrackSort } from '@shared/types'
import { formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
import { usePlaylists } from '../stores/playlists'
import { TrackTable } from './TrackTable'

interface Props {
  playlistId: string
}

export function PlaylistView({ playlistId }: Props): JSX.Element {
  const playlists = usePlaylists((state) => state.items)
  const refreshPlaylists = usePlaylists((state) => state.refresh)
  const renamePlaylist = usePlaylists((state) => state.rename)
  const removePlaylist = usePlaylists((state) => state.remove)

  const [items, setItems] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState<TrackSort>('addedAt')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const anchorRef = useRef(-1)
  const playlist = playlists.find((item) => item.id === playlistId) ?? null
  const isSystem = playlist?.isSystem ?? false

  const currentTrack = usePlayer((state) => state.queue[state.index] ?? null)
  const playQueue = usePlayer((state) => state.playQueue)

  const reload = useCallback(async () => {
    const page = await window.api.playlists.tracks(playlistId, { limit: 500, keyword })
    setItems(page.items)
    setTotal(page.total)
    setSelected(new Set())
    anchorRef.current = -1
  }, [playlistId, keyword])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    setEditing(false)
    setKeyword('')
  }, [playlistId])

  const handleSort = (next: TrackSort): void => {
    if (next === sort) setOrder(order === 'asc' ? 'desc' : 'asc')
    else {
      setSort(next)
      setOrder('asc')
    }
  }

  const handleRowClick = (index: number, event: React.MouseEvent): void => {
    const track = items[index]
    if (!track) return
    if (event.shiftKey && anchorRef.current >= 0) {
      const start = Math.min(anchorRef.current, index)
      const end = Math.max(anchorRef.current, index)
      setSelected(new Set(items.slice(start, end + 1).map((item) => item.id)))
      usePlayer.getState().selectTrack(track)
      return
    }
    if (event.ctrlKey || event.metaKey) {
      setSelected((previous) => {
        const next = new Set(previous)
        if (next.has(track.id)) next.delete(track.id)
        else next.add(track.id)
        return next
      })
      anchorRef.current = index
      return
    }
    setSelected(new Set([track.id]))
    anchorRef.current = index
    usePlayer.getState().selectTrack(track)
  }

  const handleRemove = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return
      await window.api.playlists.removeTracks(playlistId, ids)
      await reload()
      await refreshPlaylists()
      setMessage('已移出 ' + ids.length + ' 首')
    },
    [playlistId, reload, refreshPlaylists]
  )

  const applyMenu = useCallback(
    async (result: TrackMenuResult): Promise<void> => {
      const ids = result.ids
      const idSet = new Set(ids)
      const picked = items.filter((track) => idSet.has(track.id))
      if (picked.length === 0) return

      switch (result.action) {
        case 'play': {
          const startIndex = items.findIndex((track) => track.id === ids[0])
          playQueue(items, Math.max(0, startIndex))
          break
        }
        case 'play-next':
          usePlayer.getState().enqueueNext(picked)
          break
        case 'append-queue':
          usePlayer.getState().appendQueue(picked)
          break
        case 'favorite': {
          await window.api.library.setFavorite(ids, true)
          setItems((previous) => previous.map((t) => (idSet.has(t.id) ? { ...t, favorite: true } : t)))
          break
        }
        case 'unfavorite': {
          await window.api.library.setFavorite(ids, false)
          if (isSystem) await reload()
          else setItems((previous) => previous.map((t) => (idSet.has(t.id) ? { ...t, favorite: false } : t)))
          break
        }
        case 'add-to-playlist': {
          let targetId = result.playlistId
          if (!targetId) break
          if (targetId === '__new__') {
            const created = await window.api.playlists.create('新建歌单')
            targetId = created.id
          }
          const added = await window.api.playlists.addTracks(targetId, ids)
          await refreshPlaylists()
          setMessage('已添加 ' + added + ' 首到歌单')
          break
        }
        case 'remove':
          await handleRemove(ids)
          break
      }
    },
    [items, playQueue, isSystem, reload, refreshPlaylists, handleRemove]
  )

  const handleContextMenu = async (index: number, event: React.MouseEvent): Promise<void> => {
    event.preventDefault()
    const track = items[index]
    if (!track) return
    let ids: string[]
    if (selected.has(track.id)) ids = Array.from(selected)
    else {
      setSelected(new Set([track.id]))
      anchorRef.current = index
      ids = [track.id]
    }
    const allFavorite = ids.every((id) => items.find((item) => item.id === id)?.favorite)
    const result = await window.api.ui.showTrackMenu({ ids, favorite: allFavorite })
    if (result) await applyMenu(result)
  }

  const handleReorder = async (from: number, to: number): Promise<void> => {
    if (isSystem) return
    const next = items.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    await window.api.playlists.reorder(playlistId, next.map((track) => track.id))
  }

  const commitRename = async (): Promise<void> => {
    const name = draftName.trim()
    if (name && name !== playlist?.name) await renamePlaylist(playlistId, name)
    setEditing(false)
  }

  const handleDelete = async (): Promise<void> => {
    if (!playlist) return
    const confirmed = window.confirm('删除歌单「' + playlist.name + '」？歌曲不会从曲库删除。')
    if (!confirmed) return
    await removePlaylist(playlistId)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-3">
        {isSystem ? (
          <Heart size={18} className="fill-brand-400 text-brand-400" />
        ) : null}
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitRename()
                if (event.key === 'Escape') setEditing(false)
              }}
              className="h-8 w-[220px] rounded-md border border-brand-500/60 bg-ink-850 px-2 text-[13px] text-ink-100 outline-none"
            />
            <button onClick={() => void commitRename()} className="rounded p-1 text-brand-400 hover:bg-white/10">
              <Check size={14} />
            </button>
            <button onClick={() => setEditing(false)} className="rounded p-1 text-ink-400 hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        ) : (
          <h2 className="text-[15px] font-medium text-white">{playlist?.name ?? "歌单"}</h2>
        )}

        <span className="text-[11px] text-ink-400">
          {total} 首 · {formatDuration(items.reduce((sum, track) => sum + (track.durationMs ?? 0), 0))}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => playQueue(items, 0)}
            disabled={items.length === 0}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            <Play size={13} fill="currentColor" />
            播放全部
          </button>
          {!isSystem ? (
            <>
              <button
                onClick={() => {
                  setDraftName(playlist?.name ?? '')
                  setEditing(true)
                }}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5"
              >
                <Pencil size={13} />
                重命名
              </button>
              <button
                onClick={() => void handleDelete()}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={13} />
                删除
              </button>
            </>
          ) : null}
          <label className="flex h-9 w-[200px] items-center gap-2 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-400 focus-within:border-brand-500/60">
            <Search size={13} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-full w-full bg-transparent text-ink-100 outline-none placeholder:text-ink-400"
              placeholder="在歌单内搜索"
            />
          </label>
        </div>
      </div>

      {message ? (
        <div className="border-b border-white/5 px-6 py-1.5 text-[11px] text-ink-400">{message}</div>
      ) : null}

      {selected.size > 0 ? (
        <div className="flex items-center gap-3 border-b border-white/5 bg-brand-500/10 px-6 py-1.5 text-[11px] text-ink-200">
          <span>已选中 {selected.size} 首</span>
          <button
            onClick={() => {
              const firstIndex = items.findIndex((track) => selected.has(track.id))
              if (firstIndex >= 0) playQueue(items, firstIndex)
            }}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/10"
          >
            <Play size={11} fill="currentColor" /> 播放
          </button>
          <button
            onClick={() => void handleRemove(Array.from(selected))}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/10"
          >
            <Trash2 size={11} /> 移出歌单
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 hover:bg-white/10"
          >
            <X size={11} /> 取消选择
          </button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-[13px] text-ink-300">这个歌单还没有歌曲</p>
          <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
            在曲库里右键歌曲选择「添加到歌单」，或把歌曲直接拖到左侧歌单名上。
          </p>
        </div>
      ) : (
        <TrackTable
          tracks={items}
          total={total}
          currentId={currentTrack?.id ?? null}
          selectedIds={selected}
          sort={sort}
          order={order}
          onSortChange={handleSort}
          onRowClick={handleRowClick}
          onRowDoubleClick={(index) => playQueue(items, index)}
          onRowContextMenu={(index, event) => void handleContextMenu(index, event)}
          onKeyDown={() => {}}
          onPlay={(index) => playQueue(items, index)}
          onLoadMore={() => {}}
          draggable={!isSystem}
          onReorder={(from, to) => void handleReorder(from, to)}
        />
      )}
    </div>
  )
}
