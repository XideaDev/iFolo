import AppKit

/// 状态栏图标。
///
/// 用 `NSStatusItem` 而不是 SwiftUI 的 `MenuBarExtra` —— 后者无法区分图标的左键和右键，
/// 而菜单栏工具的惯例是「左键开面板，右键出菜单」。
final class StatusItem: NSObject {

    private let item: NSStatusItem
    private let menu = NSMenu()

    override init() {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        super.init()
        configure()
    }

    private func configure() {
        if let button = item.button {
            button.image = Self.icon()
            button.image?.isTemplate = true
            button.toolTip = "iFolo · 屏幕边缘笔记"
            button.target = self
            button.action = #selector(handleClick)
            // 左右键都要收到
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }
        buildMenu()
    }

    /// 图标：用 logo 的三块几何形状做单色模板，保持和 App 一致
    private static func icon() -> NSImage {
        let size = NSSize(width: 18, height: 18)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor.black.setFill()

            // 上：圆 + 胶囊
            NSBezierPath(ovalIn: NSRect(x: 1, y: 10.5, width: 6, height: 6)).fill()
            NSBezierPath(roundedRect: NSRect(x: 8, y: 11, width: 9, height: 5), xRadius: 2.5, yRadius: 2.5).fill()

            // 中：宽胶囊
            NSBezierPath(roundedRect: NSRect(x: 1, y: 6.5, width: 16, height: 4), xRadius: 2, yRadius: 2).fill()

            // 下：圆
            NSBezierPath(ovalIn: NSRect(x: 6, y: 1, width: 6, height: 6)).fill()

            _ = rect
            return true
        }
        image.isTemplate = true
        return image
    }

    private func buildMenu() {
        menu.removeAllItems()

        menu.addItem(withTitle: "显示 / 隐藏面板", action: #selector(togglePanel), keyEquivalent: "")
            .target = self

        menu.addItem(.separator())

        // 面板不透明度
        let opacityItem = NSMenuItem(title: "面板不透明度", action: nil, keyEquivalent: "")
        let submenu = NSMenu()
        for value in [1.0, 0.92, 0.82, 0.7, 0.58] {
            let title = "\(Int(value * 100))%"
            let entry = NSMenuItem(title: title, action: #selector(setOpacity(_:)), keyEquivalent: "")
            entry.target = self
            entry.representedObject = value
            entry.state = abs(currentOpacity() - value) < 0.01 ? .on : .off
            submenu.addItem(entry)
        }
        opacityItem.submenu = submenu
        menu.addItem(opacityItem)

        menu.addItem(.separator())

        menu.addItem(withTitle: "打开笔记文件夹", action: #selector(openNotesFolder), keyEquivalent: "")
            .target = self
        menu.addItem(withTitle: "打开日志", action: #selector(openLog), keyEquivalent: "")
            .target = self

        menu.addItem(.separator())

        menu.addItem(withTitle: "关于 iFolo", action: #selector(showAbout), keyEquivalent: "")
            .target = self
        menu.addItem(withTitle: "退出 iFolo", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    }

    // MARK: - 点击

    @objc private func handleClick() {
        let isRightClick = NSApp.currentEvent?.type == .rightMouseUp
            || NSApp.currentEvent?.modifierFlags.contains(.control) == true

        if isRightClick {
            // 只在这一个点击期间挂菜单，否则 statusItem.menu 常驻会劫持左键
            buildMenu()
            item.menu = menu
            item.button?.performClick(nil)
            item.menu = nil
            Log.write("右键：弹出菜单")
        } else {
            Log.write("左键：切换面板")
            PanelController.shared.toggle()
        }
    }

    // MARK: - 菜单动作

    @objc private func togglePanel() {
        PanelController.shared.toggle()
    }

    @objc private func setOpacity(_ sender: NSMenuItem) {
        guard let value = sender.representedObject as? Double else { return }
        UserDefaults.standard.set(value, forKey: "ifolo.panelOpacity")
        PanelController.shared.evaluate(
            "document.documentElement.style.setProperty('--panel-opacity', '\(value)')"
        )
        Log.write("面板不透明度设为 \(Int(value * 100))%")
    }

    private func currentOpacity() -> Double {
        UserDefaults.standard.object(forKey: "ifolo.panelOpacity") as? Double ?? 0.82
    }

    @objc private func openNotesFolder() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("iFolo/notes", isDirectory: true)
        NSWorkspace.shared.open(dir)
    }

    @objc private func openLog() {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs")
        NSWorkspace.shared.open(dir.appendingPathComponent("iFolo.log"))
    }

    @objc private func showAbout() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "iFolo"
        alert.informativeText = """
        屏幕边缘笔记 · 跨 Mac / Windows

        把指针移到屏幕右边缘，或按 ⌥⌘N 呼出面板。

        笔记以 Markdown 存在：
        ~/Library/Application Support/iFolo/notes/
        """
        alert.alertStyle = .informational
        alert.addButton(withTitle: "好")
        alert.runModal()
    }
}
