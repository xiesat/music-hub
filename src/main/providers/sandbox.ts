// 脚本音源沙箱：worker_threads + vm，脚本拿不到 require/fs/process
// v2 协议：方法第一个参数是 ctx（提供 request / crypto / auth / 日志），v1 脚本仍按老签名调用
import { Worker } from 'node:worker_threads'
import type { StoredCookie } from '../auth'

const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const vm = require('node:vm')
const nodeCrypto = require('node:crypto')

function send(message) { parentPort.postMessage(message) }

// ---------- cookie 罐（按域名匹配） ----------
const cookieJar = new Map()

function domainMatches(host, domain) {
  const raw = String(domain || '')
  // 同样不能用 /^\./（模板字符串会吃掉转义）
  const clean = raw.charAt(0) === '.' ? raw.slice(1) : raw
  if (!clean) return false
  return host === clean || host.endsWith('.' + clean)
}

function seedCookies(list) {
  if (!Array.isArray(list)) return
  for (const item of list) {
    const domain = item.domain || ''
    if (!domain) continue
    // 注意：模板字符串里 \. 会被吃掉转义，这里用字符串判断而不是正则
    const key = domain.charAt(0) === '.' ? domain.slice(1) : domain
    const jar = cookieJar.get(key) || new Map()
    jar.set(item.name, item.value)
    cookieJar.set(key, jar)
  }
}

function absorbCookies(url, response) {
  try {
    const list = response.headers.getSetCookie ? response.headers.getSetCookie() : []
    if (!list || list.length === 0) return
    const host = new URL(url).hostname
    const jar = cookieJar.get(host) || new Map()
    for (const item of list) {
      const pair = String(item).split(';')[0]
      const idx = pair.indexOf('=')
      if (idx <= 0) continue
      jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
    }
    cookieJar.set(host, jar)
  } catch (e) {}
}

function cookieHeader(url) {
  try {
    const host = new URL(url).hostname
    const pairs = []
    for (const [domain, jar] of cookieJar) {
      if (!domainMatches(host, domain)) continue
      for (const [name, value] of jar) pairs.push(name + '=' + value)
    }
    return pairs.join('; ')
  } catch (e) { return '' }
}

seedCookies(workerData.auth && workerData.auth.cookies)

// ---------- 受限 fetch ----------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function safeFetch(input, init) {
  let target = String(input)
  if (!/^https?:\\/\\//i.test(target)) throw new Error('只允许 http/https 请求')
  const host = new URL(target).hostname
  if (/^(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/.test(host)) {
    throw new Error('不允许访问内网地址: ' + host)
  }

  const headers = Object.assign({ 'User-Agent': UA }, (init && init.headers) || {})
  const cookie = cookieHeader(target)
  if (cookie && !headers.Cookie && !headers.cookie) headers.Cookie = cookie

  const response = await fetch(target, {
    method: (init && init.method) || 'GET',
    headers: headers,
    body: init && init.body
  })
  absorbCookies(target, response)
  const text = await response.text()
  return {
    ok: response.ok,
    status: response.status,
    headers: { get: (name) => response.headers.get(name) },
    text: async () => text,
    json: async () => JSON.parse(text)
  }
}

// ---------- ctx（v2 协议） ----------
function buildUrl(url, params) {
  if (!params) return url
  const query = Object.keys(params)
    .filter(function (k) { return params[k] !== undefined && params[k] !== null })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])) })
    .join('&')
  if (!query) return url
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + query
}

const auth = workerData.auth || null

