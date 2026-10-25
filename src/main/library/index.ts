import type { ScanProgress } from '@shared/types'
import { getLibraryRoots, setLibraryRoots } from '../settings'
import { deleteTrack, getLibraryStats, listTracks } from './repository'
import { scanDirectories } from './scanner'

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

  try {
    return await scanDirectories(roots, {
      prune: true,
      onProgress: (progress) => {
        const now = Date.now()
        if (now - lastEmit > 90 || progress.phase !== 'parsing') {
          lastEmit = now
          sink(progress)
        }
      }
    })
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

export { deleteTrack, getLibraryRoots, getLibraryStats, listTracks }
