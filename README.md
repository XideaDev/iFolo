# iFolo

**屏幕边缘笔记 · 跨 Mac / Windows**

轻量、快速、随手可及。鼠标碰到屏幕边缘或按一下快捷键，笔记面板就浮在你手头的工作之上；写完随手收起，不打断心流。

> 状态：**早期开发中**。当前里程碑是「面板能在 macOS 上呼出、能写、能存」。

---

## 为什么做 iFolo

「屏幕边缘笔记」这个形态已经有成熟产品（SideNotes 做了 7 年，Flyout 做了 2 年），但整个品类都被锁在 Apple 生态里——Windows 用户完全无人服务。同时，现有产品的检索能力普遍停留在「关键词 + 标签」，笔记越记越多、越找越难。

iFolo 想做的是三件它们结构性做不到的事：

1. **跨平台** —— Mac 和 Windows 用同一套笔记
2. **无同步上限** —— 单条笔记不因体积被拒绝同步
3. **语义检索** —— 用自然语言找回你写过的东西，而不必记得关键词

完整的产品判断见 [`docs/`](docs/)。

## 设计原则

> **凡是要求用户「先做一次选择，再找内容」的控件，都应该下沉为内容上的被动标识。**

产品主打轻量快速，所以顶栏只留「搜索 / 筛选 / 新建」三个动作。分类（快速 / 笔记 / 提醒）不作为顶栏切换器，而是以 12px 图标标识在每张卡片标题前——用户脑子里想的是「那条关于连接池的笔记」，不是「它在哪个模式里」。

## 架构

```
┌─────────────────────────────────────────────┐
│  macOS 外壳（Swift / AppKit）                │
│  边缘热区 · 悬浮面板不夺焦 · 全局快捷键       │
│  状态栏图标 · Liquid Glass 材质 · 本地存储    │
├─────────────────────────────────────────────┤
│  WKWebView                                   │
│  ┌───────────────────────────────────────┐  │
│  │  编辑器（TypeScript + ProseMirror）    │  │
│  │  富文本 · 斜杠命令 · 段落指示器         │  │
│  │  任务状态 · Markdown 双向序列化         │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**为什么是「原生外壳 + Web 编辑器」**：外壳必须原生，才能做到边缘热区、悬浮不夺焦、全局快捷键、系统 vibrancy —— 这些 Web 层做不到。而编辑器用 Web 技术，是为了让同一套代码将来能直接复用到 Windows 外壳，不必重写两遍。

## 目录

```
packages/editor/    ProseMirror 编辑器（TypeScript，可独立在浏览器里跑）
apps/macos/         macOS 原生外壳（swiftc 构建，无 Xcode 工程）
docs/               架构说明、设计令牌、产品需求
```

## 开发

### 当前状态（v0.1.0，已验证）

| 能力 | 状态 |
|---|---|
| 面板呼出 / 收起 | ✅ ⌥⌘N 已注册并验证 |
| 屏幕边缘热区 | ✅ 已启动（右侧 3pt，停留 120ms） |
| 悬浮不夺焦 | ✅ `.nonactivatingPanel`，`isKeyWindow=true` |
| Liquid Glass 材质 | ✅ macOS 26+ `NSGlassEffectView` |
| 编辑器渲染 | ✅ ProseMirror 已挂载（`hasPM=1`） |
| Markdown 持久化 | ✅ 原子写入 `~/Library/Application Support/iFolo/notes/` |
| 富文本工具栏 / 斜杠命令 / 段落指示器 | ✅ 已实现 |
| 6 种任务状态 | ✅ 已实现，含 Markdown 双向序列化 |
| 面板不透明度 | ✅ 可在状态栏菜单调节 |
| **语义检索** | ⬜ 未开始 |
| **跨平台（Windows）** | ⬜ 未开始 |
| **iCloud / 自建同步** | ⬜ 未开始 |

排错入口：`~/Library/Logs/iFolo.log`。Web 侧的启动错误会通过
`WKNavigationDelegate` 探针写进这个日志 —— file:// 下没法开 DevTools。

### 编辑器（浏览器里调试）

```sh
pnpm install
pnpm --filter @ifolo/editor dev      # 打开 http://localhost:5173
pnpm --filter @ifolo/editor build    # 产出 packages/editor/dist
```

### macOS App

```sh
pnpm --filter @ifolo/editor build    # 外壳会内嵌编辑器产物
cd apps/macos && ./build.sh          # 产出 build/iFolo.app
open build/iFolo.app
```

日志在 `~/Library/Logs/iFolo.log`。菜单栏 App 没有控制台，所有失败都是静默的，所以关键节点都写日志。

## 快捷操作

| 操作 | 方式 |
|---|---|
| 呼出 / 收起面板 | 指针移到屏幕右边缘，或按 `⌥⌘N` |
| 新建快速笔记 | `⌥⌘M` |
| 斜杠命令 | 在编辑器里输入 `/` |
| 段落指示器 | 悬停段落左侧 |
| 保存 | 自动（防抖后写入本地 Markdown） |

## 许可

MIT
