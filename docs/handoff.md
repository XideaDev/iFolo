# iFolo 项目交接报告

| 项 | 内容 |
|---|---|
| 交接日期 | 2026-10-15 |
| 交接版本 | **v0.1.0**（第一个可运行版本） |
| 远程仓库 | https://github.com/XideaDev/iFolo |
| 工作目录 | `/Users/jenson/Documents/Workspace/iFolo` |
| 代码规模 | 39 个源文件 · 4520 行 · 2 个提交 |
| 负责人 | Jenson |

---

## 1. 一句话现状

**能呼出、能写、能存。** 鼠标碰到屏幕右边缘或按 `⌥⌘N`，Liquid Glass 面板浮在右缘；ProseMirror 编辑器可正常编辑；内容自动防抖保存为本地 Markdown。语义检索、跨平台、云同步三项差异化能力**尚未开始**。

---

## 2. 怎么验证（5 分钟）

```sh
cd /Users/jenson/Documents/Workspace/iFolo

# 1) 构建编辑器
pnpm install
pnpm build                      # 产出 packages/editor/dist

# 2) 构建 macOS App
cd apps/macos && ./build.sh     # 产出 build/iFolo.app
open build/iFolo.app

# 3) 看面板
#    鼠标移到屏幕右边缘并停留，或按 ⌥⌘N
#    ⌥⌘M 新建快速笔记

# 4) 看日志（所有成败都在这里）
cat ~/Library/Logs/iFolo.log
```

**验收日志基准**（v0.1.0 实测输出，作为回归参照）：

```
快捷键已注册 id=1 keyCode=45
快捷键已注册 id=2 keyCode=46
使用 Liquid Glass（NSGlassEffectView）
面板显示 frame=(1080.0, 64.0, 432.0, 877.0) visible=true key=true
Web 探针：{ appChildren=5; booted=1; err=<null>; hasPM=1; opacity="0.82" }
```

浏览器里单独调试编辑器：`pnpm --filter @ifolo/editor dev` → http://localhost:5173

---

## 3. 架构：原生外壳 + Web 编辑器

