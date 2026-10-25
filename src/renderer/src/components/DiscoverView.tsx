import type { JSX } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Download, Heart, Loader2, Play, Search } from 'lucide-react'
import type { ProviderInfo, RemoteTrack } from '@shared/provider'
import type { Track } from '@shared/types'
import { formatDuration } from '../lib/format'
import { useDiscover } from '../stores/discover'
import { useUi } from '../stores/ui'
import { usePlayer } from '../stores/player'

function toPlayable(track: RemoteTrack, streamUrl?: string): Track {
  return {
    id: 'remote:' + track.providerId + ':' + track.key,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    format: 'MP3',
    bitrate: null,
    size: null,
    path: null,
    coverPath: null,
    favorite: false,
    playCount: 0,
    createdAt: Date.now(),
    streamUrl,
    coverUrl: track.coverUrl ?? undefined,
    providerId: track.providerId,
    providerKey: track.key
  }
}


export function DiscoverView(): JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [favorited, setFavorited] = useState<Set<string>>(() => new Set())
  const [authLabel, setAuthLabel] = useState<string | null>(null)

  const providerId = useDiscover((state) => state.providerId)
  const keyword = useDiscover((state) => state.keyword)
  const items = useDiscover((state) => state.items)
  const total = useDiscover((state) => state.total)
  const loading = useDiscover((state) => state.loading)
  const error = useDiscover((state) => state.error)
  const message = useDiscover((state) => state.message)
  const searched = useDiscover((state) => state.searched)
  const scrollTop = useDiscover((state) => state.scrollTop)
  const downloading = useDiscover((state) => state.downloading)
  const sources = useDiscover((state) => state.sources)
  const setProvider = useDiscover((state) => state.setProvider)
  const setKeyword = useDiscover((state) => state.setKeyword)
  const setScrollTop = useDiscover((state) => state.setScrollTop)
  const search = useDiscover((state) => state.search)
  const loadMore = useDiscover((state) => state.loadMore)
  const setDownloadProgress = useDiscover((state) => state.setDownloadProgress)
  const clearDownload = useDiscover((state) => state.clearDownload)

  const playQueue = usePlayer((state) => state.playQueue)
  const selectTrack = usePlayer((state) => state.selectTrack)
  const currentId = usePlayer((state) => state.queue[state.index]?.id ?? null)
  const selectedId = usePlayer((state) => state.selectedTrack?.id ?? null)

  const providerNames = new Map(providers.map((item) => [item.id, item.name]))

  // 展示当前音源的登录态，避免「登录了但搜索没变化」的困惑
  useEffect(() => {
    let alive = true
    if (providerId === 'all') {
      setAuthLabel(null)
      return
    }
    void window.api.providers
      .authState(providerId)
      .then((state) => {
        if (!alive) return
        setAuthLabel(state.loggedIn ? '已登录 ' + (state.nickname || state.uid || '') : null)
      })
      .catch(() => {
        if (alive) setAuthLabel(null)
      })
    return () => {
      alive = false
    }
  }, [providerId])
  const listRef = useRef<HTMLDivElement | null>(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    void window.api.providers.list().then((list) => {
      setProviders(list)
      const current = list.find((item) => item.id === useDiscover.getState().providerId)
      if (!current || !current.enabled) {
        const firstEnabled = list.find((item) => item.enabled)
        if (firstEnabled) setProvider(firstEnabled.id)
      }
    })
    return window.api.providers.onDownloadProgress((payload) => {
      if (payload.total > 0) setDownloadProgress(payload.key, Math.round((payload.received / payload.total) * 100))
    })
  }, [setProvider, setDownloadProgress])

  // 从其它视图切回来时恢复滚动位置，避免每次重新搜索/回到顶部
  useEffect(() => {
    if (restoredRef.current) return
    const element = listRef.current
    if (!element) return
    if (scrollTop > 0) element.scrollTop = scrollTop
    restoredRef.current = true
  }, [scrollTop, items.length])

  const playTrack = async (track: RemoteTrack): Promise<void> => {
    setBusyKey(track.key)
    try {
      const source = await window.api.providers.stream(providerId, track.key, {
        title: track.title,
        artist: track.artist
      })
      if (!source) {
        useDiscover.setState({ error: '这首拿不到播放地址（可能需要会员或已下架）' })
        return
      }
      selectTrack(null)
      playQueue([toPlayable(track, source.url)], 0)
    } catch (err) {
      useDiscover.setState({ error: (err as Error).message })
    } finally {
      setBusyKey(null)
    }
  }

  const toggleFavorite = async (track: RemoteTrack): Promise<void> => {
    const id = 'remote:' + track.providerId + ':' + track.key
    const isFav = favorited.has(id)
    try {
      if (isFav) {
        await window.api.library.setFavorite([id], false)
      } else {
        await window.api.library.favoriteRemote({
          id,
          provider: track.providerId,
          providerKey: track.key,
          title: track.title,
          artist: track.artist,
          album: track.album,
          durationMs: track.durationMs,
          coverUrl: track.coverUrl
        })
      }
      setFavorited((previous) => {
        const next = new Set(previous)
        if (isFav) next.delete(id)
        else next.add(id)
        return next
      })
    } catch (err) {
      useDiscover.setState({ error: '收藏失败：' + (err as Error).message })
    }
  }

  const requestDownload = useUi((state) => state.requestDownload)

  const download = async (track: RemoteTrack): Promise<void> => {
    setBusyKey(track.key)
    useDiscover.setState({ error: null, message: null })
    try {
      requestDownload({
        title: track.title,
        artist: track.artist,
        providerId: track.providerId,
        providerKey: track.key
      })
    } catch (err) {
      useDiscover.setState({ error: '下载失败：' + (err as Error).message })
    } finally {
      clearDownload(track.key)
      setBusyKey(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-6 py-3">
        {authLabel ? (
          <span className="shrink-0 rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
            {authLabel}
          </span>
        ) : null}
        <select
          value={providerId}
          onChange={(event) => setProvider(event.target.value)}
          className="h-9 rounded-lg border border-white/8 bg-ink-850 px-2 text-[12px] text-ink-200 outline-none"
        >
          <option value="all">全部音源</option>
          {providers.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.enabled}>
              {item.name}
              {item.enabled ? '' : '（已禁用）'}
            </option>
          ))}
        </select>

        <label className="flex h-9 flex-1 items-center gap-2 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-400 focus-within:border-brand-500/60">
          <Search size={14} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void search(true)
            }}
            className="h-full w-full bg-transparent text-ink-100 outline-none placeholder:text-ink-400"
            placeholder="搜索在线歌曲，回车确认"
          />
        </label>
        <button
          onClick={() => void search(true)}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          搜索
        </button>
      </div>

      {sources.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-ink-850/40 px-6 py-1.5 text-[10px]">
          {sources.map((source) => (
            <span
              key={source.id}
              className={[
                "rounded px-1.5 py-0.5",
                source.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'
              ].join(' ')}
              title={source.error ?? ''}
            >
              {source.name} {source.ok ? source.count + ' 条' : '失败'}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-[11px] text-red-300">{error}</div>
      ) : null}
      {message ? (
        <div className="border-b border-white/5 px-6 py-2 text-[11px] text-ink-400">{message}</div>
      ) : null}

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget
          setScrollTop(element.scrollTop)
          if (element.scrollTop + element.clientHeight > element.scrollHeight - 400) void loadMore()
        }}
      >
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Search size={22} className="text-ink-600" />
            <p className="text-[13px] text-ink-300">{error ? "搜索失败" : searched ? "没有搜到结果" : "搜索在线音乐"}</p>
            <p className="max-w-[440px] text-[12px] leading-relaxed text-ink-400">
              单击一行可在播放栏预览，双击直接播放；下载后会自动写入曲库。
            </p>
          </div>
        ) : (
          items.map((track, index) => {
            const id = 'remote:' + track.providerId + ':' + track.key
            const isPlaying = id === currentId
            const isSelected = id === selectedId
            const isBusy = busyKey === track.key
            const percent = downloading[track.key]
            return (
              <div
                key={track.key}
                data-remote-row={track.key}
                onClick={() => selectTrack(toPlayable(track))}
                onDoubleClick={() => void playTrack(track)}
                className={[
                  "group flex cursor-default items-center gap-3 border-b border-white/[0.03] px-6 py-2 transition-colors",
                  isSelected
                    ? 'bg-white/[0.07] ring-1 ring-inset ring-brand-500/30'
                    : isPlaying
                      ? 'bg-brand-500/10'
                      : 'hover:bg-white/4'
                ].join(' ')}
              >
                <span className="w-6 shrink-0 text-right text-[11px] text-ink-500">
                  {isPlaying ? '♪' : index + 1}
                </span>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-ink-700">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={["truncate text-[13px]", isPlaying ? "text-brand-300" : "text-ink-100"].join(" ")}>
                    {track.title}
                  </p>
                  <p className="truncate text-[11px] text-ink-400">
                    {providerId === 'all' ? (
                      <span className="mr-1 rounded bg-white/8 px-1 py-[1px] text-[9px] text-ink-300">
                        {providerNames.get(track.providerId) ?? track.providerId}
                      </span>
                    ) : null}
                    {track.artist}
                    {track.album ? ' · ' + track.album : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                  {formatDuration(track.durationMs)}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void playTrack(track)
                    }}
                    disabled={isBusy}
                    className="rounded p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
                    title="播放"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void toggleFavorite(track)
                    }}
                    title={favorited.has(id) ? '取消喜欢' : '加入我喜欢的音乐'}
                    className="rounded p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-brand-300"
                  >
                    <Heart size={14} className={favorited.has(id) ? "fill-brand-400 text-brand-400" : ""} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void download(track)
                    }}
                    disabled={isBusy}
                    className="rounded p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-brand-300"
                    title="下载到曲库"
                  >
                    <Download size={14} />
                  </button>
                </div>
                {percent !== undefined ? (
                  <div className="w-20 shrink-0">
                    <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                      <div className="h-full bg-brand-400" style={{ width: percent + "%" }} />
                    </div>
                  </div>
                ) : null}
                {isBusy ? <Loader2 size={14} className="shrink-0 animate-spin text-brand-400" /> : null}
              </div>
            )
          })
        )}
        {items.length > 0 ? (
          <div className="px-6 py-3 text-center text-[11px] text-ink-500">
            {loading ? '正在加载…' : '已显示 ' + items.length + ' / ' + total + ' 条'}
          </div>
        ) : null}
      </div>
    </div>
  )
}