const ctx = {
  auth: {
    me: auth && auth.uid ? { uid: auth.uid, nickname: auth.nickname || '' } : null,
    loggedIn: Boolean(auth && auth.cookies && auth.cookies.length),
    // 只返回本音源自己的 cookie，且按名字取，避免脚本拿到整份凭据
    get: function (name) {
      if (!auth || !Array.isArray(auth.cookies)) return null
      const found = auth.cookies.find(function (item) { return item.name === name })
      return found ? found.value : null
    }
  },
  get: async function (url, params, options) {
    const opts = options || {}
    const response = await safeFetch(buildUrl(url, params), {
      headers: Object.assign({ Referer: opts.referer || '' }, opts.headers || {}),
      method: 'GET'
    })
    return response.json()
  },
  post: async function (url, body, options) {
    const opts = options || {}
    const payload =
      typeof body === 'string'
        ? body
        : Object.keys(body || {})
            .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(body[k])) })
            .join('&')
    const response = await safeFetch(url, {
      method: 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/x-www-form-urlencoded', Referer: opts.referer || '' },
        opts.headers || {}
      ),
      body: payload
    })
    return response.json()
  },
  mapSong: function (raw) {
    const song = raw || {}
    const pick = function () {
      for (let i = 0; i < arguments.length; i++) {
        const value = song[arguments[i]]
        if (value !== undefined && value !== null && value !== '') return value
      }
      return undefined
    }
    const artists =
      pick('artist', 'singer', 'singername', 'SingerName') ||
      (song.ar || song.artists || []).map(function (a) { return a.name }).join(' / ')
    const album = pick('album', 'albumname', 'AlbumName') || (song.al ? song.al.name : '')
    const cover = pick('cover', 'pic', 'picUrl') || (song.al ? song.al.picUrl : '') || (song.album ? song.album.picUrl : '')
    const duration = pick('duration', 'dt', 'interval')
    return {
      id: String(pick('id', 'mid', 'songmid', 'hash', 'FileHash') || ''),
      title: pick('title', 'name', 'songname', 'SongName') || '未知标题',
      artist: Array.isArray(artists) ? artists.join(' / ') : String(artists || ''),
      album: String(album || ''),
      duration: typeof duration === 'number' ? duration : null,
      cover: cover ? String(cover).replace(/^http:/, 'https:') : ''
    }
  },
  error: function (code, message) {
    const error = new Error(message || code)
    error.code = code
    return error
  },
  log: function () {
    send({ type: 'log', args: Array.prototype.slice.call(arguments).map(String) })
  },
  // 通用请求：自定义 method / headers / body（签名接口需要 POST JSON）
  request: async function (url, options) {
    const opts = options || {}
    const response = await safeFetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body
    })
    return response.json()
  },
  // 加载插件目录内的脚本资源（如平台签名算法），按浏览器方式在全局作用域求值
  loadScript: function (relativePath) {
    ensureBrowserShims()
    const path = require('node:path')
    const full = path.resolve(pluginDir(), String(relativePath))
    if (full.indexOf(path.resolve(pluginDir())) !== 0) throw new Error('只允许加载插件目录内的文件')
    const source = fs.readFileSync(full, 'utf8')
    const previous = currentFile
    currentFile = full
    try {
      vm.runInThisContext(source, { filename: full })
    } finally {
      currentFile = previous
    }
    return true
  },
  // 读取 loadScript 之后产生的全局函数（如 getsign）
  global: function (name) {
    const value = globalThis[name]
    return typeof value === 'function' ? value : value === undefined ? null : value
  },
  crypto: {
    md5: function (text, encoding) {
      return nodeCrypto.createHash('md5').update(String(text), encoding || 'utf8').digest('hex')
    },
    sha1: function (text) {
      return nodeCrypto.createHash('sha1').update(String(text), 'utf8').digest('hex')
    },
    base64: function (text) { return Buffer.from(String(text)).toString('base64') },
    aesEcb: function (text, key) {
      const cipher = nodeCrypto.createCipheriv('aes-128-ecb', Buffer.from(key), null)
      return Buffer.concat([cipher.update(Buffer.from(text)), cipher.final()]).toString('base64')
    },
    aesCbc: function (text, key, iv) {
      const cipher = nodeCrypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv))
      return Buffer.concat([cipher.update(Buffer.from(text)), cipher.final()]).toString('base64')
    },
    randomHex: function (size) { return nodeCrypto.randomBytes(size || 8).toString('hex') }
  }
}

