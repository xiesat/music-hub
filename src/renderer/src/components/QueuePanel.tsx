import type { JSX } from 'react'
import { useRef } from 'react'
import { ListX, Trash2, X } from 'lucide-react'
import { formatDuration } from '../lib/format'
import { usePlayer } from '../stores/player'
import { useUi } from '../stores/ui'

export function QueuePanel(): JSX.Element | null {
  const open = useUi((state) => state.queueOpen)
  const closeQueue = useUi((state) => state.closeQueue)
  const queue = usePlayer((state) => state.queue)
  const index = usePlayer((state) => state.index)
  const playing = usePlayer((state) => state.playing)
  const playIndex = usePlayer((state) => state.playIndex)
  const removeFromQueue = usePlayer((state) => state.removeFromQueue)
  const moveInQueue = usePlayer((state) => state.moveInQueue)
  const clearQueue = usePlayer((state) => state.clearQueue)

  const dragFrom = useRef(-1)
  if (!open) return null

  return (
    <aside className="fixed right-0 top-11 bottom-[76px] z-20 flex w-[360px] flex-col border-l border-white/8 bg-ink-950/95 backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-ink-100">播放队列</span>
          <span className="text-[11px] text-ink-500">{queue.length} 首</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => clearQueue()}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100"
            title="清空队列"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={closeQueue}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100"
            title="关闭"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {queue.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <ListX size={22} className="text-ink-600" />
            <p className="text-[12px] text-ink-400">队列是空的</p>
            <p className="text-[11px] text-ink-500">双击曲库任意一首开始播放</p>
          </div>
        ) : (
          queue.map((track, i) => {
            const isCurrent = i === index
            return (
              <div
                key={track.id + '-' + i}
                draggable
                onDragStart={() => {
                  dragFrom.current = i
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const from = dragFrom.current
                  if (from >= 0 && from !== i) moveInQueue(from, i)
                  dragFrom.current = -1
                }}
                onClick={() => playIndex(i)}
                className={[
                  "group flex cursor-default items-center gap-2 px-4 py-1.5 text-[12px] transition-colors",
                  isCurrent ? 'bg-brand-500/10 text-brand-200' : 'text-ink-200 hover:bg-white/5'
                ].join(' ')}
              >
                <span className="w-5 shrink-0 text-center text-[10px] text-ink-500">
                  {isCurrent && playing ? '♪' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{track.title}</p>
                  <p className="truncate text-[10px] text-ink-500">{track.artist ?? "未知艺术家"}</p>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-ink-500">
                  {formatDuration(track.durationMs)}
                </span>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    removeFromQueue([track.id])
                  }}
                  className="shrink-0 text-ink-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  title="移出队列"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })
        )}
      </div>

      <footer className="border-t border-white/5 px-4 py-2 text-[10px] text-ink-500">
        拖动可调整顺序 · 单击立即播放
      </footer>
    </aside>
  )
}
