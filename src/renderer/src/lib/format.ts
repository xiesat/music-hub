export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return value.toFixed(index === 0 ? 0 : 1) + ' ' + units[index]
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '--:--'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (hours > 0) return hours + ':' + pad(minutes) + ':' + pad(seconds)
  return minutes + ':' + pad(seconds)
}

export function formatCount(value: number): string {
  if (value >= 10000) return (value / 10000).toFixed(1) + ' 万'
  return String(value)
}