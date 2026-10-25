import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { FileCode2, LogIn, LogOut, Plug, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import type { ProviderAuthState, ProviderInfo } from '@shared/provider'

function cleanError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '')
}

export function ProvidersView(): JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [authMap, setAuthMap] = useState<Record<string, ProviderAuthState>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    const list = await window.api.providers.list()
    setProviders(list)
    const entries = await Promise.all(
      list.map(async (item) => [item.id, await window.api.providers.authState(item.id)] as const)
    )
    setAuthMap(Object.fromEntries(entries))
  }

  useEffect(() => {
    void load()
  }, [])

  const toggle = async (id: string, enabled: boolean): Promise<void> => {
    await window.api.providers.toggle(id, enabled)
    await load()
  }

  const importScript = async (): Promise<void> => {
    setError(null)
    try {
      const info = await window.api.providers.importScript()
      if (info) await load()
    } catch (err) {
      setError('导入失败：' + cleanError((err as Error).message))
    }
  }

  const removeScript = async (id: string): Promise<void> => {
    await window.api.providers.removeScript(id)
    await load()
  }

  const login = async (id: string): Promise<void> => {
    setBusy(id)
    setError(null)
    try {
      const result = await window.api.providers.login(id)
      if (!result.ok && !result.canceled) setError('登录失败：' + (result.error ?? '未知错误'))
      await load()
    } catch (err) {
      setError('登录失败：' + cleanError((err as Error).message))
    } finally {
      setBusy(null)
    }
  }

  const logout = async (id: string): Promise<void> => {
    await window.api.providers.logout(id)
    await load()
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
        <span className="text-[11px] text-ink-500">支持 MusicFree 风格插件；v2 脚本可用 ctx 与登录能力</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>
      ) : null}

      {providers.map((provider) => {
        const auth = authMap[provider.id]
        return (
          <div key={provider.id} className="rounded-xl border border-white/5 bg-ink-850/60 p-4">
            <div className="flex items-center gap-3">
              <Plug size={16} className="text-brand-400" />
              <span className="text-[13px] text-ink-100">{provider.name}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-400">v{provider.version}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-400">
                {provider.kind === 'builtin' ? '内置' : '脚本'}
              </span>

              {auth?.loggedIn ? (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  已登录 {auth.nickname || auth.uid || ''}
                </span>
              ) : null}

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

                {auth?.loginUrl ? (
                  auth.loggedIn ? (
                    <button
                      onClick={() => void logout(provider.id)}
                      className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-ink-300 transition-colors hover:bg-white/5"
                    >
                      <LogOut size={11} />
                      退出
                    </button>
                  ) : (
                    <button
                      onClick={() => void login(provider.id)}
                      disabled={busy === provider.id}
                      className="flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-[11px] font-medium text-ink-950 transition-colors hover:bg-brand-400 disabled:opacity-50"
                    >
                      <LogIn size={11} />
                      {busy === provider.id ? '登录中…' : '登录'}
                    </button>
                  )
                ) : null}

                {provider.kind === 'script' ? (
                  <button
                    onClick={() => void removeScript(provider.id)}
                    className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-ink-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 size={11} />
                  </button>
                ) : null}

                <button
                  onClick={() => void toggle(provider.id, !provider.enabled)}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px] transition-colors",
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
        )
      })}

      <div className="mt-2 rounded-xl border border-white/5 bg-ink-850/30 p-4 text-[11px] leading-relaxed text-ink-400">
        <p className="mb-1 text-ink-300">关于登录</p>
        <p>
          点「登录」会打开对应平台的官方登录页（账密 / 验证码 / 扫码都在官方页面完成），
          登录成功后只保存该平台必需的 cookie，并在本机加密存储。
        </p>
        <p className="mt-1">
          登录后可读取你的私人歌单；能否播放 VIP 曲目取决于账号本身的会员状态。
          第三方脚本可以读取它自己的 cookie，请只导入你信任的脚本。
        </p>
      </div>
    </div>
  )
}
