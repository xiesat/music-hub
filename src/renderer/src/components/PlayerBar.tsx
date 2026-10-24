import type { JSX } from 'react'
import { Play, SkipBack, SkipForward, Repeat, Shuffle, Volume2 } from 'lucide-react'

export function PlayerBar(): JSX.Element {
  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-4 border-t border-white/5 bg-ink-850/90 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-md bg-gradient-to-br from-ink-700 to-ink-800 ring-1 ring-white/5" />
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-200">未在播放</p>
          <p className="truncate text-[11px] text-ink-400">从曲库中选择一首歌开始</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="flex items-center gap-5">
          <button className="text-ink-400 transition-colors hover:text-ink-100" title="随机">
            <Shuffle size={15} />
          </button>
          <button className="text-ink-300 transition-colors hover:text-white" title="上一首">
            <SkipBack size={17} />
          </button>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink-950 transition-transform hover:scale-105"
            title="播放"
          >
            <Play size={16} className="translate-x-[1px]" fill="currentColor" />
          </button>
          <button className="text-ink-300 transition-colors hover:text-white" title="下一首">
            <SkipForward size={17} />
          </button>
          <button className="text-ink-400 transition-colors hover:text-ink-100" title="循环">
            <Repeat size={15} />
          </button>
        </div>
        <div className="flex w-full max-w-[420px] items-center gap-2 text-[10px] text-ink-400">
          <span>0:00</span>
          <div className="group relative h-1 flex-1 rounded-full bg-ink-700">
            <div className="h-full w-0 rounded-full bg-brand-400" />
          </div>
          <span>0:00</span>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 text-ink-400">
        <Volume2 size={16} />
        <div className="h-1 w-24 rounded-full bg-ink-700">
          <div className="h-full w-3/4 rounded-full bg-ink-400" />
        </div>
      </div>
    </footer>
  )
}
