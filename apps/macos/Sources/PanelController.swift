import AppKit
import WebKit

/// 面板控制器 —— 负责面板的创建、显隐、定位，以及 Web 内容与原生之间的消息桥。
final class PanelController: NSObject {

    static let shared = PanelController()

    private var panel: PanelWindow?
    private var webView: WKWebView?
    private var outsideMonitor: Any?

    /// 面板尺寸。宽度对齐编辑器里的 `--panel-width`。
    private let panelWidth: CGFloat = 432
    private let topInset: CGFloat = 8
    private let bottomInset: CGFloat = 8
    private let edgeGap: CGFloat = 0
    private let cornerRadius: CGFloat = 13

    private override init() { super.init() }

    // MARK: - 显隐

    var isVisible: Bool { panel?.isVisible ?? false }

    func toggle() {
        isVisible ? hide() : show()
    }

    func show() {
        guard let panel else {
            Log.write("面板尚未创建，先创建")
            createPanel()
            show()
            return
        }

        reposition(panel)
        // 必须用 orderFrontRegardless —— makeKeyAndOrderFront 在 App 非激活时会拒绝显示
        panel.orderFrontRegardless()
        takeKey()
        installOutsideMonitor()
        webView?.evaluateJavaScript("window.__ifoloFocus && window.__ifoloFocus()")
        Log.write("面板显示 frame=\(panel.frame) visible=\(panel.isVisible) key=\(panel.isKeyWindow)")
    }

    func hide() {
        guard let panel else { return }
        removeOutsideMonitor()
        panel.orderOut(nil)
        Log.write("面板隐藏")
    }

