import type { ScanProgress } from '@shared/types'
import { getLibraryRoots, getSetting, setLibraryRoots, setSetting } from '../settings'
import {
  deleteTracks,
  getLibraryStats,
  getTrackById,
  getTrackLyric,
  listTracks,
  setFavorite
} from './repository'
import { PARSER_VERSION, scanDirectories } from './scanner'

type ProgressSink = (progress: ScanProgress) => void

let sink: ProgressSink = () => {}
let scanning = false

function idleProgress(): ScanProgress {
  return {
    phase: 'idle',
    scanned: 0,
    total: 0,
    current: null,
    added: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  }
}

export function setProgressSink(next: ProgressSink): void {
  sink = next
}

export function addRoots(paths: string[]): string[] {
  const roots = Array.from(new Set([...getLibraryRoots(), ...paths]))
  setLibraryRoots(roots)
  return roots
}

export async function scanLibrary(): Promise<ScanProgress> {
  const roots = getLibraryRoots()
  if (scanning) {
    const busy = idleProgress()
    busy.error = '正在扫描中，请稍候'
    return busy
  }
  if (roots.length === 0) {
    const empty = idleProgress()
    empty.error = '还没有添加音乐目录'
    return empty
  }

  scanning = true
  let lastEmit = 0

  // 解析逻辑升级后，旧索引需要全量重建（否则缓存会一直跳过）
  const storedVersion = getSetting<number>('scanner.parserVersion', 0)
  const forceReparse = storedVersion !== PARSER_VERSION

  try {
    const result = await scanDirectories(roots, {
      prune: true,
      forceReparse,
      onProgress: (progress) => {
        const now = Date.now()
        if (now - lastEmit > 90 || progress.phase !== 'parsing') {
          lastEmit = now
          sink(progress)
        }
      }
    })
    setSetting('scanner.parserVersion', PARSER_VERSION)

    // 扫描完成后后台补一批封面（不阻塞返回，失败静默）
    if (!result.error) {
      setTimeout(() => {
        void import('../providers/cover-enrich')
          .then(async (module) => {
            const enriched = await module.enrichMissingCovers(15)
            if (enriched.filled > 0) {
              sink({ ...idleProgress(), phase: 'done', added: 0, updated: enriched.filled })
            }
          })
          .catch(() => {
            /* 忽略 */
          })
      }, 1500)
    }

    return result
  } catch (error) {
    const failed = idleProgress()
    failed.phase = 'error'
    failed.error = (error as Error).message
    sink(failed)
    return failed
  } finally {
    scanning = false
  }
}

export {
  deleteTracks,
  getLibraryRoots,
  getLibraryStats,
  getTrackById,
  getTrackLyric,
  listTracks,
  setFavorite
}