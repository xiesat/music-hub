import type { JSX } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useUi } from '../stores/ui'

export function DownloadRiskDialog(): JSX.Element | null {
  const pending = useUi((state) => state.pendingDownloads)
  const close = useUi((state) => state.closeDownload)
  if (!pending || pending.length === 0) return null

  const count = pending.length

  const confirm = async (): Promise<void> => {
    for (const item of pending) {
      await window.api.downloads.add(item)
    }
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[520px] overflow-hidden rounded-xl border border-amber-500/30 bg-ink-900 shadow-2xl">
        <header className="flex items-center gap-2 border-b border-white/5 px-5 py-3 text-[13px] text-amber-300">
          <AlertTriangle size={16} />
          下载前请确认
        </header>
        <div className="space-y-3 px-5 py-4 text-[12px] leading-relaxed text-ink-300">
          <p className="truncate text-[13px] text-ink-100">
            {count === 1 ? pending[0].title : '共 ' + count + ' 首'}
            {count === 1 ? (
              <span className="ml-2 text-[11px] text-ink-500">{pending[0].artist}</span>
            ) : null}
          </p>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>下载后文件会保存到本地下载目录，并写入你的曲库。</li>
            <li>
              受版权保护的内容下载可能违反平台协议或当地法律，
              <b>请自行确认你拥有相应的使用权</b>。
            </li>
            <li>使用登录态的下载可能触发平台风控，账号存在被限制的风险。</li>
            <li>本项目仅供个人学习研究，不提供任何内容分发。</li>
          </ul>
          <p className="text-[11px] text-ink-500">勾选下方确认后才会开始下载。</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            onClick={close}
            className="h-8 rounded-lg border border-white/10 px-3 text-[12px] text-ink-300 transition-colors hover:bg-white/5"
          >
            取消
          </button>
          <button
            onClick={() => void confirm()}
            className="h-8 rounded-lg bg-amber-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-amber-400"
          >
            我已了解风险，继续下载
          </button>
        </footer>
      </div>
    </div>
  )
}