import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { FileCode2, Plug, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
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

  const [error, setError] = useState<string | null>(null)

  const importScript = async (): Promise<void> => {
    setError(null)
    try {
      const info = await window.api.providers.importScript()
      if (info) load()
    } catch (err) {
      setError('导入失败：' + (err as Error).message)
    }
  }

  const removeScript = async (id: string): Promise<void> => {
    await window.api.providers.removeScript(id)
    load()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => void importScript()}
          className="flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-[12px] font-medium text-ink-950 transition-colors hover:bg-brand-400"
        >
          <FileCode2 size={14} />
          导入音源脚本
        </button>
        <span className="text-[11px] text-ink-500">支持 MusicFree 风格插件（导出 search / getMediaSource / getLyric）</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>
      ) : null}
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
              {provider.kind === 'script' ? (
                <button
                  onClick={() => void removeScript(provider.id)}
                  className="ml-2 rounded-md border border-white/10 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
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
          内置音源在进程内运行；脚本音源运行在独立 worker 的受限 vm 上下文中（无 require / fs / process），
          仅允许 http(s) 且拦截内网地址，单次调用超 12 秒会终止该音源进程。
        </p>
        <p className="mt-1">匿名接口可搜索、取歌词；能否播放取决于曲目是否开放试听。</p>
      </div>
    </div>
  )
}