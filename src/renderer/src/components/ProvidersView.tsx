import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Plug, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ProviderInfo } from '@shared/provider'

export function ProvidersView(): JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  const load = (): void => {
    void window.api.providers.list().then(setProviders)
  }

  useEffect(load, [])

  const toggle = async (id: string, enabled: boolean): Promise<void> => {
    await window.api.providers.toggle(id, enabled)
    load()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
      {providers.map((provider) => (
        <div key={provider.id} className="rounded-xl border border-white/5 bg-ink-850/60 p-4">
          <div className="flex items-center gap-3">
            <Plug size={16} className="text-brand-400" />
            <span className="text-[13px] text-ink-100">{provider.name}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-400">v{provider.version}</span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-400">
              {provider.kind === 'builtin' ? '内置' : '脚本'}
            </span>
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              {provider.lastError ? (
                <span className="flex items-center gap-1 text-amber-400">
                  <ShieldAlert size={12} />
                  {provider.lastError}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck size={12} />
                  正常
                </span>
              )}
              <button
                onClick={() => void toggle(provider.id, !provider.enabled)}
                className={[
                  "ml-2 rounded-md border px-2 py-1 text-[11px] transition-colors",
                  provider.enabled
                    ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                    : 'border-white/10 text-ink-400 hover:bg-white/5'
                ].join(' ')}
              >
                {provider.enabled ? '已启用' : '已禁用'}
              </button>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-400">
            {provider.capabilities.map((capability) => (
              <span key={capability} className="rounded bg-white/5 px-1.5 py-0.5">
                {capability}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div className="mt-2 rounded-xl border border-white/5 bg-ink-850/30 p-4 text-[11px] leading-relaxed text-ink-400">
        <p className="mb-1 text-ink-300">说明</p>
        <p>
          当前为内置音源（进程内运行）。M4 将接入脚本音源沙箱，可直接导入 LX / MusicFree 音源脚本，
          并在独立 worker 中限制其文件与网络权限。
        </p>
        <p className="mt-1">匿名接口可搜索、取歌词；能否播放取决于曲目是否开放试听。</p>
      </div>
    </div>
  )
}
