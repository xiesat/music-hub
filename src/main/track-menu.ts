import { BrowserWindow, Menu, clipboard, shell, type MenuItemConstructorOptions } from 'electron'
import type { TrackMenuAction, TrackMenuPayload } from '@shared/types'

function label(count: number, single: string, multiple: string): string {
  return count > 1 ? multiple.replace('{n}', String(count)) : single
}

/**
 * 弹出曲目原生右键菜单。
 * 返回用户选择的动作；纯系统动作（定位/复制）在这里直接执行，返回 null。
 */
export function popupTrackMenu(
  win: BrowserWindow,
  payload: TrackMenuPayload,
  filePath: string | null
): Promise<TrackMenuAction | null> {
  const { ids, favorite } = payload
  const count = ids.length
  if (count === 0) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const finish = (action: TrackMenuAction | null): void => {
      if (settled) return
      settled = true
      resolve(action)
    }

    const template: MenuItemConstructorOptions[] = [
      {
        label: label(count, '播放', '播放选中的 {n} 首'),
        click: () => finish('play')
      },
      {
        label: label(count, '下一首播放', '选中的 {n} 首设为下一首'),
        click: () => finish('play-next')
      },
      {
        label: label(count, '添加到播放队列', '把选中的 {n} 首加入队列'),
        click: () => finish('append-queue')
      },
      { type: 'separator' },
      {
        label: favorite ? (count > 1 ? '取消收藏' : '取消收藏') : count > 1 ? '收藏选中的 {n} 首'.replace('{n}', String(count)) : '收藏',
        click: () => finish(favorite ? 'unfavorite' : 'favorite')
      },
      { type: 'separator' },
      {
        label: '在文件夹中显示',
        enabled: Boolean(filePath),
        click: () => {
          if (filePath) shell.showItemInFolder(filePath)
          finish(null)
        }
      },
      {
        label: '复制文件路径',
        enabled: Boolean(filePath),
        click: () => {
          if (filePath) clipboard.writeText(filePath)
          finish(null)
        }
      },
      { type: 'separator' },
      {
        label: label(count, '从曲库移除', '从曲库移除 {n} 首'),
        click: () => finish('remove')
      }
    ]

    Menu.buildFromTemplate(template).popup({
      window: win,
      // 菜单关闭（点了空白处/Esc）时回调，避免 Promise 永远挂起
      callback: () => {
        setTimeout(() => finish(null), 0)
      }
    })
  })
}
