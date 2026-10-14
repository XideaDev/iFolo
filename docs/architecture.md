# iFolo 架构

## 一句话

**原生外壳 + Web 编辑器。**

外壳必须是原生的，因为三件事 Web 层做不到：屏幕边缘热区、悬浮面板不夺焦、全局快捷键。编辑器用 Web 技术，是为了让同一套代码将来能直接复用到 Windows 外壳，不必写两遍。

## 分层

```
┌───────────────────────────────────────────────────────────┐
│  Swift / AppKit 外壳                                       │
│                                                            │
│  EdgeTrigger      屏幕边缘热区（透明无边框窗口 + 鼠标追踪）   │
│  HotKey           Carbon RegisterEventHotKey 全局快捷键     │
│  PanelWindow      NSPanel · nonactivatingPanel             │
│  PanelController  显示/收起、失焦收起、尺寸与定位            │
│  StatusItem       状态栏图标（左键开面板 / 右键出菜单）       │
│  Store            本地 Markdown 读写（Application Support） │
│  Log              追加式日志 ~/Library/Logs/iFolo.log       │
├───────────────────────────────────────────────────────────┤
│  WKWebView（loadFileURL 加载打包后的编辑器）                │
│                                                            │
│  ProseMirror      文档模型 + 事务 + 视图                    │
│  schema.ts        节点与标记定义                            │
│  markdown.ts      Markdown ↔ 文档 双向序列化（存储格式）     │
│  plugins/         斜杠命令 · 段落指示器 · 任务状态           │
│  ui/              富文本工具栏 · 块菜单 · 斜杠菜单           │
└───────────────────────────────────────────────────────────┘
```

## 关键决策与理由

### 1. 为什么用 `.nonactivatingPanel`

macOS 拒绝从状态栏点击激活一个 accessory App（`NSApp.activate()` 静默失败）。普通 `.borderless` 窗口只有在 App 激活时才能成为 key，于是面板永远不是 key —— **用户打开面板后的第一次点击会被系统吃掉用于聚焦窗口，表现为「每个操作都要点两次」**。

`.nonactivatingPanel` 是唯一能在 App 未激活时拿到 key 的窗口类型，正是为此而生。

配套两条（否则仍然出问题）：

- 用 `orderFrontRegardless()`，**不要** `makeKeyAndOrderFront()` —— 后者在 App 非激活时会拒绝显示
- `makeKey()` 要重试 —— 窗口刚 order front 时第一次调用可能是空操作，判断依据用 `panel.isKeyWindow` 而不是 `NSApp.isActive`

### 2. 为什么用 Markdown 作为存储格式

不是「导出格式之一」，而是**唯一真相源**。理由：

- 用户的数据不该被锁在私有格式里
- 编辑器崩溃或 App 被卸载，笔记仍然可读
- 跨平台同步时不必定义二进制协议

任务状态用扩展语法：`- [ ]` / `- [x]` 保持与标准 Markdown 兼容，额外的状态写为 `- [inProgress]`、`- [inReview]` 等。这样即使别的编辑器不认识 iFolo 的扩展状态，也能把它当普通列表项读出来。

### 3. 为什么编辑器不用原生实现

原生富文本编辑器（NSTextView）能做到很好的体验，但：

- 跨平台要重写一遍
- ProseMirror 的文档模型与事务机制，对「段落指示器 / 块菜单 / 斜杠命令」这类结构操作更友好
- 代价是冷启动需要等 WebKit 进程与 bundle 解析 —— 用**像素级对齐的骨架屏**掩盖

### 4. 段落指示器为什么不能插进编辑器节点树

手柄（＋ / ⠿）必须渲染在**编辑器容器外层**、用绝对定位对齐行高。

如果把外来节点插入编辑器管理的树中，会破坏光标与选区行为 —— 这是 ProseMirror 的硬约束。iFolo 的做法是：手柄是独立的 overlay 层，通过读取目标块的 `getBoundingClientRect()` 定位。

### 5. 透明度与材质解耦

面板不透明度（管「透多少」）与模糊材质（管「透得糊不糊」）是两个独立参数。

四条硬约束：

1. 只作用于面板背景层，**命令面板与各类浮层必须保持不透明**
2. 透明度下降时文字自动加深，维持 AA 对比度
3. 与系统「降低透明度」辅助功能联动，系统开启时强制回 100%
4. 不透明度与模糊材质解耦

## 数据流

```
用户输入
  ↓
ProseMirror 事务
  ↓
onUpdate → 防抖 400ms
  ↓
markdown.ts 序列化
  ↓
WKWebView → Swift（postMessage / 自定义 scheme）
  ↓
Store 原子写入 ~/Library/Application Support/iFolo/notes/*.md
```

读取方向相反：App 启动 → 读 Markdown → 注入 WKWebView → markdown.ts 解析 → 创建文档。

## 目录

```
packages/editor/
  src/
    main.ts          入口：装配编辑器、工具栏、各插件
    tokens.css       设计令牌（唯一真相源）
    app.css          编辑器与面板样式
    schema.ts        节点与标记定义
    markdown.ts      Markdown 双向序列化
    storage.ts       与外壳的通信桥（浏览器里退化为 localStorage）
    plugins/
      slash.ts       斜杠命令
      blockhandle.ts 段落指示器
      todo.ts        任务状态
    ui/
      toolbar.ts     富文本工具栏
      slashmenu.ts   斜杠命令菜单
      blockmenu.ts   块操作菜单
apps/macos/
  build.sh           swiftc 构建脚本
  Resources/Info.plist
  Sources/           Swift 源码
```