// ---------- 沙箱全局 ----------
// ---------- 插件资源加载（如签名算法包）----------
function pluginDir() {
  return require('node:path').dirname(workerData.scriptPath)
}

let currentFile = workerData.scriptPath
function currentDir() {
  return require('node:path').dirname(currentFile)
}

let shimsReady = false
function ensureBrowserShims() {
  if (shimsReady) return
  shimsReady = true
  const g = globalThis
  g.window = g
  g.self = g
  g.location = { host: 'y.qq.com', href: 'https://y.qq.com/', protocol: 'https:', origin: 'https://y.qq.com' }
  g.navigator = { userAgent: UA, platform: 'Win32', language: 'zh-CN' }
  g.document = { createElement: function () { return { style: {}, getContext: function () { return null } } }, cookie: '', referrer: 'https://y.qq.com/' }
  g.localStorage = { getItem: function () { return null }, setItem: function () {}, removeItem: function () {} }
  const baseRequire = require
  // 相对路径按「当前正在求值的文件」所在目录解析，和 Node 一致
  g.require = function (id) {
    return id.charAt(0) === '.'
      ? baseRequire(require('node:path').resolve(currentDir(), id))
      : baseRequire(id)
  }
}

const sandbox = {
  console: {
    log: function () { send({ type: 'log', args: Array.prototype.slice.call(arguments).map(String) }) },
    error: function () { send({ type: 'log', args: Array.prototype.slice.call(arguments).map(String) }) }
  },
  fetch: safeFetch,
  URL, URLSearchParams, TextDecoder, TextEncoder, setTimeout, clearTimeout,
  btoa: (v) => Buffer.from(v, 'binary').toString('base64'),
  atob: (v) => Buffer.from(v, 'base64').toString('binary'),
  crypto: { randomUUID: () => nodeCrypto.randomUUID() },
  ctx: ctx,
  Promise, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
}

const context = vm.createContext(sandbox)

