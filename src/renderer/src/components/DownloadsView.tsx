import type { JSX } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, Loader2, RotateCw, Trash2, X } from 'lucide-react'
import type { DownloadTask } from '@shared/types'
import { formatBytes } from '../lib/format'

const STATUS_LABEL: Record<DownloadTask['status'], string> = {
  queued: '排队中',
  running: '下载中',
  done: '已完成',
  failed: '失败',
  canceled: '已取消'
}

const STATUS_STYLE: Record<DownloadTask['status'], string> = {
  queued: 'bg-white/8 text-ink-300',
  running: 'bg-brand-500/15 text-brand-300',
  done: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-red-500/15 text-red-300',
  canceled: 'bg-white/8 text-ink-400'
}

export function DownloadsView(): JSX.Element {
  const [tasks, setTasks] = useState<DownloadTask[]>([])

  const reload = useCallback(async () => {
    setTasks(await window.api.downloads.list())
  }, [])

  useEffect(() => {
    void reload()
    return window.api.downloads.onProgress((task) => {
      const next = task as DownloadTask
      setTasks((previous) => {
        const index = previous.findIndex((item) => item.id === next.id)
        if (index < 0) return [next, ...previous]
        const copy = previous.slice()
        copy[index] = next
        return copy
      })
    })
  }, [reload])

  const active = tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
  const done = tasks.filter((task) => task.status === 'done').length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-4 border-b border-white/5 px-6 py-3 text-[11px] text-ink-400">
        <span>
          <b className="text-[15px] font-medium text-ink-100">{tasks.length}</b> 个任务
        </span>
        <span>进行中 {active}</span>
        <span>已完成 {done}</span>
        <button
          onClick={async () => {
            await window.api.downloads.clear()
            await reload()
          }}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-white/8 px-2.5 text-[11px] transition-colors hover:bg-white/5"
        >
          <Trash2 size={12} />
          清空已完成
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <FolderOpen size={22} className="text-ink-600" />
            <p className="text-[13px] text-ink-300">还没有下载任务</p>
            <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-400">
              在发现页搜索结果里点下载图标，任务会出现在这里；下载完成会自动写入曲库。
            </p>
          </div>
        ) : (
          tasks.map((task) => {
            const percent =
              task.total > 0 ? Math.min(100, Math.round((task.received / task.total) * 100)) : task.status === 'done' ? 100 : 0
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 border-b border-white/[0.03] px-6 py-2 text-[12px] hover:bg-white/3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink-100">{task.title}</p>
                  <p className="truncate text-[11px] text-ink-500">{task.artist || "未知艺术家"}</p>
                </div>

                <span className={["shrink-0 rounded px-1.5 py-0.5 text-[10px]", STATUS_STYLE[task.status]].join(" ")}>
                  {STATUS_LABEL[task.status]}
                </span>

                <div className="w-32 shrink-0">
                  <div className="h-1 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full bg-brand-400 transition-all" style={{ width: percent + "%" }} />
                  </div>
                  <p className="mt-1 text-[10px] tabular-nums text-ink-500">
                    {task.total > 0
                      ? formatBytes(task.received) + ' / ' + formatBytes(task.total)
                      : formatBytes(task.received)}
                  </p>
                </div>

                <div className="flex w-24 shrink-0 items-center justify-end gap-1">
                  {task.status === 'running' || task.status === 'queued' ? (
                    <button
                      onClick={() => void window.api.downloads.cancel(task.id)}
                      className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-red-300"
                      title="取消"
                    >
                      <X size={13} />
                    </button>
                  ) : null}
                  {task.status === 'failed' || task.status === 'canceled' ? (
                    <button
                      onClick={() => void window.api.downloads.retry(task.id)}
                      className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-brand-300"
                      title="重试"
                    >
                      <RotateCw size={13} />
                    </button>
                  ) : null}
                  <button
                    onClick={() => void window.api.downloads.reveal(task.id)}
                    className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100"
                    title="打开所在文件夹"
                  >
                    <FolderOpen size={13} />
                  </button>
                  {task.status === 'running' ? (
                    <Loader2 size={12} className="animate-spin text-brand-400" />
                  ) : null}
                </div>

                {task.error ? (
                  <span className="w-40 shrink-0 truncate text-[10px] text-red-300/80" title={task.error}>
                    {task.error}
                  </span>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
