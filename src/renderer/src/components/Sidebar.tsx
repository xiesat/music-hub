import type { JSX } from 'react'
import {
  Compass,
  Library,
  ListMusic,
  Download,
  Settings,
  Plug
} from 'lucide-react'

export type ViewId = 'discover' | 'library' | 'playlists' | 'downloads' | 'providers' | 'settings'

const NAV: { id: ViewId; label: string; icon: typeof Compass }[] = [
  { id: 'discover', label: '发现音乐', icon: Compass },
  { id: 'library', label: '本地曲库', icon: Library },
  { id: 'playlists', label: '歌单', icon: ListMusic },
  { id: 'downloads', label: '下载管理', icon: Download },
  { id: 'providers', label: '音源插件', icon: Plug },
  { id: 'settings', label: '设置', icon: Settings }
]

interface Props {
  active: ViewId
  onChange: (id: ViewId) => void
  version: string
}

export function Sidebar({ active, onChange, version }: Props): JSX.Element {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-white/5 bg-ink-950/60">
      <nav className="flex flex-col gap-1 p-3">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = id === active
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={[
                "no-drag flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                isActive
                  ? 'bg-white/8 text-white'
                  : 'text-ink-300 hover:bg-white/5 hover:text-ink-50'
              ].join(' ')}
            >
              <Icon size={16} strokeWidth={1.8} className={isActive ? "text-brand-400" : ""} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mt-auto border-t border-white/5 p-4">
        <p className="text-[11px] leading-relaxed text-ink-400">
          播放器 + 插件化音源
          <br />
          仅供个人学习使用
        </p>
        <p className="mt-2 text-[11px] text-ink-400">v{version}</p>
      </div>
    </aside>
  )
}
