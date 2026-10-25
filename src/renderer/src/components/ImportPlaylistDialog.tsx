import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import type { PlatformAuthStateLike, PlatformId, PlatformPlaylist } from '@shared/types'
import { usePlaylists } from '../stores/playlists'
import { useUi } from '../stores/ui'

interface Props {
  onImported: (playlistId: string) => void
}

function cleanError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

export function ImportPlaylistDialog({ onImported }: Props): JSX.Element | null {
  const open = useUi((state) => state.importOpen)
  const closeImport = useUi((state) => state.closeImport)
  const refreshPlaylists = usePlaylists((state) => state.refresh)

  const [platform, setPlatform] = useState<PlatformId>('netease')
  const [account, setAccount] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [items, setItems] = useState<PlatformPlaylist[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [auth, setAuth] = useState<PlatformAuthStateLike | null>(null)

  // 平台登录态：登录后可省略账号输入，直接列「我的歌单」
  useEffect(() => {
    if (!open) return
    let alive = true
    void window.api.providers
      .authState('script:' + platform)
      .then((state) => {
        if (alive) setAuth(state)
      })
      .catch(() => {
        if (alive) setAuth(null)
      })
    return () => {
      alive = false
    }
  }, [open, platform, items.length])

  if (!open) return null

  const lookup = async (): Promise<void> => {
    const value = account.trim()
    if (!value && !(auth && auth.loggedIn)) return
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const list = await window.api.playlists.listPlatform(platform, value)
      setItems(list)
      if (list.length === 0) setMessage('没查到公开歌单，可改用歌单 ID 直接导入')
    } catch (err) {
      setError(cleanError((err as Error).message))
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const doImport = async (id: string): Promise<void> => {
    setImporting(id)
    setError(null)
    setMessage(null)
    try {
      const result = await window.api.playlists.importPlatform(platform, id)
      await refreshPlaylists()
      setMessage(
        '已导入「' +
          result.name +
          '」 ' +
          result.imported +
          ' 首' +
          (result.playable ? '' : '（QQ 音乐曲目播放需登录，导入后可能无法直接播放）')
      )
      onImported(result.playlistId)
      closeImport()
    } catch (err) {
      setError(cleanError((err as Error).message))
    } finally {
      setImporting(null)
    }
  }

  const directImport = async (): Promise<void> => {
    const value = account.trim()
    if (!value) return
    // 输入的是纯数字歌单 ID 时直接按歌单导入
    await doImport(value)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[78vh] w-[620px] flex-col overflow-hidden rounded-xl border border-white/10 bg-ink-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <span className="text-[13px] text-ink-100">导入平台歌单</span>
          <button
            onClick={closeImport}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-white/10 hover:text-ink-100"
          >
            <X size={15} />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
          <select
            value={platform}
            onChange={(event) => {
              setPlatform(event.target.value as PlatformId)
              setItems([])
              setError(null)
              setMessage(null)
            }}
            className="h-9 rounded-lg border border-white/8 bg-ink-850 px-2 text-[12px] text-ink-200 outline-none"
          >
            <option value="netease">网易云音乐</option>
            <option value="qq">QQ 音乐</option>
          </select>
          <input
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void lookup()
            }}
            placeholder={
              auth && auth.loggedIn
                ? "已登录，留空即加载「我的歌单」；也可填歌单 ID"
                : platform === "netease"
                  ? "网易云用户 ID 或歌单 ID（登录后可留空）"
                  : "QQ 号或歌单 ID（登录后可留空）"
            }
            className="h-9 flex-1 rounded-lg border border-white/8 bg-ink-850 px-3 text-[12px] text-ink-100 outline-none placeholder:text-ink-400 focus:border-brand-500/60"
          />
          {auth && auth.loggedIn ? (
            <span className="shrink-0 rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">
              已登录 {auth.nickname || auth.uid || ''}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-ink-500">未登录</span>
          )}
          <button
            onClick={() => void lookup()}
            disabled={loading}
            className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            查歌单
          </button>
          <button
            onClick={() => void directImport()}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/8 px-3 text-[12px] text-ink-200 transition-colors hover:bg-white/5"
            title="把输入内容当作歌单 ID 直接导入"
          >
            按 ID 导入
          </button>
        </div>

        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-[11px] text-red-300">{error}</div>
        ) : null}
        {message ? (
          <div className="border-b border-white/5 px-5 py-2 text-[11px] text-ink-400">{message}</div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-ink-500">
              填入账号后点「查歌单」，或直接把歌单 ID 粘进来按 ID 导入
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-ink-700">
                  {item.coverUrl ? (
                    <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-ink-100">{item.name}</p>
                  <p className="text-[10px] text-ink-500">{item.trackCount} 首 · ID {item.id}</p>
                </div>
                <button
                  onClick={() => void doImport(item.id)}
                  disabled={importing !== null}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-ink-200 transition-colors hover:bg-white/10 disabled:opacity-50"
                >
                  {importing === item.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  导入
                </button>
              </div>
            ))
          )}
        </div>

        <footer className="border-t border-white/5 px-5 py-2 text-[10px] leading-relaxed text-ink-500">
          网易云：公开歌单可直接导入并播放（VIP 曲目仍拿不到播放地址）。
          QQ 音乐：歌单结构可导入，但曲目播放需要登录态，目前仅作浏览与归档。
        </footer>
      </div>
    </div>
  )
}