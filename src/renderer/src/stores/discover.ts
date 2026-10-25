import { create } from 'zustand'
import type { ProviderSourceStatus, RemoteTrack } from '@shared/provider'

interface DiscoverState {
  providerId: string
  keyword: string
  items: RemoteTrack[]
  total: number
  page: number
  hasMore: boolean
  loading: boolean
  error: string | null
  message: string | null
  /** 是否已经搜过一次（用于区分空状态文案） */
  searched: boolean
  scrollTop: number
  downloading: Record<string, number>
  /** 「全部音源」模式下各音源的状态 */
  sources: ProviderSourceStatus[]

  setProvider: (id: string) => void
  setKeyword: (value: string) => void
  setScrollTop: (value: number) => void
  search: (reset?: boolean) => Promise<void>
  loadMore: () => Promise<void>
  setDownloadProgress: (key: string, percent: number) => void
  clearDownload: (key: string) => void
  reset: () => void
}

const PAGE_SIZE = 30

function cleanError(message: string): string {
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
}

export const useDiscover = create<DiscoverState>((set, get) => ({
  providerId: 'netease',
  keyword: '',
  items: [],
  total: 0,
  page: 0,
  hasMore: false,
  loading: false,
  error: null,
  message: null,
  searched: false,
  scrollTop: 0,
  downloading: {},
  sources: [],

  setProvider: (id) => set({ providerId: id }),
  setKeyword: (value) => set({ keyword: value }),
  setScrollTop: (value) => set({ scrollTop: value }),

  search: async (reset = true) => {
    const { providerId, keyword, items, page } = get()
    const query = keyword.trim()
    if (!query) return
    const nextPage = reset ? 1 : page + 1
    set({ loading: true, error: null, message: null })
    try {
      if (providerId === 'all') {
        const multi = await window.api.providers.searchAll(query, nextPage)
        const failed = multi.sources.filter((source) => !source.ok)
        set({
          items: reset ? multi.items : [...items, ...multi.items],
          total: multi.total,
          hasMore: false,
          page: nextPage,
          sources: multi.sources,
          searched: true,
          message:
            multi.items.length === 0
              ? '所有音源都没有结果' +
                (failed.length > 0 ? '（' + failed.map((s) => s.name + ': ' + s.error).join('；') + '）' : '')
              : failed.length > 0
                ? '部分音源失败：' + failed.map((s) => s.name).join('、')
                : null,
          scrollTop: reset ? 0 : get().scrollTop
        })
        return
      }

      const result = await window.api.providers.search(providerId, query, nextPage)
      const merged = reset ? result.items : [...items, ...result.items]
      set({
        items: merged,
        total: result.total,
        hasMore: result.hasMore,
        page: nextPage,
        sources: [],
        searched: true,
        message: merged.length === 0 ? '没有搜到结果' : null,
        scrollTop: reset ? 0 : get().scrollTop
      })
    } catch (error) {
      set({ error: cleanError((error as Error).message), items: reset ? [] : items })
    } finally {
      set({ loading: false })
    }
  },

  loadMore: async () => {
    const { hasMore, loading } = get()
    if (!hasMore || loading) return
    await get().search(false)
  },

  setDownloadProgress: (key, percent) =>
    set((state) => ({ downloading: { ...state.downloading, [key]: percent } })),

  clearDownload: (key) =>
    set((state) => {
      const next = { ...state.downloading }
      delete next[key]
      return { downloading: next }
    }),

  reset: () =>
    set({
      items: [],
      total: 0,
      page: 0,
      hasMore: false,
      searched: false,
      error: null,
      message: null,
      scrollTop: 0
    })
}))

export { PAGE_SIZE }