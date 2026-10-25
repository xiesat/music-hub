# 插件独立仓库：可行性分析

> 目标：把音源插件（`resources/providers`）拆成独立仓库，方便多人维护与单独发版。
> 本文先给结论与方案对比，实施见文末清单。**尚未发布到 GitHub。**

---

## 一、现状（决定了拆分的难度）

| 事实 | 影响 |
|---|---|
| 插件是独立的 `.js` 脚本，运行时从 `userData/providers` 加载 | ✅ 与主程序**代码零耦合**，拆分成本低 |
| 主程序只在启动时把 `resources/providers/**` 拷到 `userData` | ✅ 插件仓库只需产出这个目录 |
| 插件通过 `ctx` 拿宿主能力（fetch/crypto/auth/log） | ✅ 接口已经是契约，不是内部实现 |
| `lib/qq-sign/` 有 0.89 MB 第三方签名包 | ⚠️ 仓库体积可接受，但需注明来源与许可 |
| **`electron-builder.yml` 的 `files` 只包含 `out/**` 与 `package.json`** | ❌ **当前安装包不含插件**，必须补 `extraResources` |

结论：**技术上完全可行**，而且宿主侧几乎不用改；真正要补的是打包配置和一套“插件从哪来”的约定。

---

## 二、三种拆分方式对比

### 方案 A：git submodule

```
music-hub/
  resources/providers  →  submodule: music-hub-providers
```

| 优点 | 缺点 |
|---|---|
| 版本锁定精确（父仓库记录 commit） | 必须 `git clone --recursive`，否则目录为空、应用无插件 |
| IDE / 编辑器直接跳转编辑 | 从 GitHub 下载 zip **不含** submodule 内容 |
| PR 边界清晰 | 对不熟悉 submodule 的贡献者不友好 |

### 方案 B：独立仓库 + 同步脚本（推荐）

```
music-hub/                            music-hub-providers/
  providers.lock.json  ──指向→         （tag / commit）
  scripts/sync-providers.mjs
    ↓ 同步到
  resources/providers/  （git 忽略）
```

| 优点 | 缺点 |
|---|---|
| `git clone` 后一条命令即可用；CI 可用 lock 文件锁定版本 | 多一个脚本步骤（`predev`/`prebuild` 自动跑） |
| 不熟悉 git 的人也能用 zip 下载 | 需要网络（或本地路径覆盖） |
| 插件可独立发版、独立 CI 校验 | `resources/providers` 不在主仓历史里 |

**本地开发友好**：支持 `MUSIC_HUB_PROVIDERS_DIR` 环境变量或同级的 `../music-hub-providers/providers`，免网络。

### 方案 C：发布成 npm 包

| 优点 | 缺点 |
|---|---|
| 版本管理成熟（semver） | 要维护 npm 发布流程与凭据 |
| `pnpm add @musichub/providers` 一行搞定 | 插件更新必须跟随依赖升级，用户无法单独换插件 |

---

## 三、结论与推荐

**采用方案 B**，理由：

1. 插件本质是**运行时可替换的数据**，不是编译期依赖，用 lock 文件锁定更贴合；
2. 不牺牲“下载 zip 就能跑”，这对开源项目很重要；
3. 以后想换成 submodule 也不冲突（把 `resources/providers` 换成 submodule 即可）。

同时必须修掉两个既有问题：

- **打包不含插件** → 增加 `extraResources: resources/providers → providers`
- 插件与 `lib/` 的安装逻辑已经支持递归，无需改

---

## 四、插件仓库的目录设计

```
music-hub-providers/
├─ providers/                 # 对应主程序的 resources/providers
│  ├─ netease.js
│  ├─ qq.js
│  ├─ kugou.js
│  └─ lib/qq-sign/{sign.js,web_p.js}
├─ templates/provider-template.js   # 新插件脚手架
├─ docs/PROVIDER-API.md             # 协议文档（v1/v2 + ctx 能力）
├─ docs/CONTRIBUTING.md             # 提交插件的流程与规范
├─ scripts/validate.mjs             # 校验所有插件能加载、导出完整
├─ .github/workflows/validate.yml   # PR 自动校验
├─ package.json  LICENSE  README.md
```

校验脚本会真正加载每个脚本（复用主程序的 vm 沙箱逻辑），检查：
`apiVersion` / `platform` / `capabilities` / `search` 是否存在，`login` 声明是否合法。

---

## 五、需要你确认的三件事

1. **仓库名与归属**：`music-hub-providers`？放在你的个人账号还是组织？
2. **许可证**：主仓库是 MIT，插件仓库建议同样 MIT（含 `lib/qq-sign` 的来源说明）。
3. **是否接受方案 B**（同步脚本 + lock 文件），还是更想要 submodule？
