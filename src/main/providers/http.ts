// 带 Cookie 的极简 HTTP 客户端：网易云需要游客 cookie 才会下发播放地址

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const cookieStore = new Map<string, Map<string, string>>()

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function absorbCookies(url: string, response: Response): void {
  const raw = response.headers.getSetCookie?.() ?? []
  if (raw.length === 0) return
  const host = hostOf(url)
  if (!host) return
  const jar = cookieStore.get(host) ?? new Map<string, string>()
  for (const item of raw) {
    const [pair] = item.split(';')
    const index = pair.indexOf('=')
    if (index <= 0) continue
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
  cookieStore.set(host, jar)
}

function cookieHeader(url: string): string {
  const host = hostOf(url)
  const jar = cookieStore.get(host)
  if (!jar || jar.size === 0) return ''
  return Array.from(jar.entries())
    .map(([key, value]) => key + '=' + value)
    .join('; ')
}

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
  referer?: string
}

// 简单节流：两次请求之间至少间隔 350ms，避免触发平台风控
const MIN_INTERVAL_MS = 350
let lastRequestAt = 0
let queue: Promise<void> = Promise.resolve()

async function throttle(): Promise<void> {
  const run = queue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt)
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
  })
  queue = run.catch(() => undefined)
  await run
}

export async function httpRequest(url: string, options: RequestOptions = {}): Promise<Response> {
  await throttle()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000)
  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'application/json, text/plain, */*',
    ...(options.referer ? { Referer: options.referer } : {}),
    ...options.headers
  }
  const cookie = cookieHeader(url)
  if (cookie) headers.Cookie = cookie

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: controller.signal
    })
    absorbCookies(url, response)
    return response
  } finally {
    clearTimeout(timer)
  }
}

export async function httpJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const response = await httpRequest(url, options)
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return (await response.json()) as T
}

export function resetCookies(): void {
  cookieStore.clear()
}