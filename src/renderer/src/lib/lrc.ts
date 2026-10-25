export interface LyricLine {
  timeMs: number
  text: string
}

export interface ParsedLyric {
  lines: LyricLine[]
  synced: boolean
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\]/i

/**
 * 解析 LRC：支持一行多时间标签、[offset] 校正、纯文本歌词（无时间轴）。
 */
export function parseLrc(raw: string | null | undefined): ParsedLyric {
  if (!raw || raw.trim().length === 0) return { lines: [], synced: false }

  const offsetMatch = OFFSET_TAG.exec(raw)
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0

  const lines: LyricLine[] = []
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    TIME_TAG.lastIndex = 0
    const stamps: number[] = []
    let match: RegExpExecArray | null
    while ((match = TIME_TAG.exec(line)) !== null) {
      const minutes = Number(match[1])
      const seconds = Number(match[2])
      const fraction = match[3] ?? '0'
      const fractionMs = fraction.length === 3 ? Number(fraction) : Number(fraction) * 10
      stamps.push(minutes * 60000 + seconds * 1000 + fractionMs)
    }

    if (stamps.length === 0) {
      // 没有时间标签：可能是元信息（[ti:] 等），忽略标签行，其余按纯文本保留
      if (/^\[[a-z#]+:.*\]$/i.test(line)) continue
      lines.push({ timeMs: -1, text: line })
      continue
    }

    const text = line.replace(TIME_TAG, '').trim()
    for (const stamp of stamps) lines.push({ timeMs: Math.max(0, stamp - offset), text })
  }

  const synced = lines.some((item) => item.timeMs >= 0)
  if (synced) lines.sort((a, b) => a.timeMs - b.timeMs)

  return { lines, synced }
}

/** 二分查找当前应高亮的行 */
export function findActiveLine(lines: LyricLine[], positionMs: number): number {
  if (lines.length === 0) return -1
  let low = 0
  let high = lines.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].timeMs <= positionMs) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}
