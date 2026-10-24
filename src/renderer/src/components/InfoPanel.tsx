import type { JSX } from 'react'
import { Cpu, Database, FolderTree, Loader2 } from 'lucide-react'
import type { AppInfo, DbStats } from '@shared/types'
import { formatBytes } from '../lib/format'

interface Props {
  app: AppInfo | null
  db: DbStats | null
  error: string | null
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[12px] text-ink-400">{label}</span>
      <span className="truncate text-right text-[12px] text-ink-200" title={value}>
        {value}
      </span>
    </div>
  )
}

export function InfoPanel({ app, db, error }: Props): JSX.Element {
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-[12px] text-red-300">
        IPC 调用失败：{error}
      </div>
    )
  }

  if (!app || !db) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-ink-850 p-4 text-[12px] text-ink-400">
        <Loader2 size={14} className="animate-spin" />
        正在读取主进程信息…
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <section className="rounded-xl border border-white/5 bg-ink-850/70 p-4">
        <header className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-200">
          <Cpu size={14} className="text-brand-400" /> 运行时
        </header>
        <Row label="应用版本" value={app.version} />
        <Row label="Electron" value={app.electron} />
        <Row label="Node" value={app.node} />
        <Row label="Chromium" value={app.chrome} />
        <Row label="平台" value={app.platform + ' / ' + app.arch} />
      </section>

      <section className="rounded-xl border border-white/5 bg-ink-850/70 p-4">
        <header className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-200">
          <Database size={14} className="text-brand-400" /> 数据库
        </header>
        <Row label="架构版本" value={'v' + db.schemaVersion} />
        <Row label="文件大小" value={formatBytes(db.sizeBytes)} />
        <Row label="数据表" value={db.tables.map((t) => t.name + '(' + t.rows + ')').join(', ') || '空'} />
      </section>

      <section className="rounded-xl border border-white/5 bg-ink-850/70 p-4">
        <header className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink-200">
          <FolderTree size={14} className="text-brand-400" /> 数据目录
        </header>
        <p className="break-all text-[11px] leading-relaxed text-ink-300">{app.userDataPath}</p>
        <p className="mt-2 break-all text-[11px] leading-relaxed text-ink-400">{db.path}</p>
      </section>
    </div>
  )
}
