// 主进程 / 预加载 / 渲染进程共用的类型（唯一真源）

export interface AppInfo {
  name: string
  version: string
  electron: string
  node: string
  chrome: string
  platform: string
  arch: string
  userDataPath: string
  isDev: boolean
}

export interface TableStat {
  name: string
  rows: number
}

export interface DbStats {
  path: string
  sizeBytes: number
  schemaVersion: number
  tables: TableStat[]
}

export interface IpcApi {
  getAppInfo(): Promise<AppInfo>
  getDbStats(): Promise<DbStats>
}
