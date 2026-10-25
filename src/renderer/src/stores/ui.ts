import { create } from 'zustand'

interface UiState {
  lyricsOpen: boolean
  toggleLyrics: () => void
  openLyrics: () => void
  closeLyrics: () => void
}

export const useUi = create<UiState>((set) => ({
  lyricsOpen: false,
  toggleLyrics: () => set((state) => ({ lyricsOpen: !state.lyricsOpen })),
  openLyrics: () => set({ lyricsOpen: true }),
  closeLyrics: () => set({ lyricsOpen: false })
}))
