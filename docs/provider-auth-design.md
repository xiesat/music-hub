# 音源登录与插件架构设计

> 状态：**P1 + P2 已实现**（网页登录窗口、凭据加密存储、v2 协议 ctx、下载风险确认）。P3 扫码登录未做。

> 目标：让需要账号的平台（QQ / 网易云 / 酷狗…）能登录，从而拿到 uid、cookie、更高音质与私人歌单；
> 同时**不把平台逻辑写死在主程序里**，并为后续多人维护降低门槛。
> 本文只讨论设计，不含实现。

---

## 一、先回答你的核心问题：登录该写死还是随插件走？

**都不是。正确切分是：登录「协议」归插件，登录「界面与凭据」归宿主。**

| 方案 | 谁写登录流程 | 后果 |
|---|---|---|
| A. 写死在程序里 | 主程序作者 | 每加一个平台就要改主程序、发版；平台一改版全部用户卡死。**否** |
| B. 完全由插件实现 | 插件作者 | 沙箱里没有 DOM/窗口，必须自己实现扫码轮询、验证码、滑块——90% 的插件作者写不出来。**否** |
| **C. 插件声明 + 宿主执行（推荐）** | 宿主做通用登录窗口，插件只声明「去哪个网址登录、要哪些 cookie」 | 加平台不改主程序；插件作者不碰登录细节 |

一句话：**插件只需要说「用浏览器打开 https://y.qq.com 登录，我要 uin/skey/p_skey 这几个 cookie」，剩下的宿主全包。**

---

## 二、三种登录通道（宿主提供，插件选）

### 通道 1：网页登录窗口（推荐主力）

宿主开一个独立的 `BrowserWindow`（独立 session，不污染主窗口），加载插件声明的 `loginUrl`。
用户在窗口里正常登录（扫码/账密/验证码都在网页里完成），宿主监听 `session.cookies`，
当声明的 cookie 名全部出现时，判定登录成功，抓取并保存。

```js
login: {
  type: 'webview',
  url: 'https://y.qq.com',
  // 出现这些 cookie 就算登录成功
  cookies: ['uin', 'skey', 'p_skey'],
  // 可选：登录后要访问一次哪个页面来激活会话
  warmup: 'https://y.qq.com/n/ryqq/profile'
}
```

**优点**：零协议逆向、天然支持扫码/短信/验证码、平台改版基本不用改插件。
**代价**：宿主需要提供窗口 UI（一次性的通用实现）。

### 通道 2：二维码轮询（体验最好，需要插件写协议）

插件导出 `createQr()` / `pollQr()`，宿主只负责展示二维码图片和轮询节奏。
实测两个平台都可直达：

| 平台 | 接口 | 实测 |
|---|---|---|
| QQ | `ssl.ptlogin2.qq.com/ptqrshow` | 200，返回 `qrsig` cookie ✅ |
| 网易云 | `/api/login/qrcode/unikey` | `{code:200, unikey:'...'}` ✅ |

适合愿意写协议的插件作者，做出来的体验最接近官方客户端。

### 通道 3：手动粘贴 Cookie（兜底）

插件声明 `type: 'manual'` + 需要的 cookie 名，宿主给一个输入框，用户从浏览器 F12 复制。
实现成本最低，用于调试或冷门平台。

---

## 三、凭据怎么存、怎么给插件

### 存储

```ts
interface ProviderCredential {
  providerId: string
  cookies: Record<string, string>   // 只存声明过的 cookie，不存全站 cookie
  tokens?: Record<string, string>   // 需要 token 的平台（如 QQ 的 musickey）
  uid?: string                      // 登录后从 cookie 推导（uin / userId）
  nickname?: string
  savedAt: number
  expiresAt?: number
}
```

- 落库前用 Electron `safeStorage`（DPAPI）加密，数据库里是密文
- **按 providerId 隔离**：网易云的 worker 只能拿到网易云的 cookie，拿不到 QQ 的
- 日志与错误上报统一脱敏（cookie 一律打码）

### 注入沙箱

沙箱里给一个只读对象，并把 cookie 预置进已有的 cookie 罐：

```js
// 插件里可以直接这样用，不用手写 Cookie 头
const me = ctx.auth.me        // { uid, nickname } | null
await ctx.request('https://music.163.com/api/...')  // 自动带 UA/Referer/cookie
```

这样插件代码里**看不到也不需要拼接 cookie 字符串**，既安全又好写。

---

## 四、插件协议要加什么（向后兼容）

当前 v1：`platform / capabilities / search / getMediaSource / getLyric / getUserPlaylists / getPlaylistTracks`。

v2 增量（全部可选，v1 脚本照常跑）：

```js
module.exports = {
  apiVersion: 2,
  platform: { id: 'netease', name: '网易云音乐', color: '#e60026' },
  capabilities: ['search', 'stream', 'lyric', 'playlist', 'auth'],

  login: { type: 'webview', url: 'https://music.163.com', cookies: ['MUSIC_U'] },

  // 登录成功后回调：把 cookie 转成 uid / 昵称，供歌单导入直接用
  async me(ctx) { return { uid: '...', nickname: '...' } },

  async search(ctx, query, page) {
    const json = await ctx.get('https://music.163.com/api/cloudsearch/pc', { s: query, type: 1 })
    if (json.code === 301) throw ctx.error('NEED_LOGIN')
    return json.result.songs.map(ctx.mapSong)   // 统一字段映射
  }
}
```

