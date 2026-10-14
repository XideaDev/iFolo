import AppKit

/// 屏幕边缘热区。
///
/// 实现选择：**全局鼠标移动监听 + 停留计时**，而不是在屏幕边缘放一个透明窗口。
///
/// 用透明窗口的做法要在边缘铺一条会接收鼠标事件的窄窗，它会吃掉那一带的点击
/// （用户拖窗口到边缘、点滚动条都会受影响）。全局监听没有任何窗口，也就不存在
/// 拦截问题。而且 `.mouseMoved` 的全局监听不需要任何系统权限。
final class EdgeTrigger {

    /// 触发区宽度（点）。3pt 是「能碰到但不误触」的平衡点。
    var zoneWidth: CGFloat = 3
    /// 指针需要在触发区停留多久才展开面板
    var dwell: TimeInterval = 0.12
    /// 只在主屏触发，还是所有屏
    var allScreens = false

    private var monitor: Any?
    private var dwellTimer: Timer?
    private var armed = true

    func start() {
        stop()
        // 全局监听不会收到发给本 App 的事件，所以面板内的移动天然被忽略
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            self?.evaluate()
        }
        // 本 App 自己的窗口上也要能触发（面板收起后指针还在边缘的情况）
        Log.write("边缘触发已启动 zoneWidth=\(zoneWidth) dwell=\(dwell)")
    }

    func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
        cancelDwell()
    }

    private func evaluate() {
        // 全局监听里 event.locationInWindow 不可靠，直接用鼠标的屏幕坐标
        let location = NSEvent.mouseLocation
        guard let screen = screen(containing: location) else { return }

        let visible = screen.visibleFrame
        let inZone = location.x >= visible.maxX - zoneWidth
            && location.y >= visible.minY
            && location.y <= visible.maxY

        if inZone {
            // 面板已经开着就不用再触发了
            guard armed, !PanelController.shared.isVisible else { return }
            startDwell()
        } else {
            cancelDwell()
            // 指针离开触发区后重新武装
            armed = true
        }
    }

    private func screen(containing point: NSPoint) -> NSScreen? {
        if allScreens {
            return NSScreen.screens.first { $0.frame.contains(point) }
        }
        return NSScreen.main
    }

    private func startDwell() {
        guard dwellTimer == nil else { return }
        let timer = Timer(timeInterval: dwell, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.dwellTimer = nil
            guard self.armed, !PanelController.shared.isVisible else { return }
            self.armed = false
            Log.write("边缘触发命中，展开面板")
            PanelController.shared.show()
        }
        // .common 模式，否则菜单或弹窗打开时 run loop 切模式会让计时器停摆
        RunLoop.main.add(timer, forMode: .common)
        dwellTimer = timer
    }

    private func cancelDwell() {
        dwellTimer?.invalidate()
        dwellTimer = nil
    }
}
