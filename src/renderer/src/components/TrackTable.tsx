import type { JSX } from 'react'
import { useRef } from 'react'
import { Cloud, Heart, Play } from 'lucide-react'
import type { Track, TrackSort } from '@shared/types'
import { useVirtualRows } from '../hooks/useVirtualRows'
import { formatDuration } from '../lib/format'

const ROW_HEIGHT = 48

interface Props {
  tracks: Track[]
  total: number
  currentId: string | null
  selectedIds: Set<string>
  sort: TrackSort
  order: 'asc' | 'desc'
  onSortChange: (sort: TrackSort) => void
  onRowClick: (index: number, event: React.MouseEvent) => void
  onRowDoubleClick: (index: number) => void
  onRowContextMenu: (index: number, event: React.MouseEvent) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onPlay: (index: number) => void
  onLoadMore: () => void
  /** 允许拖拽：可拖到侧边栏歌单，同列表内可排序 */
  draggable?: boolean
  onReorder?: (fromIndex: number, toIndex: number) => void
  onToggleFavorite?: (track: Track) => void
  emptyHint?: string
}

const COLUMNS: { key: TrackSort; label: string; className: string }[] = [
  { key: 'title', label: '标题', className: 'flex-1 min-w-0' },
  { key: 'album', label: '专辑', className: 'w-[200px] shrink-0' },
  { key: 'duration', label: '时长', className: 'w-[70px] shrink-0 text-right' },
  { key: 'addedAt', label: '加入时间', className: 'w-[100px] shrink-0 text-right' }
]

export function TrackTable(props: Props): JSX.Element {
  const {
    tracks,
    total,
    currentId,
    selectedIds,
    sort,
    order,
    onSortChange,
    onRowClick,
    onRowDoubleClick,
    onRowContextMenu,
    onKeyDown,
    onPlay,
    onLoadMore,
    draggable = false,
    onReorder,
    onToggleFavorite
  } = props

  const virtual = useVirtualRows({ rowHeight: ROW_HEIGHT, total: tracks.length })
  const dragFrom = useRef<number>(-1)

  const handleDragStart = (event: React.DragEvent, index: number): void => {
    const track = tracks[index]
    if (!track) return
    dragFrom.current = index
    const ids = selectedIds.has(track.id) && selectedIds.size > 0 ? Array.from(selectedIds) : [track.id]
    event.dataTransfer.setData('application/x-musichub-tracks', JSON.stringify(ids))
    event.dataTransfer.setData('text/plain', ids.join(','))
    event.dataTransfer.effectAllowed = 'copyMove'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col outline-none" tabIndex={0} onKeyDown={onKeyDown}>
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
        <span className="flex w-8 shrink-0 justify-center">★</span>
      </div>

      <div
        ref={virtual.containerRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          virtual.onScroll()
          const element = event.currentTarget
          if (element.scrollTop + element.clientHeight > element.scrollHeight - 480) onLoadMore()
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div style={{ height: virtual.totalHeight, position: "relative" }}>
          <div style={{ paddingTop: virtual.paddingTop }}>
            {tracks.slice(virtual.startIndex, virtual.endIndex).map((track, offset) => {
              const index = virtual.startIndex + offset
              const isCurrent = track.id === currentId
              const isSelected = selectedIds.has(track.id)
              return (
                <div
                  key={track.id}
                  data-track-row={track.id}
                  draggable={draggable}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragOver={(event) => {
                    if (onReorder) event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (!onReorder) return
                    event.preventDefault()
                    const from = dragFrom.current
                    if (from >= 0 && from !== index) onReorder(from, index)
                    dragFrom.current = -1
                  }}
                  onClick={(event) => onRowClick(index, event)}
                  onDoubleClick={() => onRowDoubleClick(index)}
                  onContextMenu={(event) => onRowContextMenu(index, event)}
                  className={[
                    "group relative flex cursor-default items-center gap-3 px-4 text-[12px] transition-colors",
                    isSelected
                      ? 'bg-white/[0.07] ring-1 ring-inset ring-brand-500/30'
                      : isCurrent
                        ? 'bg-brand-500/10'
                        : 'hover:bg-white/4'
                  ].join(' ')}
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="flex w-8 shrink-0 items-center justify-center">
                    {isCurrent ? (
                      <span className="text-brand-400">♪</span>
                    ) : (
                      <>
                        <span className="text-ink-400 group-hover:hidden">{index + 1}</span>
                        <button
                          onClick={(event) => {
                            event.stopPropagation()
                            onPlay(index)
                          }}
                          className="hidden text-ink-100 group-hover:block"
                          title="播放"
                        >
                          <Play size={13} fill="currentColor" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-ink-700">
                      {track.coverPath || track.coverUrl ? (
                        <img
                          src={
                            track.coverPath
                              ? 'media://cover/' + encodeURIComponent(track.id)
                              : (track.coverUrl ?? '')
                          }
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className={["truncate", isCurrent ? "text-brand-300" : "text-ink-100"].join(" ")}>
                        {track.title}
                        {track.id.startsWith('remote:') ? (
                          <Cloud size={10} className="ml-1 inline-block align-baseline text-ink-500" />
                        ) : null}
                      </p>
                      <p className="truncate text-[11px] text-ink-400">{track.artist ?? "未知艺术家"}</p>
                    </div>
                  </div>

                  <span className="w-[200px] shrink-0 truncate text-ink-300">{track.album ?? "—"}</span>
                  <span className="w-[70px] shrink-0 text-right tabular-nums text-ink-400">
                    {formatDuration(track.durationMs)}
                  </span>
                  <span className="w-[100px] shrink-0 text-right text-[11px] text-ink-400">
                    {new Date(track.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                  <span className="flex w-8 shrink-0 items-center justify-center">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleFavorite?.(track)
                      }}
                      className={[
                        "rounded p-1 transition-colors hover:bg-white/10",
                        track.favorite
                          ? 'text-brand-400'
                          : 'text-ink-600 opacity-0 group-hover:opacity-100 hover:text-brand-300'
                      ].join(' ')}
                      title={track.favorite ? '取消喜欢' : '加入我喜欢的音乐'}
                    >
                      <Heart size={13} className={track.favorite ? "fill-brand-400" : ""} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-4 py-1.5 text-[11px] text-ink-400">
        <span>已加载 {tracks.length} / {total} 首</span>
        {selectedIds.size > 0 ? <span>已选中 {selectedIds.size} 首</span> : null}
      </div>
    </div>
  )
}