关键点：**第一个参数是 `ctx`**，宿主以后加能力（缓存、代理、限速、日志、加密原语）都不用改插件签名。

---

## 五、歌单导入怎么适配

现状：用户在弹窗里手输「用户 ID / QQ 号」。登录后这套可以简化成：

```
打开导入面板
  → 已登录？ → 直接列出「我的歌单」（用 me.uid）
  → 未登录？ → 面板里出现「登录 XX」按钮 → 登录完自动刷新
```

「按 ID / 链接导入」保留为兜底。QQ 之前导入失败正是因为没登录态拿不到私人歌单；
登录后这条链路才真正可用。

---

## 六、关于 VIP 播放：要降低预期

登录**不等于**能播所有 VIP 歌，分平台看：

| 平台 | 登录后能拿到 | 说明 |
|---|---|---|
| 网易云 | 320k / FLAC 直链（若账号有会员） | 成功率较高 |
| QQ 音乐 | 需要 `vkey` + 权限位校验 | 有登录态后**可能**拿到，仍受账号会员等级限制 |
| 酷狗 | 与登录关系不大 | 卡在 `signature` 签名算法，不是登录问题 |

另外建议：**做「播放」，不做「批量下载 VIP」**。播放是本地缓存的边界内，批量下载整张会员专辑的性质完全不同，
既容易被风控，法律风险也明显更高。

---

## 七、插件简化（这条最重要，直接决定多人维护可行性）

现在插件作者要自己处理：拼 URL、设 UA/Referer、管 cookie、解析嵌套 JSON、错误处理、字段映射。
建议宿主提供这些「胶水」，把插件瘦身一半以上：

| 提供的原语 | 解决什么 |
|---|---|
| `ctx.get/post(url, params)` | 自动 UA/Referer/cookie、自动 `JSON.parse`、自动重试 |
| `ctx.mapSong(raw)` | 平台字段 → 统一 `{id,title,artist,album,duration,cover}` |
| `ctx.error('NEED_LOGIN' / 'NOT_AVAILABLE' / 'RATE_LIMITED')` | 宿主统一处理：弹登录 / 置灰 / 退避 |
| `ctx.crypto.md5/aesCbc/aesEcb/rsaEncrypt` | **网易云 weapi、QQ 签名都需要加密，手写实现不现实** |
| `ctx.log(...)` + 插件日志面板 | 作者能自己看到请求/错误，不用问主程序作者 |
| `providers/<id>.d.ts` 类型声明 + 模板脚手架 | 编辑器里就有提示，降低写错概率 |

再配套三件事：

1. **apiVersion 兼容检查**：宿主加载脚本时校验版本，不兼容给明确提示，而不是白屏
2. **热重载 + 调试面板**：改完 js 点「重载」，不用重启应用
3. **一页式插件文档**：只讲「导出什么、ctx 有什么、错误码怎么用」，不写长篇教程

---

## 八、安全与合规（必须写进 UI 提示）

1. **第三方脚本能读到本平台的登录 cookie** —— 导入脚本时必须明确警告「只导入你信任的脚本」
2. 凭据加密存储、按平台隔离、日志脱敏
3. 账号风险：异地登录、频繁请求可能触发风控甚至封号，UI 上要提示
4. VIP 内容：建议只做在线播放，不做批量下载

---

## 九、建议的实施顺序

| 阶段 | 内容 | 价值 | 工作量 |
|---|---|---|---|
| **P1** | 宿主通用 **网页登录窗口** + 凭据加密存储 + 注入沙箱 + 歌单导入自动用 uid | 一次性解决 QQ/网易云登录与私人歌单 | 中 |
| **P2** | 插件原语（request/mapSong/crypto/error）+ d.ts + 模板 + 热重载 + 日志面板 | 插件从 ~150 行降到 ~50 行，多人可维护 | 中 |
| **P3** | 扫码登录（QQ ptqrlogin / 网易云 qr） | 体验最好，但属于锦上添花 | 中 |

**P1 与 P2 建议一起做**：否则登录做完，插件还是难写。P3 可以后置。

---

## 十、需要你拍板的 4 件事

1. **登录通道优先级**：先做「网页登录窗口」（通用、零逆向），还是直接上「扫码」？
   我建议先 webview，扫码放 P3。
2. **VIP 范围**：只做播放，还是也要下载？我建议只播放。
3. **插件协议是否升级到 v2**（ctx 作为第一参数）？
   升级会改现有 3 个脚本，但之后加能力不再破坏兼容。
4. **是否现在就把 `resources/providers` 拆成独立仓库**（方便别人提 PR）？
   可以先留在主仓库 `providers/` 目录，等有外部贡献者再拆。