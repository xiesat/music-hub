import type { JSX } from 'react'
import { useState } from 'react'
import { MicVocal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
import { useUi } from '../stores/ui'

export function PlayerBar(): JSX.Element {
  const current = usePlayer((state) => state.queue[state.index] ?? null)
  const selectedTrack = usePlayer((state) => state.selectedTrack)
  const playing = usePlayer((state) => state.playing)
  const positionMs = usePlayer((state) => state.positionMs)
  const durationMs = usePlayer((state) => state.durationMs)
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const mode = usePlayer((state) => state.mode)
  const toggle = usePlayer((state) => state.toggle)
  const playSelected = usePlayer((state) => state.playSelected)
  const next = usePlayer((state) => state.next)
  const prev = usePlayer((state) => state.prev)
  const seek = usePlayer((state) => state.seek)
  const setVolume = usePlayer((state) => state.setVolume)
  const toggleMute = usePlayer((state) => state.toggleMute)
  const cycleMode = usePlayer((state) => state.cycleMode)

  const [coverFailed, setCoverFailed] = useState(false)
  const openLyrics = useUi((state) => state.openLyrics)
  const lyricsOpen = useUi((state) => state.lyricsOpen)

  const isPreview = Boolean(selectedTrack && selectedTrack.id !== current?.id)
  const display = isPreview ? selectedTrack : current
  const displayDuration = isPreview ? (selectedTrack?.durationMs ?? 0) : durationMs
  const displayPosition = isPreview ? 0 : positionMs
  const showPaused = isPreview ? false : playing

  const modeIcon =
    mode === 'shuffle' ? (
      <Shuffle size={15} />
    ) : mode === 'single' ? (
      <Repeat1 size={15} />
    ) : (
      <Repeat size={15} className={mode === 'loop' ? '' : 'opacity-50'} />
    )

  const modeLabel = mode === 'shuffle' ? '随机' : mode === 'single' ? '单曲循环' : mode === 'loop' ? '列表循环' : '顺序播放'
  const subtitle = isPreview ? '预览中 · 点击播放开始' : (current?.artist ?? '从曲库中选择一首歌开始')

  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-4 border-t border-white/5 bg-ink-850/90 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          onClick={openLyrics}
          disabled={!display}
          title="查看歌词"
          className="group/cover relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-ink-700 to-ink-800 ring-1 ring-white/5 transition-transform hover:scale-105 disabled:cursor-default"
        >
          {display && display.coverPath && !coverFailed ? (
            <img
              key={display.id}
              src={'media://cover/' + encodeURIComponent(display.id)}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : null}
          <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-white group-hover/cover:flex">
            <MicVocal size={15} />
          </span>
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] text-ink-200">{display?.title ?? "未在播放"}</p>
            {isPreview ? (
              <span className="shrink-0 rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-300">预览</span>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-ink-400">{subtitle}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button onClick={cycleMode} className="text-ink-400 transition-colors hover:text-ink-100" title={modeLabel}>
            {modeIcon}
          </button>
          <button onClick={() => prev()} className="text-ink-300 transition-colors hover:text-white" title="上一首">
            <SkipBack size={17} />
          </button>
          <button
            onClick={() => (isPreview ? playSelected() : toggle())}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-950 transition-transform hover:scale-105 disabled:opacity-40"
            disabled={!display}
            title={showPaused ? '暂停' : '播放'}
          >
            {showPaused ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} className="translate-x-[1px]" fill="currentColor" />
            )}
          </button>
          <button onClick={() => next()} className="text-ink-300 transition-colors hover:text-white" title="下一首">
            <SkipForward size={17} />
          </button>
        </div>

        <div className="flex w-full max-w-[440px] items-center gap-2 text-[10px] tabular-nums text-ink-400">
          <span>{formatDuration(displayPosition)}</span>
          <input
            type="range"
            min={0}
            max={displayDuration || 1}
            value={Math.min(displayPosition, displayDuration || 1)}
            onChange={(event) => {
              if (isPreview) return
              seek(Number(event.target.value))
            }}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-brand-400"
            disabled={!display || isPreview}
          />
          <span>{formatDuration(displayDuration)}</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 text-ink-400">
        <button
          onClick={openLyrics}
          title="歌词"
          className={[
            "mr-1 transition-colors hover:text-ink-100",
            lyricsOpen ? 'text-brand-400' : ''
          ].join(' ')}
        >
          <MicVocal size={15} />
        </button>
        <button onClick={toggleMute} className="transition-colors hover:text-ink-100">
          {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-ink-700 accent-ink-300"
        />
      </div>
    </footer>
  )
}