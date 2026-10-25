import type { JSX } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Music4, RefreshCw } from 'lucide-react'
import type { Track } from '@shared/types'
import { findActiveLine, parseLrc, type LyricLine } from '../lib/lrc'
import { formatBytes, formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
import { useUi } from '../stores/ui'

export function LyricsView(): JSX.Element | null {
  const open = useUi((state) => state.lyricsOpen)
  const closeLyrics = useUi((state) => state.closeLyrics)
  const current = usePlayer((state) => state.queue[state.index] ?? null)
  const selectedTrack = usePlayer((state) => state.selectedTrack)
  const positionMs = usePlayer((state) => state.positionMs)
  const seek = usePlayer((state) => state.seek)
  const playSelected = usePlayer((state) => state.playSelected)

  const [lrc, setLrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  const [userScrolled, setUserScrolled] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLParagraphElement | null>(null)

  const display: Track | null = selectedTrack ?? current
  const isPreview = Boolean(selectedTrack && selectedTrack.id !== current?.id)
  const trackId = display?.id ?? null

  useEffect(() => {
    if (!open) setUserScrolled(false)
  }, [open])

  useEffect(() => {
    if (!trackId) {
      setLrc(null)
      return
    }
    let alive = true
    setLoading(true)
    void window.api.library
      .lyric(trackId)
      .then((result) => {
        if (alive) setLrc(result?.lrc ?? null)
      })
      .catch(() => {
        if (alive) setLrc(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [trackId])

  const parsed = useMemo(() => parseLrc(lrc), [lrc])
  const activeIndex = useMemo(
    () => (parsed.synced && !isPreview ? findActiveLine(parsed.lines, positionMs) : -1),
    [parsed, positionMs, isPreview]
  )

  useEffect(() => {
    if (!open || userScrolled) return
    const element = activeRef.current
    if (!element) return
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex, open, userScrolled])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeLyrics()
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        usePlayer.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeLyrics])

  if (!open) return null

  const handleLineClick = (line: LyricLine): void => {
    if (line.timeMs < 0) return
    if (isPreview) playSelected(line.timeMs)
    else seek(line.timeMs)
  }

  const handleScroll = (): void => {
    const element = listRef.current
    const target = activeRef.current
    if (!element || !target) return
    const center = element.getBoundingClientRect().top + element.clientHeight / 2
    setUserScrolled(Math.abs(target.getBoundingClientRect().top - center) > element.clientHeight * 0.55)
  }

  return (
    <section className="fixed inset-x-0 top-11 bottom-[76px] z-30 overflow-hidden bg-ink-950/95">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {display?.coverPath && !coverFailed ? (
          <img
            key={display.id}
            src={'media://cover/' + encodeURIComponent(display.id)}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-25 blur-3xl"
            onError={() => setCoverFailed(true)}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/70 via-ink-950/85 to-ink-950" />
      </div>
      <div className="relative flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-white/5 px-6 py-2.5">
          <button
            onClick={closeLyrics}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-ink-100 transition-colors hover:border-white/25 hover:bg-white/12 hover:text-white"
            title="返回曲库（Esc）"
          >
            <ArrowLeft size={15} />
            返回曲库
          </button>
          <span className="text-[11px] text-ink-500">Esc 关闭 · 空格 播放/暂停 · 点击歌词行跳转</span>
        </header>
        <div className="flex min-h-0 flex-1 gap-10 px-10 pb-8">
          <div className="flex w-[300px] shrink-0 flex-col gap-5">
            <div className="aspect-square w-full overflow-hidden rounded-xl bg-ink-800 ring-1 ring-white/10">
              {display?.coverPath && !coverFailed ? (
                <img
                  key={display.id}
                  src={'media://cover/' + encodeURIComponent(display.id)}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setCoverFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-600">
                  <Music4 size={56} strokeWidth={1} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[20px] font-medium text-white">{display?.title ?? "未在播放"}</h2>
              <p className="mt-1 truncate text-[13px] text-ink-300">{display?.artist ?? "未知艺术家"}</p>
              {display?.album ? (
                <p className="mt-1 truncate text-[12px] text-ink-400">{display.album}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-ink-400">
              {display?.format ? (
                <span className="rounded bg-white/5 px-2 py-0.5 uppercase">{display.format}</span>
              ) : null}
              {display?.bitrate ? (
                <span className="rounded bg-white/5 px-2 py-0.5">{Math.round(display.bitrate / 1000)} kbps</span>
              ) : null}
              <span className="rounded bg-white/5 px-2 py-0.5">{formatDuration(display?.durationMs ?? 0)}</span>
              {display?.size ? (
                <span className="rounded bg-white/5 px-2 py-0.5">{formatBytes(display.size)}</span>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <div
              ref={listRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto pr-4"
            >
              <div style={{ paddingTop: '30%', paddingBottom: '45%' }}>
                {loading ? (
                  <p className="text-[13px] text-ink-500">正在读取歌词…</p>
                ) : parsed.lines.length === 0 ? (
                  <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center">
                    <Music4 size={22} className="text-ink-600" />
                    <p className="text-[13px] text-ink-400">这首歌还没有歌词</p>
                    <p className="max-w-[380px] text-[12px] leading-relaxed text-ink-500">
                      在音频旁放同名 .lrc（支持 UTF-8 / GBK），或确认歌曲标签里带内嵌歌词，
                      然后回到曲库点「重新扫描」。
                    </p>
                    <button
                      onClick={closeLyrics}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-ink-300 transition-colors hover:bg-white/5 hover:text-ink-100"
                    >
                      <RefreshCw size={12} />
                      返回曲库重新扫描
                    </button>
                  </div>
                ) : (
                  parsed.lines.map((line, index) => {
                    const isActive = index === activeIndex
                    const clickable = line.timeMs >= 0
                    return (
                      <p
                        key={index}
                        ref={isActive ? activeRef : null}
                        onClick={() => handleLineClick(line)}
                        className={[
                          "select-none py-2 text-[19px] leading-relaxed transition-all duration-300",
                          clickable ? 'cursor-pointer' : '',
                          isActive
                            ? 'font-medium text-white'
                            : clickable
                              ? 'text-ink-400 hover:text-ink-200'
                              : 'text-ink-500'
                        ].join(' ')}
                      >
                        {line.text || '♪'}
                      </p>
                    )
                  })
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink-950 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink-950 to-transparent" />
          </div>
        </div>
      </div>
    </section>
  )
}