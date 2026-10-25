# MusicHub

多平台音乐聚合客户端：本地曲库管理 + 插件化音源（兼容 LX 音源脚本 / MusicFree 插件）。

> 仅供个人学习与研究使用。项目本身不内置任何音源，音源由使用者自行导入。

![M1 界面](docs/screenshot-m1.png)

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面壳 | Electron 45 |
| 构建 | electron-vite 6 + Vite 8 |
| UI | React 19 + TypeScript + Tailwind CSS 4 |
| 数据 | SQLite（better-sqlite3，N-API 预编译）+ Drizzle ORM |
| 打包 | electron-builder 26（NSIS + Portable） |

## 已完成能力（M1）

- 目录导入（可多选）→ 递归扫描 → 标签解析（music-metadata）→ SQLite 入库
- **增量扫描**：按 path + mtime + size 跳过未变更文件（实测二次扫描跳过 5/5）
- 内嵌封面自动提取并按专辑去重缓存；`.lrc` 同名歌词自动关联
- 虚拟滚动曲库列表（万级曲目不掉帧）、关键词搜索、列排序、分页懒加载
- 播放器：队列、上一首/下一首、进度拖拽、音量、顺序/循环/单曲/随机
- `media://` 自定义协议：支持 HTTP Range（可拖动进度）、CORS、媒体元素直连

## 目录结构

```
src/
  main/        Electron 主进程（业务后端）
    db/        SQLite 连接与迁移
    ipc.ts     IPC 处理器注册
    smoke.ts   无人值守冒烟测试
  preload/     contextBridge 安全桥
  renderer/    React 界面
  shared/      主/渲染共用的类型（唯一真源）
```

## 开发

```bash
pnpm install
pnpm dev          # 启动开发窗口（HMR）
pnpm typecheck    # 主进程 + 渲染进程类型检查
pnpm build        # 构建到 out/
pnpm build:win    # 打 Windows 安装包到 release/
pnpm smoke        # 冒烟测试：跑通 IPC + DB 后自动退出
```

### 本机注意事项

1. **不要从 DSH/Electron 派生的终端里启动**：`ELECTRON_RUN_AS_NODE=1` 会让 Electron 变成纯 Node 进程。
   如遇到，先执行 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。
2. 依赖走 npmmirror（见 `.npmrc`），GitHub 直连会因本地代理的证书校验失败。
3. 打包必须保留 `npmRebuild: false`：本机无 MSVC，靠 better-sqlite3 的 N-API 预编译产物。

## 路线图

- [x] M0 脚手架：Electron + React + TS + Tailwind + IPC + SQLite 迁移 + 打包
- [x] M1 本地曲库：目录扫描、标签解析、虚拟滚动列表、播放器内核、media:// 音频协议
- [ ] M2 歌单 CRUD、队列、标签编辑
- [ ] M3 音源沙箱 + 首个音源接入
- [ ] M4 多音源互备 + 插件管理
- [ ] M5 桌面歌词、系统媒体控制、自动更新