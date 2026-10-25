import { create } from 'zustand'

interface UiState {
  lyricsOpen: boolean
  toggleLyrics: () => void
  openLyrics: () => void
  closeLyrics: () => void
  queueOpen: boolean
  toggleQueue: () => void
  closeQueue: () => void
  importOpen: boolean
  openImport: () => void
  closeImport: () => void
  pendingDownload: { title: string; artist: string; providerId: string; providerKey: string } | null
  requestDownload: (payload: { title: string; artist: string; providerId: string; providerKey: string }) => void
  closeDownload: () => void
}

export const useUi = create<UiState>((set) => ({
  lyricsOpen: false,
  toggleLyrics: () => set((state) => ({ lyricsOpen: !state.lyricsOpen })),
  openLyrics: () => set({ lyricsOpen: true }),
  closeLyrics: () => set({ lyricsOpen: false }),
  queueOpen: false,
  toggleQueue: () => set((state) => ({ queueOpen: !state.queueOpen })),
  closeQueue: () => set({ queueOpen: false }),
  importOpen: false,
  openImport: () => set({ importOpen: true }),
  closeImport: () => set({ importOpen: false }),
  pendingDownload: null,
  requestDownload: (payload) => set({ pendingDownload: payload }),
  closeDownload: () => set({ pendingDownload: null })
}))