try {
  const source = fs.readFileSync(workerData.scriptPath, 'utf8')
  const module = { exports: {} }
  const wrapper = '(function (module, exports, ctx) {\\n' + source + '\\n})'
  const fn = vm.runInContext(wrapper, context, { filename: workerData.scriptPath, timeout: 3000 })
  fn(module, module.exports, ctx)
  const provider = module.exports.default || module.exports
  const apiVersion = Number(provider && provider.apiVersion) || 1
  if (!provider || typeof provider.search !== 'function') {
    send({ type: 'ready', ok: false, error: '脚本必须导出 search 方法' })
  } else {
    send({
      type: 'ready',
      ok: true,
      apiVersion: apiVersion,
      platform: (provider.platform && provider.platform.name) || provider.platform || '',
      login: provider.login || null,
      capabilities: provider.capabilities || []
    })
    parentPort.on('message', async function (message) {
      const id = message.id, method = message.method, args = message.args || []
      try {
        const target = provider[method]
        if (typeof target !== 'function') {
          send({ type: 'reply', id: id, ok: false, error: '脚本未实现 ' + method })
          return
        }
        const result = apiVersion >= 2
          ? await target.apply(provider, [ctx].concat(args))
          : await target.apply(provider, args)
        send({ type: 'reply', id: id, ok: true, result: result })
      } catch (error) {
        send({ type: 'reply', id: id, ok: false, error: (error && error.message) || String(error), code: error && error.code })
      }
    })
  }
} catch (error) {
  send({ type: 'ready', ok: false, error: (error && error.message) || String(error) })
}
`

export interface ScriptMeta {
  platform: string
  apiVersion: number
  capabilities: string[]
  login: { type: string; url?: string; cookies?: string[]; warmup?: string } | null
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface WorkerEntry {
  worker: Worker
  meta: ScriptMeta
  /** 创建该 worker 时的凭据指纹：凭据变了必须重建，否则脚本读到的是旧登录态 */
  authKey: string
}

export interface ProviderAuthInput {
  cookies: StoredCookie[]
  uid?: string
  nickname?: string
}

const workers = new Map<string, WorkerEntry>()
const pending = new Map<number, PendingCall>()
let nextCallId = 1

function authKeyOf(auth?: ProviderAuthInput): string {
  if (!auth) return 'none'
  return (auth.uid ?? '') + '|' + (auth.cookies?.length ?? 0)
}

async function createWorker(scriptPath: string, auth?: ProviderAuthInput): Promise<ScriptMeta> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: { scriptPath, auth: auth ?? null }
    })

    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error('音源脚本加载超时'))
    }, 5000)

    worker.once('message', (message: any) => {
      clearTimeout(timer)
      if (message.type !== 'ready') return
      if (!message.ok) {
        void worker.terminate()
        reject(new Error(message.error ?? '脚本加载失败'))
        return
      }
      const meta: ScriptMeta = {
        platform: message.platform ?? '',
        apiVersion: message.apiVersion ?? 1,
        capabilities: message.capabilities ?? [],
        login: message.login ?? null
      }
      workers.set(scriptPath, { worker, meta, authKey: authKeyOf(auth) })
      resolve(meta)
    })

    worker.on('message', (message: any) => {
      if (message.type === 'log') {
        console.log('[provider]', ...(message.args ?? []))
        return
      }
      if (message.type !== 'reply' || message.id === undefined) return
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      clearTimeout(call.timer)
      if (message.ok) {
        call.resolve(message.result)
      } else {
        const error = new Error(message.error ?? '脚本调用失败') as Error & { code?: string }
        error.code = message.code
        call.reject(error)
      }
    })

    worker.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    worker.on('exit', (code) => {
      for (const [id, call] of pending) {
        clearTimeout(call.timer)
        call.reject(new Error('音源脚本进程已退出 (code ' + code + ')'))
        pending.delete(id)
      }
      const entry = workers.get(scriptPath)
      if (entry && entry.worker === worker) workers.delete(scriptPath)
    })
  })
}

async function getWorker(scriptPath: string, auth?: ProviderAuthInput): Promise<WorkerEntry> {
  const wanted = authKeyOf(auth)
  const existing = workers.get(scriptPath)
  if (existing) {
    if (existing.authKey === wanted) return existing
    // 凭据变化（登录/登出）→ 重启脚本，让 ctx.auth 反映最新状态
    disposeScriptProvider(scriptPath)
  }
  await createWorker(scriptPath, auth)
  const entry = workers.get(scriptPath)
  if (!entry) throw new Error('音源脚本启动失败')
  return entry
}

export async function callScriptProvider<T>(
  scriptPath: string,
  method: string,
  args: unknown[],
  timeoutMs = 12_000,
  auth?: ProviderAuthInput
): Promise<T> {
  const entry = await getWorker(scriptPath, auth)
  const id = nextCallId++

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      void entry.worker.terminate()
      workers.delete(scriptPath)
      reject(new Error('音源脚本响应超时（' + timeoutMs + 'ms）'))
    }, timeoutMs)

    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer })
    entry.worker.postMessage({ id, method, args })
  })
}

export function getScriptMeta(scriptPath: string): ScriptMeta | null {
  return workers.get(scriptPath)?.meta ?? null
}

export function getScriptPlatform(scriptPath: string): string {
  return workers.get(scriptPath)?.meta.platform ?? ''
}

export function disposeScriptProvider(scriptPath: string): void {
  const entry = workers.get(scriptPath)
  if (!entry) return
  void entry.worker.terminate()
  workers.delete(scriptPath)
}

export function disposeAll(): void {
  for (const entry of workers.values()) void entry.worker.terminate()
  workers.clear()
  pending.clear()
}