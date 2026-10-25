// 音源（Provider）公共类型：主进程实现、渲染进程消费

export type ProviderKind = 'builtin' | 'script'

export interface ProviderInfo {
  id: string
  name: string
  version: string
  kind: ProviderKind
  enabled: boolean
  capabilities: string[]
  lastOkAt: number | null
  lastError: string | null
}

export interface RemoteTrack {
  providerId: string
  key: string
  title: string
  artist: string
  album: string | null
  durationMs: number | null
  coverUrl: string | null
}

export interface SearchPage {
  items: RemoteTrack[]
  total: number
  hasMore: boolean
}

export interface StreamSource {
  url: string
  mime: string | null
  expiresAt: number | null
}

export interface LyricResult {
  lrc: string | null
  translated: string | null
}

export interface DownloadResult {
  trackId: string
  filePath: string
  bytes: number
}

export interface ProviderApi {
  list(): Promise<ProviderInfo[]>
  toggle(id: string, enabled: boolean): Promise<void>
  search(providerId: string, keyword: string, page: number): Promise<SearchPage>
  stream(providerId: string, key: string): Promise<StreamSource | null>
  lyric(providerId: string, key: string): Promise<LyricResult>
  /** 本地曲目缺歌词时，按 标题+艺人 在线匹配 */
  onlineLyric(title: string, artist: string | null): Promise<LyricResult>
  download(providerId: string, key: string, title: string, artist: string): Promise<DownloadResult>
  onDownloadProgress(listener: (payload: { key: string; received: number; total: number }) => void): () => void
}