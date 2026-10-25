import { create } from 'zustand'
import type { Track } from '@shared/types'

export type PlayMode = 'sequence' | 'loop' | 'single' | 'shuffle'

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

  playQueue: (tracks: Track[], startIndex: number) => void
  playIndex: (index: number) => void
  toggle: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (ms: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleMode: () => void
  clearQueue: () => void
  /** 插入到当前曲目之后（下一首播放） */
  enqueueNext: (tracks: Track[]) => void
  /** 追加到队列末尾 */
  appendQueue: (tracks: Track[]) => void
  /** 从队列中移除，自动修正当前索引 */
  removeFromQueue: (ids: string[]) => void
}

const MODE_ORDER: PlayMode[] = ['sequence', 'loop', 'single', 'shuffle']

const audio = typeof Audio !== 'undefined' ? new Audio() : null
if (audio) {
  audio.preload = 'metadata'
  audio.volume = 0.8
}

function mediaUrl(track: Track): string {
  return 'media://track/' + encodeURIComponent(track.id)
}

function loadAndPlay(track: Track | null): void {
  if (!audio) return
  if (!track) {
    audio.removeAttribute('src')
    audio.load()
    return
  }
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

  playQueue: (tracks, startIndex) => {
    if (tracks.length === 0) return
    const index = Math.max(0, Math.min(startIndex, tracks.length - 1))
    set({ queue: tracks, index, positionMs: 0, durationMs: tracks[index].durationMs ?? 0, error: null })
    loadAndPlay(tracks[index])
  },

  playIndex: (index) => {
    const track = get().queue[index]
    if (!track) return
    set({ index, positionMs: 0, durationMs: track.durationMs ?? 0, error: null })
    loadAndPlay(track)
  },

  toggle: () => {
    if (!audio) return
    if (get().playing) {
      audio.pause()
    } else {
      void audio.play().catch(() => set({ playing: false }))
    }
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
    set({ positionMs: Math.max(0, ms) })
  },

  setVolume: (volume) => {
    const clamped = Math.max(0, Math.min(1, volume))
    if (audio) audio.volume = clamped
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
    set({ queue: [], index: -1, playing: false, positionMs: 0, durationMs: 0 })
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
  audio.addEventListener('pause', () => usePlayer.setState({ playing: false }))
  audio.addEventListener('timeupdate', () => usePlayer.setState({ positionMs: audio.currentTime * 1000 }))
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration)) usePlayer.setState({ durationMs: audio.duration * 1000 })
  })
  audio.addEventListener('ended', () => usePlayer.getState().next(true))
  audio.addEventListener('error', () => usePlayer.setState({ playing: false, error: '播放失败' }))
}