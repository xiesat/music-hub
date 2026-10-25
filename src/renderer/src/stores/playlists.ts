import { create } from 'zustand'
import type { Playlist } from '@shared/types'

interface PlaylistsState {
  items: Playlist[]
  loading: boolean
  refresh: () => Promise<void>
  create: (name: string) => Promise<Playlist>
  rename: (id: string, name: string) => Promise<void>
  remove: (id: string) => Promise<void>
  addTracks: (id: string, trackIds: string[]) => Promise<number>
}

export const usePlaylists = create<PlaylistsState>((set, get) => ({
  items: [],
  loading: false,

  refresh: async () => {
    set({ loading: true })
    try {
      const items = await window.api.playlists.list()
      set({ items })
    } finally {
      set({ loading: false })
    }
  },

  create: async (name) => {
    const playlist = await window.api.playlists.create(name)
    await get().refresh()
    return playlist
  },

  rename: async (id, name) => {
    await window.api.playlists.rename(id, name)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.playlists.remove(id)
    await get().refresh()
  },

  addTracks: async (id, trackIds) => {
    const added = await window.api.playlists.addTracks(id, trackIds)
    await get().refresh()
    return added
  }
}))
