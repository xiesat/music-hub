import type { JSX } from 'react'
import type { Track, TrackSort } from '@shared/types'
import { useVirtualRows } from '../hooks/useVirtualRows'
import { formatDuration } from '../lib/format'

const ROW_HEIGHT = 48

interface Props {
  tracks: Track[]
  total: number
  currentId: string | null
  sort: TrackSort
  order: 'asc' | 'desc'
  onSortChange: (sort: TrackSort) => void
  onPlay: (index: number) => void
  onLoadMore: () => void
  onRemove: (track: Track) => void
}

const COLUMNS: { key: TrackSort; label: string; className: string }[] = [
  { key: 'title', label: '标题', className: 'flex-1 min-w-0' },
  { key: 'album', label: '专辑', className: 'w-[220px] shrink-0' },
  { key: 'duration', label: '时长', className: 'w-[70px] shrink-0 text-right' },
  { key: 'addedAt', label: '加入时间', className: 'w-[110px] shrink-0 text-right' }
]

export function TrackTable(props: Props): JSX.Element {
  const { tracks, total, currentId, sort, order, onSortChange, onPlay, onLoadMore, onRemove } = props
  const virtual = useVirtualRows({ rowHeight: ROW_HEIGHT, total: tracks.length })


  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 bg-ink-900/60 px-4 py-2 text-[11px] text-ink-400">
        <span className="w-8 shrink-0 text-center">#</span>
        {COLUMNS.map((column) => (
          <button
            key={column.key}
            onClick={() => onSortChange(column.key)}
            className={[
              "flex items-center gap-1 transition-colors hover:text-ink-200",
              column.className,
              sort === column.key ? 'text-brand-400' : ''
            ].join(' ')}
          >
            {column.label}
            {sort === column.key ? <span>{order === 'asc' ? '↑' : '↓'}</span> : null}
          </button>
        ))}
        <span className="w-8 shrink-0" />
      </div>

      <div
        ref={virtual.containerRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          virtual.onScroll()
          const element = event.currentTarget
          if (element.scrollTop + element.clientHeight > element.scrollHeight - 480) onLoadMore()
        }}
      >
        <div style={{ height: virtual.totalHeight, position: "relative" }}>
          <div style={{ paddingTop: virtual.paddingTop }}>
            {tracks.slice(virtual.startIndex, virtual.endIndex).map((track, offset) => {
              const index = virtual.startIndex + offset
              const isCurrent = track.id === currentId
              return (
                <div
                  key={track.id}
                  onDoubleClick={() => onPlay(index)}
                  className={[
                    "group flex items-center gap-3 px-4 text-[12px] transition-colors",
                    isCurrent ? 'bg-brand-500/10' : 'hover:bg-white/4'
                  ].join(' ')}
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className={["w-8 shrink-0 text-center", isCurrent ? "text-brand-400" : "text-ink-400"].join(" ")}>
                    {isCurrent ? '♪' : index + 1}
                  </span>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-ink-700">
                      {track.coverPath ? (
                        <img
                          src={'media://cover/' + encodeURIComponent(track.id)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-ink-100">{track.title}</p>
                      <p className="truncate text-[11px] text-ink-400">{track.artist ?? "未知艺术家"}</p>
                    </div>
                  </div>

                  <span className="w-[220px] shrink-0 truncate text-ink-300">{track.album ?? "—"}</span>
                  <span className="w-[70px] shrink-0 text-right tabular-nums text-ink-400">
                    {formatDuration(track.durationMs)}
                  </span>
                  <span className="w-[110px] shrink-0 text-right text-[11px] text-ink-400">
                    {new Date(track.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      onRemove(track)
                    }}
                    className="w-8 shrink-0 text-ink-400 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    title="从曲库移除"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-1.5 text-[11px] text-ink-400">
        已加载 {tracks.length} / {total} 首
      </div>
    </div>
  )
}