import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Download, Loader2, Play, Search } from 'lucide-react'
import type { ProviderInfo, RemoteTrack } from '@shared/provider'
import type { Track } from '@shared/types'
import { formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'

function toPlayable(track: RemoteTrack, streamUrl: string, coverUrl: string | null): Track {
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
    coverUrl: coverUrl ?? undefined,
    providerId: track.providerId,
    providerKey: track.key
  }
}

export function DiscoverView(): JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providerId, setProviderId] = useState('netease')
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<RemoteTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ key: string; received: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const playQueue = usePlayer((state) => state.playQueue)

  useEffect(() => {
    void window.api.providers.list().then((list) => {
      setProviders(list)
      const firstEnabled = list.find((item) => item.enabled)
      if (firstEnabled) setProviderId(firstEnabled.id)
    })
    return window.api.providers.onDownloadProgress(setProgress)
  }, [])

  const doSearch = async (): Promise<void> => {
    const query = keyword.trim()
    if (!query) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const page = await window.api.providers.search(providerId, query, 1)
      setItems(page.items)
      if (page.items.length === 0) setMessage('没有搜到结果')
    } catch (err) {
      setError((err as Error).message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const playTrack = async (track: RemoteTrack): Promise<void> => {
    setBusyKey(track.key)
    setError(null)
    try {
      const source = await window.api.providers.stream(providerId, track.key)
      if (!source) {
        setError('这首拿不到播放地址（可能需要会员或已下架）')
        return
      }
      playQueue([toPlayable(track, source.url, track.coverUrl)], 0)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyKey(null)
    }
  }

  const download = async (track: RemoteTrack): Promise<void> => {
    setBusyKey(track.key)
    setError(null)
    setMessage(null)
    try {
      const result = await window.api.providers.download(providerId, track.key, track.title, track.artist)
      setMessage('已下载并入库：' + result.filePath + '（' + Math.round(result.bytes / 1024 / 1024) + ' MB）')
    } catch (err) {
      setError('下载失败：' + (err as Error).message)
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-6 py-3">
        <select
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
          className="h-9 rounded-lg border border-white/8 bg-ink-850 px-2 text-[12px] text-ink-200 outline-none"
        >
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
              if (event.key === 'Enter') void doSearch()
            }}
            className="h-full w-full bg-transparent text-ink-100 outline-none placeholder:text-ink-400"
            placeholder="搜索在线歌曲，回车确认"
          />
        </label>
        <button
          onClick={() => void doSearch()}
          disabled={loading}
          className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-4 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          搜索
        </button>
      </div>

      {error ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-[11px] text-red-300">{error}</div>
      ) : null}
      {message ? (
        <div className="border-b border-white/5 px-6 py-2 text-[11px] text-ink-400">{message}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Search size={22} className="text-ink-600" />
            <p className="text-[13px] text-ink-300">搜索在线音乐</p>
            <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
              匿名可搜索与获取歌词；能否播放取决于该曲是否开放试听。下载后会自动写入曲库。
            </p>
          </div>
        ) : (
          items.map((track, index) => {
            const isBusy = busyKey === track.key
            const downloading = progress && progress.key === track.key && progress.total > 0
            return (
              <div
                key={track.key}
                className="group flex items-center gap-3 border-b border-white/[0.03] px-6 py-2 hover:bg-white/4"
              >
                <span className="w-6 shrink-0 text-right text-[11px] text-ink-500">{index + 1}</span>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-ink-700">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink-100">{track.title}</p>
                  <p className="truncate text-[11px] text-ink-400">
                    {track.artist}
                    {track.album ? ' · ' + track.album : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                  {formatDuration(track.durationMs)}
                </span>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => void playTrack(track)}
                    disabled={isBusy}
                    className="rounded p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
                    title="试听"
                  >
                    <Play size={14} />
                  </button>
                  <button
                    onClick={() => void download(track)}
                    disabled={isBusy}
                    className="rounded p-1.5 text-ink-300 transition-colors hover:bg-white/10 hover:text-brand-300"
                    title="下载到曲库"
                  >
                    <Download size={14} />
                  </button>
                </div>
                {downloading ? (
                  <div className="w-20 shrink-0">
                    <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="h-full bg-brand-400"
                        style={{ width: Math.round((progress.received / progress.total) * 100) + "%" }}
                      />
                    </div>
                  </div>
                ) : null}
                {isBusy ? <Loader2 size={14} className="shrink-0 animate-spin text-brand-400" /> : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
