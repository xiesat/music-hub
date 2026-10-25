import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { FolderOpen, RotateCcw } from 'lucide-react'

export function SettingsView(): JSX.Element {
  const [downloadDir, setDownloadDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.api.downloads.dir().then((path) => {
      setDownloadDir(path)
      setDraft(path)
    })
  }, [])

  const pick = async (): Promise<void> => {
    setBusy(true)
    try {
      setDownloadDir(await window.api.downloads.pickDir())
    } finally {
      setBusy(false)
    }
  }

  const reset = async (): Promise<void> => {
    const path = await window.api.downloads.resetDir()
    setDownloadDir(path)
    setDraft(path)
    setMessage('已恢复默认目录')
  }

  const apply = async (): Promise<void> => {
    setMessage(null)
    try {
      const path = await window.api.downloads.setDir(draft)
      setDownloadDir(path)
      setDraft(path)
      setMessage('已保存：' + path)
    } catch (error) {
      setMessage('保存失败：' + (error as Error).message.replace(/^Error invoking remote method '[^']+':\s*/, ''))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
      <section className="rounded-xl border border-white/5 bg-ink-850/60 p-4">
        <h3 className="mb-1 text-[13px] text-ink-100">下载目录</h3>
        <p className="mb-3 text-[11px] text-ink-500">
          在线歌曲下载后会保存到这里，并自动加入曲库。
        </p>
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void apply()
            }}
            placeholder="下载目录，可直接编辑或粘贴路径"
            className="h-9 min-w-0 flex-1 rounded-lg border border-white/8 bg-ink-900 px-3 text-[11px] text-ink-200 outline-none placeholder:text-ink-600 focus:border-brand-500/60"
          />
          <button
            onClick={() => void apply()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400"
          >
            应用
          </button>
          <button
            onClick={() => void pick()}
            disabled={busy}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
          >
            <FolderOpen size={13} />
            选择目录
          </button>
          <button
            onClick={() => void window.api.downloads.openDir()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5"
          >
            打开
          </button>
          <button
            onClick={() => void reset()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[12px] text-ink-400 transition-colors hover:bg-white/5"
          >
            <RotateCcw size={12} />
            默认
          </button>
        </div>
        {message ? (
          <p className="mt-2 truncate text-[10px] text-emerald-300">{message}</p>
        ) : (
          <p className="mt-2 text-[10px] text-ink-500">
            默认目录：系统「音乐」文件夹下的 MusicHub。修改只影响之后的下载。
          </p>
        )}
        <p className="mt-1 truncate text-[10px] text-ink-600">当前生效：{downloadDir}</p>
      </section>

      <section className="rounded-xl border border-white/5 bg-ink-850/30 p-4 text-[11px] leading-relaxed text-ink-400">
        <p className="mb-1 text-ink-300">关于下载</p>
        <p>下载会先弹出风险确认；下载时会把封面一并保存为同名图片。</p>
        <p>VIP 曲目能否下载取决于登录账号的会员状态。</p>
      </section>
    </div>
  )
}