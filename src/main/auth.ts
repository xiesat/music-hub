// 通用登录窗口：加载官方登录页，抓取指定 cookie，加密存库
import { BrowserWindow, safeStorage, session } from 'electron'
import { getDb } from './db'

export interface LoginRequest {
  providerId: string
  url: string
  /** 出现这些 cookie 就算登录成功 */
  cookies: string[]
  /** 可选：登录后先访问这个页面激活会话 */
  warmup?: string
}

export interface LoginResult {
  ok: boolean
  canceled?: boolean
  error?: string
}

export interface StoredCookie {
  name: string
  value: string
  domain: string
  path: string
}

export interface ProviderCredential {
  cookies: StoredCookie[]
  uid?: string
  nickname?: string
  savedAt: number
}

function partitionOf(providerId: string): string {
  return 'persist:provider-' + providerId.replace(/[^a-z0-9_-]/gi, '_')
}

async function readCookies(providerId: string): Promise<StoredCookie[]> {
  const ses = session.fromPartition(partitionOf(providerId))
  const list = await ses.cookies.get({})
  return list.map((item) => ({
    name: item.name,
    value: item.value,
    domain: item.domain ?? '',
    path: item.path ?? '/'
  }))
}

function saveCredential(providerId: string, credential: ProviderCredential): void {
  const json = JSON.stringify(credential)
  let payload = json
  try {
    if (safeStorage.isEncryptionAvailable()) {
      payload = 'enc:' + safeStorage.encryptString(json).toString('base64')
    }
  } catch {
    /* 加密失败则明文兜底（仅本机） */
  }
  getDb()
    .prepare(
      'INSERT INTO provider_credentials (provider_id, payload, uid, nickname, saved_at, expires_at)' +
        ' VALUES (?, ?, ?, ?, ?, NULL)' +
        ' ON CONFLICT(provider_id) DO UPDATE SET payload = excluded.payload, uid = excluded.uid,' +
        ' nickname = excluded.nickname, saved_at = excluded.saved_at'
    )
    .run(providerId, payload, credential.uid ?? null, credential.nickname ?? null, credential.savedAt)
}

export function loadCredential(providerId: string): ProviderCredential | null {
  try {
    const row = getDb()
      .prepare('SELECT payload FROM provider_credentials WHERE provider_id = ?')
      .get(providerId) as { payload: string } | undefined
    if (!row) return null

    let json = row.payload
    if (json.startsWith('enc:')) {
      if (!safeStorage.isEncryptionAvailable()) return null
      json = safeStorage.decryptString(Buffer.from(json.slice(4), 'base64'))
    }
    return JSON.parse(json) as ProviderCredential
  } catch {
    return null
  }
}

export function clearCredential(providerId: string): void {
  getDb().prepare('DELETE FROM provider_credentials WHERE provider_id = ?').run(providerId)
  const ses = session.fromPartition(partitionOf(providerId))
  void ses.clearStorageData({ storages: ['cookies'] })
}

/**
 * 打开官方登录窗口，轮询 cookie，成功后保存凭据并关闭窗口。
 * 用户关窗口 / 超时 → 视为取消。
 */
export function loginProvider(request: LoginRequest): Promise<LoginResult> {
  return new Promise((resolve) => {
    const partition = partitionOf(request.providerId)

    const win = new BrowserWindow({
      width: 560,
      height: 760,
      title: '登录 · ' + request.providerId,
      autoHideMenuBar: true,
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true }
    })

    let finished = false
    let timer: NodeJS.Timeout | null = null

    const finish = (result: LoginResult): void => {
      if (finished) return
      finished = true
      if (timer) clearInterval(timer)
      if (!win.isDestroyed()) win.close()
      resolve(result)
    }

    const check = async (): Promise<void> => {
      try {
        const cookies = await readCookies(request.providerId)
        const names = new Set(cookies.map((item) => item.name))
        const allPresent = request.cookies.every((name) => names.has(name))
        if (!allPresent) return

        saveCredential(request.providerId, { cookies, savedAt: Date.now() })
        finish({ ok: true })
      } catch (error) {
        finish({ ok: false, error: (error as Error).message })
      }
    }

    win.on('closed', () => {
      if (!finished) {
        finished = true
        if (timer) clearInterval(timer)
        resolve({ ok: false, canceled: true })
      }
    })

    void win.loadURL(request.url).then(() => {
      if (request.warmup) {
        setTimeout(() => {
          if (!win.isDestroyed()) void win.loadURL(request.warmup as string)
        }, 4000)
      }
    })

    timer = setInterval(() => void check(), 1500)
    setTimeout(() => finish({ ok: false, error: '登录超时（5 分钟）' }), 5 * 60 * 1000)
  })
}

export async function updateCredentialProfile(
  providerId: string,
  profile: { uid?: string; nickname?: string }
): Promise<void> {
  const current = loadCredential(providerId)
  if (!current) return
  saveCredential(providerId, { ...current, uid: profile.uid, nickname: profile.nickname })
}