```
┌─────────────────────────────────────────────┐
│  macOS 外壳（Swift / AppKit，9 个文件）       │
│  边缘热区 · 悬浮面板不夺焦 · 全局快捷键        │
│  状态栏图标 · Liquid Glass 材质 · 本地存储     │
├─────────────────────────────────────────────┤
│  WKWebView（file:// 加载）                   │
│  ┌───────────────────────────────────────┐  │
│  │  编辑器（TypeScript + ProseMirror）     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 文件职责对照

| 模块 | 文件 | 职责 |
|---|---|---|
| 外壳 | `apps/macos/Sources/App.swift` | 启动装配、默认面板展开策略 |
| 外壳 | `apps/macos/Sources/PanelWindow.swift` | `NSPanel` 子类，`.nonactivatingPanel` + `orderFrontRegardless` |
| 外壳 | `apps/macos/Sources/PanelController.swift` | 玻璃材质（macOS 26+）+ 回退、WebView 装配、导航探针 |
| 外壳 | `apps/macos/Sources/EdgeTrigger.swift` | 全局鼠标监听 + 停留计时触发（无透明窗口） |
| 外壳 | `apps/macos/Sources/HotKey.swift` | Carbon `RegisterEventHotKey`（免辅助功能权限） |
| 外壳 | `apps/macos/Sources/MessageBridge.swift` | `WKScriptMessageHandler` 桥，8 个消息动作 |
| 外壳 | `apps/macos/Sources/Store.swift` | Markdown 文件存储，原子写入 |
| 外壳 | `apps/macos/Sources/StatusItem.swift` | 菜单栏（显示/隐藏、不透明度、打开文件夹、打开日志） |
| 外壳 | `apps/macos/Sources/Log.swift` | 追加日志 → `~/Library/Logs/iFolo.log` |
| 编辑器 | `packages/editor/src/main.ts` | 装配入口 + 面板骨架 + 自动保存 |
| 编辑器 | `packages/editor/src/schema.ts` | 节点规范（标题/列表/任务/代码块/引用/表格/分割线） |
| 编辑器 | `packages/editor/src/markdown.ts` | Markdown 双向序列化 |
| 编辑器 | `packages/editor/src/slash.ts` `src/ui/slashmenu.ts` | 斜杠命令 |
| 编辑器 | `packages/editor/src/ui/blockhandle.ts` `src/ui/blockmenu.ts` | 段落指示器 + 块菜单 |
| 编辑器 | `packages/editor/src/ui/toolbar.ts` | 富文本工具栏 |
| 编辑器 | `packages/editor/src/taskstatus.ts` | 6 种任务状态定义 |
| 编辑器 | `packages/editor/src/storage.ts` | 桥接客户端 + localStorage 回退 |
| 令牌 | `packages/editor/src/tokens.css` `src/app.css` | iFolo 色彩体系全套设计令牌 |

### 桥接协议（8 个动作）

| 动作 | 方向 | 用途 |
|---|---|---|
| `boot` | JS → Native | 启动握手，回传活动笔记 ID |
| `load` | JS → Native | 拉取某条笔记的 Markdown |
| `save` | JS → Native | 保存（防抖后） |
| `create` | JS → Native | 新建笔记 |
| `remove` | JS → Native | 删除 |
| `rename` | JS → Native | 改标题 |
| `setOpacity` | Native → JS | 不透明度调节 |
| `closePanel` | Native → JS | 收起面板前通知 |

---

## 4. 已实现能力（v0.1.0）

| 能力 | 状态 | 说明 |
|---|---|---|
| 面板呼出 / 收起 | ✅ | `⌥⌘N` + 右缘热区（3pt 宽，停留 120ms） |
| 悬浮不夺焦 | ✅ | `.nonactivatingPanel`，实测 `isKeyWindow=true` |
| Liquid Glass 材质 | ✅ | `NSGlassEffectView`，macOS 26+ |
| 多显示器 | ✅ | 取 `NSScreen.main` 的可视框架定位 |
| 编辑器内核 | ✅ | ProseMirror，标题 / 列表 / 任务 / 代码块 / 引用 / 表格 |
| 富文本工具栏 | ✅ | 34px 单行，窄面板溢出收进「⋯」 |
| 斜杠命令 | ✅ | 输入 `/` 唤出 |
| 段落指示器 + 块菜单 | ✅ | 悬停浮出手柄；渲染在容器外层，不进入 ProseMirror 节点树 |
| 6 种任务状态 | ✅ | 待办池 / 待办 / 进行中 / 审核中 / 已完成 / 已取消 |
| Markdown 双向序列化 | ✅ | 任务状态写作 `- [inProgress]` 扩展语法 |
| 本地持久化 | ✅ | `~/Library/Application Support/iFolo/notes/<UUID>.md` |
| 面板不透明度 | ✅ | 状态栏菜单档位调节（0.5–1.0） |
| 启动探针 | ✅ | `booted` / `hasPM` / `err` 三个标志写进原生日志 |

### 未完成（下一步按此优先级）

| 优先级 | 事项 | 说明 |
|---|---|---|
| **P0** | 语义检索 | PRD 确认的差异化项之一。当前检索尚未实现 |
| **P0** | Windows 外壳 | 跨平台是核心卖点；编辑器包已按可复用设计（无 macOS 专属依赖） |
| **P1** | 云同步 | 自建加密同步或 iCloud。需先定「单条笔记无体积上限」的实现方案 |
| **P1** | 笔记列表 UI | 当前面板只做单条编辑，没有侧边列表 |
| **P2** | 面板宽度可调 | PRD 要求可调 360–520，当前固定 432 |
| **P2** | 自动化测试 | 仓库目前**零测试** |

> PRD 的完整需求清单（FR-01 ~ FR-29）见 `docs/product-analysis.html` 第 10 节。

---

## 5. 已知的坑与规避方法

这一节是整个交接里**最重要的部分** —— 每一个都花了实际调试时间，且症状都是静默失败（白屏、快捷键无响应、进程消失）。

### 5.1 WKWebView 的 file:// 限制（最难查）

| 症状 | 真因 | 解法 |
|---|---|---|
| 白屏，无任何日志 | `file://` 下 **ES module 被 CORS 拦掉** | Vite 改为 IIFE 单文件；`scripts/fix-dist.mjs` 把 `<script type="module">` 改写成经典 `<script defer>` |
| 白屏 | Vite 把 `<script>` 提到 `<head>`，无 `defer` 时在 `#app` 存在前执行 → `root.append` 传 null | `main.ts` 的 `boot()` 开头 `await domReady()` |

> 排错手段：另建 `vite.debug.config.ts`（`minify: false`）产未压缩版 + 原生 `didFinish` 探针读 `window.__ifoloBootError`。**file:// 下开不了 DevTools，这是唯一能拿到行号的办法。** 修完后已删除该配置文件。

### 5.2 WKWebViewConfiguration 不能用 KVC 设私有键

```swift
config.setValue(true, forKey: "developerExtrasEnabled")  // ❌ 进程 SIGABRT
```
该键在较新 SDK 已不存在，触发 `NSUnknownKeyException` → 直接 abort，**没有任何 Swift 侧堆栈**。`PanelController.makeWebView` 里已移除，保留可用的 `drawsBackground` / `allowsLinkPreview`。

### 5.3 快捷键事件处理器不能重装

