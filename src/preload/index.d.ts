import type { MusicHubApi } from './index'

declare global {
  interface Window {
    api: MusicHubApi
  }
}

export {}
