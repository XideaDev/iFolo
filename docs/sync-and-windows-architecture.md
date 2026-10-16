# iFolo Phase 3 核心技术规范：跨平台同步协议与 Windows 原生外壳

本文档为 iFolo Phase 3（差异化能力与跨平台生态）的权威实施规范，覆盖 **端到端加密同步协议（PRD FR-11）**、**大附件分离存储（突破 1MB 上限）** 以及 **Windows 原生外壳技术架构**。

---

## 一、端到端加密同步协议 (FR-11)

### 1. 核心业务痛点与技术目标
- **竞品痛点**：Flyout 单条笔记超过 1MB 就会静默无法同步；多数笔记软件直接将 Markdown 与图片塞入同一张表或同一个文件，极易造成同步阻塞与数据膨胀。
- **iFolo 架构目标**：
  - **单条笔记无上限**：正文 Markdown 与静态媒体附件分离存储。
  - **零知识架构（Zero-Knowledge）**：数据在客户端本地加密后才离散上传至对象存储与中继服务，云端服务器无法窥探任何笔记明文。
  - **离线优先（Local-First & Offline-First）**：无网状态下完全自由读写，联网时自动增量同步，平均延迟 ≤ 3s。
  - **智能冲突合并**：基于行级三方合并（3-way line merge），不可自动调和时生成独立冲突分支副本，永不静默覆盖。

---

### 2. 本地存储模型演进 (Store V2)

```
~/Library/Application Support/iFolo/
├── notes/                     # Markdown 正文（唯一真相源）
│   ├── <UUID-A>.md
│   └── <UUID-B>.md
├── assets/                    # 本地媒体资源池（正文仅引用相对/虚拟协议路径）
│   ├── <UUID-A>/
│   │   ├── image-01.webp
│   │   └── attachment.pdf
│   └── <UUID-B>/
└── sync/                      # 同步增量日志与本地元数据
    ├── wal.log                # Write-Ahead Log 本地操作流水
    └── sync-state.json        # 各笔记云端同步游标与内容哈希
```

#### Markdown 内的附件引用协议
笔记正文中严禁嵌入 base64 媒体串，统一采用虚拟 URI 规范：
```markdown
# 技术方案讨论

这是架构设计图：
![架构图](ifolo-asset://550e8400-e29b-41d4-a716-446655440000/arch.webp)
```
- 本地原生外壳通过 WKURLSchemeHandler / 自定义协议拦截 `ifolo-asset://`，安全高效从本地 `assets/` 目录流式加载，零内存拷贝。
- 同步时，媒体附件以单个文件的 SHA-256 哈希命名，独立上传至云端加密对象存储（S3 / R2），正文只同步轻量 Markdown。

---

### 3. 加密信封格式 (Cryptographic Envelope)

每个同步单元（正文块或附件文件）在离开发送端设备前，均使用 **XChaCha20-Poly1305**（或带有 AAD 的 AES-256-GCM）打包成标准密文信封：

```json
{
  "version": 1,
  "keyId": "k_dev_macbook_01",
  "noteId": "550e8400-e29b-41d4-a716-446655440000",
  "rev": 14,
  "timestamp": 1729000000000,
  "baseHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "nonce": "dGhpcyBpcyBhIDI0LWJ5dGUgbm9uY2U=",
  "ciphertext": "base64_encoded_encrypted_payload==",
  "tag": "16_byte_poly1305_auth_tag=="
}
```

#### 密钥派生体系 (KDF)
- 主密钥 $MasterKey$ 由用户的主口令通过 **Argon2id**（$Memory=64MB, Iterations=3$）在本地派生。
- 主密钥通过本地系统安全存储（macOS Keychain / Windows Credential Manager）严格保护。
- 每次会话为每个设备签发临时设备凭证，云端仅充当加密块的中继路由器（Relay Router），零知识存储。

---

### 4. 冲突解决机制与 3-Way Merge

```
               [设备 A 提交 Rev 13]
                     │
               [Base 版本 Rev 12]
                     │
               [设备 B 提交 Rev 13']
                     ↓
         [三方行级文本合并算法 (3-Way Merge)]
        /                                   \
   [无重叠行冲突]                      [同一行被同时修改]
        ↓                                   ↓
 自动合并为 Rev 14                    生成冲突保留副本：
                                 "技术方案讨论 (设备B的冲突副本 10-15)"
```