给每个 `HotKey` 各装一次 `EventHotKeyTarget` 会报 **-9866**，第二个快捷键静默注册失败。现在由 `HotKeyRegistry` 全局装一次，按 `id` 分发。其余 `private static` 在模块级函数里访问不到，需 `internal`。

### 5.4 acceptsFirstMouse 位置错了

`acceptsFirstMouse(for:)` 是 **`NSView`** 的方法，写在 `NSWindow` 子类上会静默失效 —— 首击被无边框窗口吃掉。

### 5.5 PanelWindow 的窗口类型决定能不能拿到 key

`.nonactivatingPanel` + `orderFrontRegardless()` 是 **App 未激活时唯一能拿到 key 的状态组合**。用 `NSWindowController` 或普通 `NSWindow` 时，面板能显示但每次操作要先点一下（否则不接键盘）。

### 5.6 Chrome headless 最小窗口宽度 500px

macOS 的 `--headless --screenshot` 无法按小于 500px 的宽度截屏，超出部分被裁掉且**不报错**。曾因此误判「状态胶囊没渲染」（432px 宽的 432px 面板右侧 68px 被切）。验证 432px 宽面板应改用 560px 窗口 + 居中偏移，或直接看 DOM 探针。

### 5.7 沙箱与 pnpm store

pnpm 默认要往 `~/Library/pnpm/store` 写符号链接，会被沙箱拒绝。已把 `store-dir` 指到仓库根的 `.pnpm-store/`（见 `.npmrc`）。esbuild 的安装后构建脚本需在 `package.json` 的 `pnpm.onlyBuiltDependencies` 里显式授权。

### 5.8 cp -R 的路径语义

`cp -R dist/ Resources/editor/` 得到的是 `Resources/editor/dist/`（多一层），**正确写法是 `cp -R dist/. Resources/editor/`**。

---

## 6. 环境前提

| 依赖 | 状态 | 说明 |
|---|---|---|
| macOS 26.0 + arm64 | 必须 | Swift 6.4 / Xcode 27，`NSGlassEffectView` 依赖 macOS 26+ |
| Node ≥ 20 | 必须 | 实测 22.22.2 |
| pnpm | 必须 | lockfile 未入库，`pnpm install` 会按 package.json 重解 |
| **Rust / Tauri** | **未安装** | 当初因此选了「原生外壳 + Web」，而非 Tauri |

`Liquid Glass` 的旧系统回退代码在 `PanelController` 里，但**未在旧版本 macOS 上验证过** —— 接手者若无 macOS 26 以下的机器，这块属于未检验代码。

---

## 7. 交接检查清单

接手时建议按顺序确认：

- [ ] `pnpm install && pnpm build` 通过
- [ ] `cd apps/macos && ./build.sh` 产出 `.app`
- [ ] `open build/iFolo.app` 后 `cat ~/Library/Logs/iFolo.log` 与 §2 基准一致
- [ ] 右缘热区能呼出面板
- [ ] 面板不夺焦（呼出后可直接打字，不需先点击）
- [ ] 输入内容等 3 秒，`~/Library/Application Support/iFolo/notes/` 有新 `.md`
- [ ] 输入 `/` 唤出斜杠命令；悬停段落左侧出现手柄
- [ ] 任务状态写成 `- [inProgress]`，重启后 Markdown 能正确还原成胶囊
- [ ] `pnpm --filter @ifolo/editor dev` 浏览器里能独立跑

### 数据位置（清理时注意）

| 路径 | 内容 |
|---|---|
| `~/Library/Application Support/iFolo/notes/` | 用户笔记（唯一数据，勿随意删） |
| `~/Library/Logs/iFolo.log` | 运行日志 |
| UserDefaults `app.ifolo.macos` | 首启标记、活动笔记 ID。**删掉可让面板下次自动展开（调试用）** |
| UserDefaults `ifolo.hasLaunchedBefore` | 同上 |

---

## 8. 交接时仍待决的事项

1. **Windows 外壳的 UI 技术路线未定。** 编辑器包已做到平台无关，但外壳用什么实现（WinUI / WebView2 还是 Electron 外壳）需要先决定，这会影响编辑器包暴露哪些接口。
2. **同步方案未定。** 「单条笔记无体积上限」需要附件与正文分离存储，这个决定会影响 `Store` 层的数据模型 —— 建议在写同步前先改 `Store`，否则后面要返工。
3. **本地暂无测试。** 建议在动同步前先给 `markdown.ts` 补一轮单测（它的序列化正确性直接影响数据安全）。
4. **`.workbuddy-ai/` 未入库**，已加入 `.gitignore`。若希望入版本库需自行决定。

---

_相关文档：`README.md` · `docs/architecture.md` · `docs/design-tokens.md` · `docs/product-analysis.html`（竞品实测 + 完整 PRD）_
