// 下载管理器：任务队列、进度、取消、重试，并持久化到 downloads 表
import fs from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { getDb } from './db'
import { ingestFile } from './library/scanner'
import { httpRequest } from './providers/http'
import { streamProvider } from './providers'
import { getSetting } from './settings'

export type DownloadStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled'

export interface DownloadTask {
  id: string
  title: string
  artist: string
  providerId: string
  providerKey: string
  status: DownloadStatus
  received: number
  total: number
  filePath: string | null
  error: string | null
  createdAt: number
}

const tasks = new Map<string, DownloadTask>()
const queue: string[] = []
const canceled = new Set<string>()
const MAX_CONCURRENT = 2
let running = 0
let sink: (task: DownloadTask) => void = () => {}

export function setDownloadSink(fn: (task: DownloadTask) => void): void {
  sink = fn
}

function persist(task: DownloadTask): void {
  try {
    getDb()
      .prepare(
        'INSERT INTO downloads (id, track_id, url, target_path, status, bytes_total, bytes_done, quality, error, created_at, updated_at, title, artist, provider_id, provider_key)' +
          ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)' +
          ' ON CONFLICT(id) DO UPDATE SET status = excluded.status, bytes_total = excluded.bytes_total,' +
          ' bytes_done = excluded.bytes_done, target_path = excluded.target_path, error = excluded.error,' +
          ' updated_at = excluded.updated_at, title = excluded.title, artist = excluded.artist,' +
          ' provider_id = excluded.provider_id, provider_key = excluded.provider_key'
      )
      .run(
        task.id,
        task.providerKey,
        null,
        task.filePath,
        task.status,
        task.total,
        task.received,
        null,
        task.error,
        task.createdAt,
        Date.now(),
        task.title,
        task.artist,
        task.providerId,
        task.providerKey
      )
  } catch {
    /* 持久化失败不影响下载 */
  }
}

function emit(task: DownloadTask): void {
  sink({ ...task })
}

export function getDownloadDir(): string {
  const configured = getSetting<string>('download.dir', '')
  const dir = configured || join(app.getPath('music'), 'MusicHub')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120).trim() || 'track'
}

interface DownloadRow {
  id: string
  title: string | null
  artist: string | null
  provider_id: string | null
  provider_key: string | null
  target_path: string | null
  status: string
  bytes_total: number | null
  bytes_done: number | null
  error: string | null
  created_at: number
}

/** 内存中的任务 + 数据库里的历史记录（重启后仍能看到） */
export function listDownloads(): DownloadTask[] {
  const merged = new Map<string, DownloadTask>()

  try {
    const rows = getDb()
      .prepare(
        'SELECT id, title, artist, provider_id, provider_key, target_path, status, bytes_total, bytes_done, error, created_at' +
          ' FROM downloads ORDER BY created_at DESC LIMIT 200'
      )
      .all() as DownloadRow[]

    for (const row of rows) {
      merged.set(row.id, {
        id: row.id,
        title: row.title ?? '未知曲目',
        artist: row.artist ?? '',
        providerId: row.provider_id ?? '',
        providerKey: row.provider_key ?? '',
        status: (row.status as DownloadStatus) ?? 'done',
        received: row.bytes_done ?? 0,
        total: row.bytes_total ?? 0,
        filePath: row.target_path,
        error: row.error,
        createdAt: row.created_at
      })
    }
  } catch {
    /* 表结构异常时忽略历史 */
  }

  // 内存中的任务更新（含进行中的实时进度）
  for (const [id, task] of tasks) merged.set(id, task)

  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt)
}

export function enqueueDownload(input: {
  title: string
  artist: string
  providerId: string
  providerKey: string
}): DownloadTask {
  const id = 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const task: DownloadTask = {
    id,
    title: input.title,
    artist: input.artist,
    providerId: input.providerId,
    providerKey: input.providerKey,
    status: 'queued',
    received: 0,
    total: 0,
    filePath: null,
    error: null,
    createdAt: Date.now()
  }
  tasks.set(id, task)
  queue.push(id)
  persist(task)
  emit(task)
  pump()
  return task
}

export function cancelDownload(id: string): void {
  const task = tasks.get(id)
  if (!task) return
  canceled.add(id)
  if (task.status === 'queued') {
    task.status = 'canceled'
    persist(task)
    emit(task)
  }
}

export function retryDownload(id: string): void {
  const task = tasks.get(id)
  if (!task) return
  canceled.delete(id)
  task.status = 'queued'
  task.error = null
  task.received = 0
  task.total = 0
  queue.push(id)
  persist(task)
  emit(task)
  pump()
}

export function clearFinished(): void {
  for (const [id, task] of tasks) {
    if (task.status === 'done' || task.status === 'failed' || task.status === 'canceled') tasks.delete(id)
  }
}

export function revealDownload(id: string): void {
  const task = tasks.get(id)
  const target = task?.filePath
  if (target && fs.existsSync(target)) {
    import('electron').then(({ shell }) => shell.showItemInFolder(target))
  } else {
    import('electron').then(({ shell }) => void shell.openPath(getDownloadDir()))
  }
}

function pump(): void {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    const task = tasks.get(id)
    if (!task || task.status !== 'queued') continue
    running += 1
    void run(task).finally(() => {
      running -= 1
      pump()
    })
  }
}

async function run(task: DownloadTask): Promise<void> {
  task.status = 'running'
  persist(task)
  emit(task)

  try {
    const source = await streamProvider(task.providerId, task.providerKey, {
      title: task.title,
      artist: task.artist
    })
    if (!source) throw new Error('拿不到播放地址（可能需要会员或已下架）')

    const fileName = sanitize(task.artist ? task.artist + ' - ' + task.title : task.title) + '.mp3'
    const filePath = join(getDownloadDir(), fileName)

    const response = await httpRequest(source.url, { timeoutMs: 120_000 })
    if (!response.ok || !response.body) throw new Error('下载失败: HTTP ' + response.status)

    task.total = Number(response.headers.get('content-length') ?? 0)
    const reader = response.body.getReader()
    const handle = await fs.promises.open(filePath, 'w')
    try {
      for (;;) {
        if (canceled.has(task.id)) throw new Error('已取消')
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          await handle.write(value)
          task.received += value.byteLength
          emit(task)
          persist(task)
        }
      }
    } finally {
      await handle.close()
    }

    await ingestFile(filePath)
    task.filePath = filePath
    task.status = 'done'
  } catch (error) {
    task.error = (error as Error).message
    task.status = canceled.has(task.id) ? 'canceled' : 'failed'
  } finally {
    canceled.delete(task.id)
    persist(task)
    emit(task)
  }
}