import { create } from 'zustand'
import type { PlayerSnapshot, Track } from '@shared/types'

export type PlayMode = PlayerSnapshot['mode']

interface PlayerState {
  queue: Track[]
  index: number
  playing: boolean
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  mode: PlayMode
  error: string | null
  /** 单击列表中某首时的高亮预览（不播放） */
  selectedTrack: Track | null

  selectTrack: (track: Track | null) => void
  playSelected: (startAt?: number) => void
  playQueue: (tracks: Track[], startIndex: number) => void
  playIndex: (index: number, startAt?: number) => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (ms: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleMode: () => void
  clearQueue: () => void
  enqueueNext: (tracks: Track[]) => void
  appendQueue: (tracks: Track[]) => void
  removeFromQueue: (ids: string[]) => void
}

const MODE_ORDER: PlayMode[] = ['sequence', 'loop', 'single', 'shuffle']
const STATE_KEY = 'player.state'

const audio = typeof Audio !== 'undefined' ? new Audio() : null
if (audio) {
  audio.preload = 'metadata'
  audio.volume = 0.8
}

/** 恢复播放时待跳转的位置（毫秒） */
let pendingSeek = 0

function mediaUrl(track: Track): string {
  return 'media://track/' + encodeURIComponent(track.id)
}

function loadAndPlay(track: Track | null, startAt = 0): void {
  if (!audio) return
  if (!track) {
    audio.removeAttribute('src')
    audio.load()
    return
  }
  pendingSeek = startAt
  audio.src = mediaUrl(track)
  void audio.play().catch(() => {
    usePlayer.setState({ playing: false, error: '无法播放该文件' })
  })

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? '未知艺术家',
      album: track.album ?? ''
    })
  }
}

function pickShuffle(length: number, current: number): number {
  if (length <= 1) return current
  let next = current
  while (next === current) next = Math.floor(Math.random() * length)
  return next
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  mode: 'sequence',
  error: null,
  selectedTrack: null,

  selectTrack: (track) => set({ selectedTrack: track }),

  playSelected: (startAt = 0) => {
    const { selectedTrack, queue } = get()
    if (!selectedTrack) return
    const existing = queue.findIndex((item) => item.id === selectedTrack.id)
    set({ selectedTrack: null })
    if (existing >= 0) get().playIndex(existing, startAt)
    else {
      get().playQueue([selectedTrack], 0)
      if (startAt > 0) {
        pendingSeek = startAt
        get().seek(startAt)
      }
    }
  },

  playQueue: (tracks, startIndex) => {
    if (tracks.length === 0) return
    const index = Math.max(0, Math.min(startIndex, tracks.length - 1))
    set({
      queue: tracks,
      index,
      positionMs: 0,
      durationMs: tracks[index].durationMs ?? 0,
      error: null
    })
    loadAndPlay(tracks[index])
  },

  playIndex: (index, startAt = 0) => {
    const track = get().queue[index]
    if (!track) return
    set({ index, positionMs: startAt, durationMs: track.durationMs ?? 0, error: null })
    loadAndPlay(track, startAt)
  },

  toggle: () => {
    if (!audio) return
    const { playing, queue, index } = get()

    if (playing) {
      audio.pause()
      return
    }

    // 恢复上次会话的曲目：此时 audio 还没有 src
    if (!audio.getAttribute('src') && queue[index]) {
      loadAndPlay(queue[index], pendingSeek)
      return
    }

    void audio.play().catch(() => set({ playing: false }))
  },

  next: (auto = false) => {
    const { queue, index, mode } = get()
    if (queue.length === 0) return

    if (mode === 'single' && auto) {
      if (audio) {
        audio.currentTime = 0
        void audio.play()
      }
      return
    }

    let target = index + 1
    if (mode === 'shuffle') {
      target = queue.length > 1 ? pickShuffle(queue.length, index) : index
    } else if (target >= queue.length) {
      if (mode === 'loop') {
        target = 0
      } else {
        if (auto) {
          set({ playing: false })
          if (audio) audio.pause()
        }
        return
      }
    }
    get().playIndex(target)
  },

  prev: () => {
    const { queue, index, mode, positionMs } = get()
    if (queue.length === 0) return
    if (positionMs > 3000) {
      get().seek(0)
      return
    }
    let target = index - 1
    if (mode === 'shuffle') {
      target = queue.length > 1 ? pickShuffle(queue.length, index) : index
    } else if (target < 0) {
      target = mode === 'loop' ? queue.length - 1 : 0
    }
    get().playIndex(target)
  },

  seek: (ms) => {
    if (!audio) return
    audio.currentTime = Math.max(0, ms / 1000)
    pendingSeek = 0
    set({ positionMs: Math.max(0, ms) })
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume))
    if (audio) {
      audio.volume = clamped
      audio.muted = false
    }
    set({ volume: clamped, muted: false })
  },

  toggleMute: () => {
    const muted = !get().muted
    if (audio) audio.muted = muted
    set({ muted })
  },

  cycleMode: () => {
    const { mode } = get()
    const nextMode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]
    set({ mode: nextMode })
  },

  clearQueue: () => {
    loadAndPlay(null)
    pendingSeek = 0
    set({ queue: [], index: -1, playing: false, positionMs: 0, durationMs: 0, selectedTrack: null })
  },

  enqueueNext: (tracks) => {
    if (tracks.length === 0) return
    const { queue, index } = get()
    if (queue.length === 0) {
      get().playQueue(tracks, 0)
      return
    }
    const next = queue.slice()
    next.splice(index + 1, 0, ...tracks)
    set({ queue: next })
  },

  appendQueue: (tracks) => {
    if (tracks.length === 0) return
    const { queue } = get()
    if (queue.length === 0) {
      get().playQueue(tracks, 0)
      return
    }
    set({ queue: [...queue, ...tracks] })
  },

  removeFromQueue: (ids) => {
    if (ids.length === 0) return
    const drop = new Set(ids)
    const { queue, index } = get()
    const currentId = queue[index]?.id
    const next = queue.filter((track) => !drop.has(track.id))
    if (next.length === queue.length) return

    if (currentId && drop.has(currentId)) {
      loadAndPlay(null)
      set({ queue: next, index: -1, playing: false, positionMs: 0, durationMs: 0 })
      return
    }

    const nextIndex = currentId ? next.findIndex((track) => track.id === currentId) : -1
    set({ queue: next, index: nextIndex })
  }
}))