    /// 窗口刚 order front 时第一次 makeKey() 可能是空操作，所以要重试。
    /// 判断依据用 panel.isKeyWindow —— accessory App 可能永远不 active，用 NSApp.isActive 会误判。
    private func takeKey(attempt: Int = 0) {
        guard let panel, panel.isVisible else { return }
        panel.makeKey()
        if panel.isKeyWindow { return }
        guard attempt < 12 else {
            Log.write("面板始终未能成为 key（尝试 \(attempt) 次）")
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak self] in
            self?.takeKey(attempt: attempt + 1)
        }
    }

    // MARK: - 创建

    private func createPanel() {
        let screen = NSScreen.main ?? NSScreen.screens[0]
        let rect = panelRect(on: screen)

        let window = PanelWindow(contentRect: rect)
        let web = makeWebView(frame: NSRect(origin: .zero, size: rect.size))

        if #available(macOS 26.0, *) {
            let glass = NSGlassEffectView(frame: NSRect(origin: .zero, size: rect.size))
            glass.style = .regular
            glass.cornerRadius = cornerRadius
            // 内容必须通过 contentView 放进去，不是 addSubview
            glass.contentView = web
            window.contentView = glass
            Log.write("使用 Liquid Glass（NSGlassEffectView）")
        } else {
            let effect = NSVisualEffectView(frame: NSRect(origin: .zero, size: rect.size))
            effect.material = .popover
            effect.blendingMode = .behindWindow
            effect.state = .active
            // 圆角只能用 maskImage —— 给 NSVisualEffectView 加 wantsLayer + cornerRadius
            // 会强制离屏渲染，直接杀掉 behind-window 的毛玻璃采样
            effect.maskImage = Self.roundedMask(size: rect.size, radius: cornerRadius)
            effect.autoresizingMask = [.width, .height]
            web.frame = effect.bounds
            web.autoresizingMask = [.width, .height]
            effect.addSubview(web)
            window.contentView = effect
            Log.write("使用 NSVisualEffectView（旧系统回退）")
        }

        // 赋值 contentViewController / contentView 可能顺带改窗口尺寸，再钉一次
        window.setContentSize(rect.size)

        panel = window
        webView = web
        loadEditor(into: web)
    }

    private func makeWebView(frame: NSRect) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(MessageBridge.shared, name: "ifolo")
        config.userContentController = controller

        let web = WKWebView(frame: frame, configuration: config)
        web.navigationDelegate = self
        // 关掉 WebView 自己的白底，否则会把原生材质盖住
        web.setValue(false, forKey: "drawsBackground")
        web.underPageBackgroundColor = .clear
        web.allowsLinkPreview = false
        return web
    }

    private func loadEditor(into web: WKWebView) {
        guard let resources = Bundle.main.resourceURL else {
            Log.write("找不到 Resources 目录")
            return
        }
        let dist = resources.appendingPathComponent("editor", isDirectory: true)
        let index = dist.appendingPathComponent("index.html")

        guard FileManager.default.fileExists(atPath: index.path) else {
            Log.write("编辑器产物不存在：\(index.path)")
            web.loadHTMLString(Self.missingEditorHTML, baseURL: nil)
            return
        }

        web.loadFileURL(index, allowingReadAccessTo: dist)
        Log.write("已加载编辑器：\(index.path)")
    }

    // MARK: - 定位

    private func panelRect(on screen: NSScreen) -> NSRect {
        let visible = screen.visibleFrame
        let height = visible.height - topInset - bottomInset
        return NSRect(
            x: visible.maxX - panelWidth - edgeGap,
            y: visible.minY + bottomInset,
            width: panelWidth,
            height: max(320, height)
        )
    }

    private func reposition(_ panel: PanelWindow) {
        guard let screen = NSScreen.main else { return }
        panel.setFrame(panelRect(on: screen), display: false)
    }

    // MARK: - 点外部收起

    private func installOutsideMonitor() {
        guard outsideMonitor == nil else { return }
        // 全局监听不会收到发给本 App 的事件，所以面板内部的点击天然被忽略
        outsideMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.leftMouseDown, .rightMouseDown]
        ) { [weak self] _ in
            self?.hide()
        }
    }

    private func removeOutsideMonitor() {
        if let monitor = outsideMonitor {
            NSEvent.removeMonitor(monitor)
            outsideMonitor = nil
        }
    }

    // MARK: - 供 Bridge 调用

    func evaluate(_ js: String) {
        webView?.evaluateJavaScript(js)
    }

    /// ⌥⌘M：展开面板并新建一条快速笔记
    func newQuickNote() {
        if !isVisible { show() }
        evaluate("window.__ifoloFocus && window.__ifoloFocus(); window.__ifoloNewNote && window.__ifoloNewNote()")
        Log.write("请求新建快速笔记")
    }

    // MARK: - 辅助

    private static func roundedMask(size: NSSize, radius: CGFloat) -> NSImage {
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }

    private static let missingEditorHTML = """
    <html><body style="font:13px -apple-system;padding:24px;color:#A91E22">
    <b>找不到编辑器产物</b><br><br>
    请先在仓库根目录执行 <code>pnpm build</code>，再重新构建 App。
    </body></html>
    """
}

// MARK: - WKNavigationDelegate
//
// WebKit 的失败全是静默的（白屏、无日志），所以每个状态都打点。
// 另外顺带把 JS 侧的错误抛到原生日志里 —— file:// 下没法开 DevTools 调试。
extension PanelController: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        Log.write("Web 开始加载")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Log.write("Web 加载完成")
        let probe = """
        (() => {
          const app = document.getElementById('app');
          return {
            title: document.title,
            appChildren: app ? app.childElementCount : -1,
            hasPM: !!document.querySelector('.ProseMirror'),
            opacity: getComputedStyle(document.documentElement).getPropertyValue('--panel-opacity'),
            booted: window.__ifoloBooted || false,
            err: window.__ifoloBootError || null,
          };
        })()
        """
        webView.evaluateJavaScript(probe) { [weak self] value, error in
            if let error {
                Log.write("Web 探针失败：\(error.localizedDescription)")
                return
            }
            Log.write("Web 探针：\(String(describing: value))")
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Log.write("Web 加载失败：\(error)")
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        Log.write("Web 准备阶段失败：\(error)")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Log.write("Web 内容进程被终止（可能内存不足），重载")
        loadEditor(into: webView)
    }
}
