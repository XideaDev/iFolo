import AppKit

/// iFolo macOS 外壳入口。
///
/// 用自定义 `main()` 而不是 `@main` + SwiftUI App —— 我们需要 `NSStatusItem` 的
/// 左右键分流，而 `MenuBarExtra` 做不到。
@main
final class AppDelegate: NSObject, NSApplicationDelegate {

    private var statusItem: StatusItem?
    private var edgeTrigger: EdgeTrigger?
    private var hotKeys: [HotKey] = []

    static func main() {
        let app = NSApplication.shared
        // NSApplication.delegate 是 weak，必须自己持有强引用
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        Log.rotateIfNeeded()
        Log.write("──────── iFolo 启动 v\(Self.version) ────────")

        // 定时器与监听必须在 didFinishLaunching 里起，不要放进任何视图的 onAppear
        statusItem = StatusItem()

        let trigger = EdgeTrigger()
        trigger.zoneWidth = 3
        trigger.dwell = 0.12
        trigger.start()
        edgeTrigger = trigger

        registerHotKeys()

        // 首次启动时把面板亮一下，让用户知道它在哪
        if !UserDefaults.standard.bool(forKey: "ifolo.hasLaunchedBefore") {
            UserDefaults.standard.set(true, forKey: "ifolo.hasLaunchedBefore")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                Log.write("首次启动，自动展开面板")
                PanelController.shared.show()
            }
        }

        Log.write("启动完成：状态栏图标已就位，边缘触发已启动，快捷键已注册")
    }

    private func registerHotKeys() {
        // ⌥⌘N 呼出 / 收起面板
        if let toggle = HotKey(
            keyCode: KeyCode.n,
            modifiers: HotKeyModifier.option | HotKeyModifier.cmd,
            handler: {
                Log.write("快捷键：切换面板")
                PanelController.shared.toggle()
            }
        ) {
            hotKeys.append(toggle)
        } else {
            Log.write("⌥⌘N 注册失败（可能被占用）")
        }

        // ⌥⌘M 新建快速笔记
        if let newNote = HotKey(
            keyCode: KeyCode.m,
            modifiers: HotKeyModifier.option | HotKeyModifier.cmd,
            handler: {
                Log.write("快捷键：新建笔记")
                PanelController.shared.newQuickNote()
            }
        ) {
            hotKeys.append(newNote)
        } else {
            Log.write("⌥⌘M 注册失败（可能被占用）")
        }
    }

    /// 附属 App：关掉窗口不能把状态栏图标一起带走
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        Log.write("iFolo 退出")
        edgeTrigger?.stop()
    }

    private static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }
}