1. **自动合并阶段**：若两台设备修改的是不同段落或不同待办项，算法依据行指纹自动合并双方变更并递增版本。
2. **冲突防丢阶段**：若两端同时修改了同一行内容，系统立即保留主设备改动，同时在同目录下自动克隆出一条标注了修改来源和时间戳的冲突分支笔记，确保用户知识零丢失。

---

## 二、Windows 原生外壳技术架构方案

### 1. 架构选型对照

| 考量维度 | 方案 A: C# / WinUI 3 + WebView2 | 方案 B: Rust + Win32 + WebView2 | 方案 C: Tauri 2.0 |
| :--- | :--- | :--- | :--- |
| **原生性能** | 极佳（.NET 8 Native AOT，冷启动 < 200ms） | 极致（二进制 < 10MB，零运行时） | 优异（但跨语言 IPC 胶水代码多） |
| **Windows 原生集成** | 完美（支持 Windows 11 Mica/Acrylic 亚克力材质） | 较好（调用 DwmSetWindowAttribute） | 一般（跨平台抽象层偶有系统级边角问题） |
| **非夺焦面板支持** | `WS_EX_NOACTIVATE` 直接支持 | `WS_EX_NOACTIVATE` 完美支持 | 需魔改内部 tao 窗口层 |
| **边缘热区鼠标追踪** | `SetWindowsHookEx(WH_MOUSE_LL)` | `SetWindowsHookEx(WH_MOUSE_LL)` | 需要底层注入 Win32 Hook |
| **团队推进效率** | **最高（生态成熟，开发体验极其贴近 macOS）** | 较高（心智负担略大） | 中等 |

> **推荐决议**：采用 **C# / .NET 8 + WebView2 + WinUI 3 (Windows App SDK)** 作为 Windows 原生外壳。
> 理由：能够完美调用 Win32 原生 API、直接利用系统 Mica 亚克力材质、与现有 Web 前端完全对齐通信桥。

---

### 2. Windows 外壳的三大底层关键技术点

#### (1) 屏幕边缘吸附与非夺焦面板 (Non-Activating Window)
在 Windows 下，若普通窗口呼出时夺焦，会导致用户当前正在工作的 Word、浏览器或 IDE 瞬间失焦；iFolo 的核心设计理念是「随时呼出、快速记录、不打扰主工作流」。
```csharp
// Windows 原生窗口创建参数设置
protected override void OnSourceInitialized(EventArgs e)
{
    base.OnSourceInitialized(e);
    var hwnd = new WindowInteropHelper(this).Handle;
    
    // 设置 WS_EX_NOACTIVATE 与 WS_EX_TOOLWINDOW
    int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
    SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW);
}
```

#### (2) 屏幕边缘鼠标热区检测
通过轻量级全局鼠标低级钩子（`WH_MOUSE_LL`）或低频（100ms）轮询当前光标物理位置：
```csharp
var screen = System.Windows.Forms.Screen.PrimaryScreen;
if (cursorPos.X >= screen.Bounds.Right - 3)
{
    // 鼠标在右边缘停留超过 120ms，平滑呼出面板
    TriggerDwellTimer();
}
```

#### (3) 统一通信桥契约对接
Windows 端 WebView2 通过 `CoreWebView2.WebMessageReceived` 与前端通信，前端的 [`storage.ts`](file:///Users/jenson/Documents/Workspace/iFolo/packages/editor/src/storage.ts) 已经解耦了外壳层实现：
```typescript
// packages/editor/src/storage.ts 可无缝接入 Windows 桥：
const maybeWinBridge = (window as any).chrome?.webview;
if (maybeWinBridge) {
    // 自动对接 Windows 原生外壳，无需修改编辑器核心代码！
}
```

---

## 三、结语与演进路线

1. **Phase 1（完成）**：彻底修复 8+ 个核心代码缺陷，构建 Vitest 单测矩阵，消除全部编译告警。
2. **Phase 2（完成）**：构建 `NoteList` 抽屉与全库检索联动，实现 360px~520px 自由拖拽与持久化，打通全流程 CRUD。
3. **Phase 3（完成）**：
   - 落地 **本地向量语义检索引擎（SearchEngine.swift）**，基于 Apple NaturalLanguage 框架实现脱机 300 维密集向量余弦相似度检索与最佳片段高亮提取；
   - 制定 **大附件分离与端到端加密同步协议（FR-11）**；
   - 确立 **Windows 原生外壳技术路线与接口桥接标准**。
