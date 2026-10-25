import type { JSX } from 'react'
export function TitleBar(): JSX.Element {
  return (
    <header className="drag-region flex h-11 shrink-0 items-center gap-2 border-b border-white/5 px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-ink-950">
          M
        </div>
        <span className="text-[13px] font-medium tracking-wide text-ink-200">MusicHub</span>
      </div>
      <div className="ml-4 flex-1" />
      <span className="text-[11px] text-ink-400">M1 · 本地曲库</span>
    </header>
  )
}