if (audio) {
  audio.addEventListener('play', () => usePlayer.setState({ playing: true }))
  audio.addEventListener('pause', () => {
    usePlayer.setState({ playing: false })
    savePlayerState()
  })
  audio.addEventListener('timeupdate', () => usePlayer.setState({ positionMs: audio.currentTime * 1000 }))
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio.duration)) usePlayer.setState({ durationMs: audio.duration * 1000 })
    if (pendingSeek > 0 && pendingSeek < audio.duration * 1000) {
      audio.currentTime = pendingSeek / 1000
    }
    pendingSeek = 0
  })
  audio.addEventListener('ended', () => usePlayer.getState().next(true))
  audio.addEventListener('error', () => usePlayer.setState({ playing: false, error: '播放失败' }))
  audio.addEventListener('volumechange', () => {
    if (!audio) return
    usePlayer.setState({ volume: audio.volume, muted: audio.muted })
  })
}

// ---------- 状态持久化 ----------

let saveTimer: number | null = null

export function savePlayerState(): void {
  if (typeof window === 'undefined' || !window.api?.settings) return
  const { volume, muted, mode, queue, index, positionMs } = usePlayer.getState()
  const capped = queue.slice(0, 1000)
  const snapshot: PlayerSnapshot = {
    volume,
    muted,
    mode,
    queue: capped,
    index: index < capped.length ? index : -1,
    positionMs: Math.round(positionMs)
  }
  void window.api.settings.set(STATE_KEY, snapshot)
}

function scheduleSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    savePlayerState()
  }, 500)
}

usePlayer.subscribe((state, previous) => {
  const changed =
    state.volume !== previous.volume ||
    state.muted !== previous.muted ||
    state.mode !== previous.mode ||
    state.queue !== previous.queue ||
    state.index !== previous.index
  if (changed) scheduleSave()
})

/** 启动时恢复上次的音量、模式、队列与进度 */
export async function hydratePlayer(): Promise<void> {
  try {
    const saved = await window.api.settings.get<PlayerSnapshot>(STATE_KEY)
    if (!saved) return

    const queue = Array.isArray(saved.queue) ? saved.queue : []
    const rawIndex = typeof saved.index === 'number' ? saved.index : -1
    const index = queue.length > 0 ? Math.min(Math.max(rawIndex, 0), queue.length - 1) : -1
    const volume = typeof saved.volume === 'number' ? saved.volume : 0.8
    const muted = Boolean(saved.muted)
    const positionMs = typeof saved.positionMs === 'number' ? saved.positionMs : 0

    if (audio) {
      audio.volume = volume
      audio.muted = muted
    }
    pendingSeek = positionMs

    usePlayer.setState({
      volume,
      muted,
      mode: saved.mode ?? 'sequence',
      queue,
      index,
      durationMs: index >= 0 ? (queue[index].durationMs ?? 0) : 0,
      positionMs
    })
  } catch {
    // 恢复失败不影响启动
  }
}