// 脚本音源沙箱：worker_threads + vm 上下文，脚本拿不到 require/fs/process
import { Worker } from 'node:worker_threads'

/** 在 worker 内执行的引导代码：加载脚本、构造受限全局、转发调用 */
const WORKER_BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const vm = require('node:vm')

function send(message) { parentPort.postMessage(message) }

// worker 内的简易 cookie 罐（音源脚本需要登录态/游客态时用）
const cookieJar = new Map()

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
    const jar = cookieJar.get(new URL(url).hostname)
    if (!jar || jar.size === 0) return ''
    return Array.from(jar.entries()).map(function (kv) { return kv[0] + '=' + kv[1] }).join('; ')
  } catch (e) { return '' }
}

// 只允许 http/https，且拦截本地/内网地址
async function safeFetch(input, init) {
  let target = String(input)
  if (!/^https?:\\/\\//i.test(target)) throw new Error('只允许 http/https 请求')
  const host = new URL(target).hostname
  if (/^(localhost|127\\.|10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.)/.test(host)) {
    throw new Error('不允许访问内网地址: ' + host)
  }
  const headers = Object.assign({}, (init && init.headers) || {})
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

const sandbox = {
  console: { log: (...args) => send({ type: 'log', args: args.map(String) }), error: (...args) => send({ type: 'log', args: args.map(String) }) },
  fetch: safeFetch,
  URL,
  URLSearchParams,
  TextDecoder,
  TextEncoder,
  setTimeout,
  clearTimeout,
  btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  crypto: { randomUUID: () => require('node:crypto').randomUUID() },
  Promise, Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
}

const context = vm.createContext(sandbox)

try {
  const source = fs.readFileSync(workerData.scriptPath, 'utf8')
  const module = { exports: {} }
  const wrapper = '(function (module, exports) {\\n' + source + '\\n})'
  const fn = vm.runInContext(wrapper, context, { filename: workerData.scriptPath, timeout: 3000 })
  fn(module, module.exports)
  const provider = module.exports.default || module.exports
  if (!provider || typeof provider.search !== 'function') {
    send({ type: 'ready', ok: false, error: '脚本必须导出 search 方法' })
  } else {
    send({ type: 'ready', ok: true, platform: provider.platform || '' })
    parentPort.on('message', async (message) => {
      const { id, method, args } = message
      try {
        const fn = provider[method]
        if (typeof fn !== 'function') {
          send({ type: 'reply', id, ok: false, error: '脚本未实现 ' + method })
          return
        }
        const result = await fn.apply(provider, args)
        send({ type: 'reply', id, ok: true, result })
      } catch (error) {
        send({ type: 'reply', id, ok: false, error: error && error.message ? error.message : String(error) })
      }
    })
  }
} catch (error) {
  send({ type: 'ready', ok: false, error: error && error.message ? error.message : String(error) })
}
`

export interface SandboxScriptInfo {
  platform: string
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const workers = new Map<string, Worker>()
const platforms = new Map<string, string>()
const pending = new Map<number, PendingCall>()
let nextCallId = 1

function createWorker(scriptPath: string): Promise<SandboxScriptInfo> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_BOOTSTRAP, { eval: true, workerData: { scriptPath } })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error('音源脚本加载超时'))
    }, 5000)

    worker.once('message', (message: { type: string; ok: boolean; error?: string; platform?: string }) => {
      clearTimeout(timer)
      if (message.type !== 'ready') return
      if (!message.ok) {
        void worker.terminate()
        reject(new Error(message.error ?? '脚本加载失败'))
        return
      }
      platforms.set(scriptPath, message.platform ?? '')
      resolve({ platform: message.platform ?? '' })
    })

    worker.on('message', (message: { type: string; id?: number; ok?: boolean; result?: unknown; error?: string }) => {
      if (message.type !== 'reply' || message.id === undefined) return
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      clearTimeout(call.timer)
      if (message.ok) call.resolve(message.result)
      else call.reject(new Error(message.error ?? '脚本调用失败'))
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
      for (const [path, item] of workers) {
        if (item === worker) workers.delete(path)
      }
    })

    workers.set(scriptPath, worker)
  })
}

async function getWorker(scriptPath: string): Promise<Worker> {
  const existing = workers.get(scriptPath)
  if (existing) return existing
  await createWorker(scriptPath)
  const worker = workers.get(scriptPath)
  if (!worker) throw new Error('音源脚本启动失败')
  return worker
}

export async function callScriptProvider<T>(
  scriptPath: string,
  method: string,
  args: unknown[],
  timeoutMs = 12_000
): Promise<T> {
  const worker = await getWorker(scriptPath)
  const id = nextCallId++

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      // 超时的脚本直接杀掉，避免挂死主进程
      void worker.terminate()
      workers.delete(scriptPath)
      reject(new Error('音源脚本响应超时（' + timeoutMs + 'ms）'))
    }, timeoutMs)

    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
      timer
    })

    worker.postMessage({ id, method, args })
  })
}

export function getScriptPlatform(scriptPath: string): string {
  return platforms.get(scriptPath) ?? ''
}

export function disposeScriptProvider(scriptPath: string): void {
  const worker = workers.get(scriptPath)
  if (!worker) return
  void worker.terminate()
  workers.delete(scriptPath)
}

export function disposeAll(): void {
  for (const worker of workers.values()) void worker.terminate()
  workers.clear()
  pending.clear()
}