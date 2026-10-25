import type { JSX } from 'react'
import { useState } from 'react'
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'

export function PlayerBar(): JSX.Element {
  const current = usePlayer((state) => state.queue[state.index] ?? null)
  const playing = usePlayer((state) => state.playing)
  const positionMs = usePlayer((state) => state.positionMs)
  const durationMs = usePlayer((state) => state.durationMs)
  const volume = usePlayer((state) => state.volume)
  const muted = usePlayer((state) => state.muted)
  const mode = usePlayer((state) => state.mode)
  const toggle = usePlayer((state) => state.toggle)
  const next = usePlayer((state) => state.next)
  const prev = usePlayer((state) => state.prev)
  const seek = usePlayer((state) => state.seek)
  const setVolume = usePlayer((state) => state.setVolume)
  const toggleMute = usePlayer((state) => state.toggleMute)
  const cycleMode = usePlayer((state) => state.cycleMode)

  const [coverFailed, setCoverFailed] = useState(false)

  const modeIcon =
    mode === 'shuffle' ? (
      <Shuffle size={15} />
    ) : mode === 'single' ? (
      <Repeat1 size={15} />
    ) : (
      <Repeat size={15} className={mode === 'loop' ? '' : 'opacity-50'} />
    )

  const modeLabel =
    mode === 'shuffle' ? '随机' : mode === 'single' ? '单曲循环' : mode === 'loop' ? '列表循环' : '顺序播放'

  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-4 border-t border-white/5 bg-ink-850/90 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-gradient-to-br from-ink-700 to-ink-800 ring-1 ring-white/5">
          {current && current.coverPath && !coverFailed ? (
            <img
              src={'media://cover/' + encodeURIComponent(current.id)}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setCoverFailed(true)}
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-200">{current?.title ?? "未在播放"}</p>
          <p className="truncate text-[11px] text-ink-400">
            {current ? (current.artist ?? '未知艺术家') : '从曲库中选择一首歌开始'}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button
            onClick={cycleMode}
            title={modeLabel}
            className="text-ink-400 transition-colors hover:text-ink-100"
          >
            {modeIcon}
          </button>
          <button
            onClick={() => prev()}
            className="text-ink-300 transition-colors hover:text-white"
            title="上一首"
          >
            <SkipBack size={17} />
          </button>
          <button
            onClick={toggle}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-950 transition-transform hover:scale-105 disabled:opacity-40"
            disabled={!current}
            title={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} className="translate-x-[1px]" fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => next()}
            className="text-ink-300 transition-colors hover:text-white"
            title="下一首"
          >
            <SkipForward size={17} />
          </button>
          <span className="w-4 text-center text-[10px] text-ink-400" title="播放队列">
            {usePlayer.getState().queue.length || ''}
          </span>
        </div>

        <div className="flex w-full max-w-[440px] items-center gap-2 text-[10px] tabular-nums text-ink-400">
          <span>{formatDuration(positionMs)}</span>
          <input
            type="range"
            min={0}
            max={durationMs || 1}
            value={Math.min(positionMs, durationMs || 1)}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-brand-400"
            disabled={!current}
          />
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 text-ink-400">
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