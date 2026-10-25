import type { JSX } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderPlus, RefreshCw, Search } from 'lucide-react'
import type { LibraryStats, ScanProgress, Track, TrackSort } from '@shared/types'
import { formatBytes, formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
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

  const requestId = useRef(0)
  const loadingRef = useRef(false)
  const currentTrack = usePlayer((state) => state.queue[state.index] ?? null)
  const playQueue = usePlayer((state) => state.playQueue)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 250)
    return () => clearTimeout(timer)
  }, [keyword])

  const loadFirstPage = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    loadingRef.current = true
    try {
      const page = await window.api.library.list({ keyword: debounced, sort, order, offset: 0, limit: PAGE_SIZE })
      if (id !== requestId.current) return
      setItems(page.items)
      setTotal(page.total)
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

  const handlePlay = (index: number): void => {
    playQueue(items, index)
  }

  const handleRemove = async (track: Track): Promise<void> => {
    await window.api.library.removeTrack(track.id)
    setItems((previous) => previous.filter((item) => item.id !== track.id))
    setTotal((value) => Math.max(0, value - 1))
    void refreshStats()
  }

  const scanning = progress?.phase === 'walking' || progress?.phase === 'parsing'

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
          <label className="flex h-9 w-[240px] items-center gap-2 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-400 focus-within:border-brand-500/60">
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
          <p className="text-[13px] text-ink-300">
            {debounced ? '没有匹配的曲目' : '曲库还是空的'}
          </p>
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
          sort={sort}
          order={order}
          onSortChange={handleSort}
          onPlay={handlePlay}
          onLoadMore={() => void loadMore()}
          onRemove={(track) => void handleRemove(track)}
        />
      )}
    </div>
  )
}