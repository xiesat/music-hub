import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderPlus, Play, RefreshCw, Search, Shuffle, Trash2, X } from 'lucide-react'
import type { LibraryStats, ScanProgress, Track, TrackMenuResult, TrackSort } from '@shared/types'
import { formatBytes, formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
import { usePlaylists } from '../stores/playlists'
import { TrackTable } from './TrackTable'

const PAGE_SIZE = 200

export function LibraryView(): JSX.Element {
  const [items, setItems] = useState<Track[]>([])
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState<TrackSort>('title')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const requestId = useRef(0)
  const loadingRef = useRef(false)
  const anchorRef = useRef(-1)

  const currentTrack = usePlayer((state) => state.queue[state.index] ?? null)
  const playQueue = usePlayer((state) => state.playQueue)
  const refreshPlaylists = usePlaylists((state) => state.refresh)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 250)
    return () => clearTimeout(timer)
  }, [keyword])

  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    loadingRef.current = true
    try {
      const page = await window.api.library.list({
        keyword: debounced,
        sort,
        order,
        offset: 0,
        limit: PAGE_SIZE
      })
      if (id !== requestId.current) return
      setItems(page.items)
      setTotal(page.total)
      setSelected(new Set())
      anchorRef.current = -1
    } finally {
      if (id === requestId.current) {
        setLoading(false)
        loadingRef.current = false
      }
    }
  }, [debounced, sort, order])

  const refreshStats = useCallback(async () => {
    setStats(await window.api.library.stats())
  }, [])

  useEffect(() => {
    void loadFirstPage()
  }, [loadFirstPage])

  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  useEffect(() => {
    return window.api.library.onScanProgress((next) => {
      setProgress(next)
      if (next.phase === 'done') {
        void loadFirstPage()
        void refreshStats()
      }
    })
  }, [loadFirstPage, refreshStats])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || items.length >= total) return
    const id = requestId.current
    loadingRef.current = true
    try {
      const page = await window.api.library.list({
        keyword: debounced,
        sort,
        order,
        offset: items.length,
        limit: PAGE_SIZE
      })
      if (id !== requestId.current) return
      setItems((previous) => [...previous, ...page.items])
      setTotal(page.total)
    } finally {
      loadingRef.current = false
    }
  }, [items.length, total, debounced, sort, order])

  const importFolder = async (): Promise<void> => {
    const roots = await window.api.library.pickFolder()
    if (roots.length === 0) return
    setMessage('开始扫描…')
    const result = await window.api.library.scan()
    setMessage(result.error ?? null)
  }

  const rescan = async (): Promise<void> => {
    setMessage('开始扫描…')
    const result = await window.api.library.scan()
    setMessage(result.error ?? null)
  }

  const handleSort = (next: TrackSort): void => {
    if (next === sort) setOrder(order === 'asc' ? 'desc' : 'asc')
    else {
      setSort(next)
      setOrder('asc')
    }
  }

  const playAll = (shuffle = false): void => {
    if (items.length === 0) return
    const queue = shuffle ? [...items].sort(() => Math.random() - 0.5) : items
    playQueue(queue, 0)
  }

  const removeTracks = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return
      await window.api.library.removeTracks(ids)
      const drop = new Set(ids)
      setItems((previous) => previous.filter((track) => !drop.has(track.id)))
      setTotal((value) => Math.max(0, value - ids.length))
      setSelected(new Set())
      usePlayer.getState().removeFromQueue(ids)
      void refreshStats()
    },
    [refreshStats]
  )

  const applyMenuAction = useCallback(
    async (result: TrackMenuResult): Promise<void> => {
      const { action, ids } = result
      const idSet = new Set(ids)
      const picked = items.filter((track) => idSet.has(track.id))
      if (picked.length === 0) return

      switch (action) {
        case 'play': {
          const startIndex = items.findIndex((track) => track.id === ids[0])
          playQueue(items, Math.max(0, startIndex))
          break
        }
        case 'play-next':
          usePlayer.getState().enqueueNext(picked)
          setMessage('已设为下一首播放：' + picked.length + ' 首')
          break
        case 'append-queue':
          usePlayer.getState().appendQueue(picked)
          setMessage('已加入播放队列：' + picked.length + ' 首')
          break
        case 'favorite':
        case 'unfavorite': {
          const favorite = action === 'favorite'
          await window.api.library.setFavorite(ids, favorite)
          setItems((previous) =>
            previous.map((track) => (idSet.has(track.id) ? { ...track, favorite } : track))
          )
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
          await removeTracks(ids)
          break
      }
    },
    [items, playQueue, removeTracks, refreshPlaylists]
  )

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
      // 用函数式更新，避免连续点击时读到闭包里的旧 selected
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

  const handleRowDoubleClick = (index: number): void => {
    playQueue(items, index)
  }

  const handleContextMenu = async (index: number, event: React.MouseEvent): Promise<void> => {
    event.preventDefault()
    const track = items[index]
    if (!track) return

    let ids: string[]
    if (selected.has(track.id)) {
      ids = Array.from(selected)
    } else {
      setSelected(new Set([track.id]))
      anchorRef.current = index
      ids = [track.id]
    }

    const allFavorite = ids.every((id) => items.find((item) => item.id === id)?.favorite)
    const result = await window.api.ui.showTrackMenu({ ids, favorite: allFavorite })
    if (result) await applyMenuAction(result)
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    const key = event.key

    if (key === ' ') {
      event.preventDefault()
      usePlayer.getState().toggle()
      return
    }

    if (key === 'Escape') {
      setSelected(new Set())
      anchorRef.current = -1
      usePlayer.getState().selectTrack(null)
      return
    }

    if ((key === 'a' || key === 'A') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      setSelected(new Set(items.map((track) => track.id)))
      return
    }

    if (key === 'Delete' && selected.size > 0) {
      event.preventDefault()
      void removeTracks(Array.from(selected))
      return
    }

    if (key === 'Enter' && selected.size > 0) {
      event.preventDefault()
      const firstIndex = items.findIndex((track) => selected.has(track.id))
      if (firstIndex >= 0) playQueue(items, firstIndex)
      return
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault()
      if (items.length === 0) return
      const delta = key === 'ArrowDown' ? 1 : -1
      const base = anchorRef.current >= 0 ? anchorRef.current : -1
      const nextIndex = Math.max(0, Math.min(items.length - 1, base + delta))
      anchorRef.current = nextIndex
      setSelected(new Set([items[nextIndex].id]))
    }
  }

  const scanning = progress?.phase === 'walking' || progress?.phase === 'parsing'
  const selectedIds = Array.from(selected)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-3">
        <div className="flex items-baseline gap-4 text-[11px] text-ink-400">
          <span>
            <b className="text-[15px] font-medium text-ink-100">{stats?.tracks ?? 0}</b> 首
          </span>
          <span>{stats?.artists ?? 0} 位艺人</span>
          <span>{stats?.albums ?? 0} 张专辑</span>
          <span>{formatDuration(stats?.totalDurationMs ?? 0)}</span>
          <span>{formatBytes(stats?.totalSize ?? 0)}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => playAll(false)}
            disabled={items.length === 0}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5 disabled:opacity-40"
            title="从当前列表第一首开始播放"
          >
            <Play size={13} fill="currentColor" />
            播放全部
          </button>
          <button
            onClick={() => playAll(true)}
            disabled={items.length === 0}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5 disabled:opacity-40"
            title="随机播放当前列表"
          >
            <Shuffle size={13} />
            随机
          </button>
          <label className="flex h-9 w-[220px] items-center gap-2 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-400 focus-within:border-brand-500/60">
            <Search size={14} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-full w-full bg-transparent text-ink-100 outline-none placeholder:text-ink-400"
              placeholder="搜索标题、艺人、专辑"
            />
          </label>
          <button
            onClick={() => void rescan()}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5"
          >
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            重新扫描
          </button>
          <button
            onClick={() => void importFolder()}
            className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400"
          >
            <FolderPlus size={14} />
            导入目录
          </button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="flex items-center gap-3 border-b border-white/5 bg-brand-500/10 px-6 py-1.5 text-[11px] text-ink-200">
          <span>已选中 {selected.size} 首</span>
          <button
            onClick={() => {
              const firstIndex = items.findIndex((track) => selected.has(track.id))
              if (firstIndex >= 0) playQueue(items, firstIndex)
            }}
            className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-white/10"
          >
            <Play size={11} fill="currentColor" /> 播放
          </button>
          <button
            onClick={() => void removeTracks(selectedIds)}
            className="flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-white/10"
          >
            <Trash2 size={11} /> 从曲库移除
          </button>
          <button
            onClick={() => {
              setSelected(new Set())
              anchorRef.current = -1
              usePlayer.getState().selectTrack(null)
            }}
            className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 transition-colors hover:bg-white/10"
          >
            <X size={11} /> 取消选择
          </button>
        </div>
      ) : null}

      {progress && progress.phase !== 'idle' && progress.phase !== 'done' ? (
        <div className="flex items-center gap-3 border-b border-white/5 bg-ink-850/60 px-6 py-2 text-[11px] text-ink-400">
          <span className="text-brand-400">
            {progress.phase === 'walking' ? '正在遍历目录' : '正在解析标签'} {progress.scanned}/{progress.total}
          </span>
          <div className="h-1 w-48 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{
                width:
                  progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) + '%' : '0%'
              }}
            />
          </div>
          <span>新增 {progress.added}</span>
          <span>更新 {progress.updated}</span>
          <span>跳过 {progress.skipped}</span>
          {progress.failed > 0 ? <span className="text-amber-400">失败 {progress.failed}</span> : null}
        </div>
      ) : null}

      {message ? (
        <div className="border-b border-white/5 px-6 py-1.5 text-[11px] text-ink-400">{message}</div>
      ) : null}

      {items.length === 0 && !loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-[13px] text-ink-300">{debounced ? '没有匹配的曲目' : '曲库还是空的'}</p>
          {!debounced ? (
            <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
              点击右上角「导入目录」选择你的音乐文件夹，MusicHub 会解析标签并建立索引。
            </p>
          ) : null}
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
          onRowDoubleClick={handleRowDoubleClick}
          onRowContextMenu={(index, event) => void handleContextMenu(index, event)}
          onKeyDown={handleKeyDown}
          onPlay={(index) => playQueue(items, index)}
          onLoadMore={() => void loadMore()}
          draggable
        />
      )}
    </div>
  )
}