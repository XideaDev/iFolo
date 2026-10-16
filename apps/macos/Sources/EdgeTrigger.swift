import AppKit

/// 屏幕边缘热区。
///
/// 实现选择：**全局鼠标移动监听 + 停留计时**，而不是在屏幕边缘放一个透明窗口。
///
/// 性能优化关键：
/// 1. 绝不能在每次鼠标移动时查询 `NSScreen.screens`（WindowServer IPC 耗时 ~0.8ms，
///    在 120Hz 下单帧仅 8.3ms，移动时会导致主线程严重掉帧、菜单与界面卡顿）。
/// 2. 缓存所有屏幕的边缘触发矩形，仅在 `didChangeScreenParametersNotification` 时刷新。
/// 3. 全局移动事件中先做单浮点数粗筛（`location.x < minZoneX`），在 <10ns 内过滤 99.9% 的无关移动。
/// 4. 面板已显示或处于暂停状态时直接短路跳出。
final class EdgeTrigger {

    static let shared = EdgeTrigger()

    /// 触发区宽度（点）。3pt 是「能碰到但不误触」的平衡点。
    var zoneWidth: CGFloat = 3
    /// 指针需要在触发区停留多久才展开面板
    var dwell: TimeInterval = 0.12
    /// 只在主屏触发，还是所有屏
    var allScreens = false

    private var monitor: Any?
    private var dwellTimer: Timer?
    private var armed = true
    private var screenObserver: NSObjectProtocol?

    private(set) var isPaused = false

    struct TriggerZone {
        let screenFrame: NSRect
        let triggerRect: NSRect
    }

    private var cachedZones: [TriggerZone] = []
    private var minZoneX: CGFloat = .greatestFiniteMagnitude

    func start() {
        stop()

        updateScreenCache()

        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.updateScreenCache()
        }

        // 全局监听不会收到发给本 App 的事件，所以面板内的移动天然被忽略
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            self?.evaluate()
        }

        Log.write("边缘触发已启动 zoneWidth=\(zoneWidth) dwell=\(dwell) minZoneX=\(minZoneX)")
    }

    func stop() {
        if let monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
        if let screenObserver {
            NotificationCenter.default.removeObserver(screenObserver)
            self.screenObserver = nil
        }
        cancelDwell()
    }

    func pause() {
        isPaused = true
        cancelDwell()
    }

    func resume() {
        isPaused = false
        armed = true
    }

    private func updateScreenCache() {
        let screens = NSScreen.screens
        guard !screens.isEmpty else {
            cachedZones = []
            minZoneX = .greatestFiniteMagnitude
            return
        }

        let targetScreens: [NSScreen]
        if allScreens {
            targetScreens = screens
        } else if let primary = screens.first(where: { $0.frame.origin == .zero }) {
            targetScreens = [primary]
        } else {
            targetScreens = [screens[0]]
        }

        var zones: [TriggerZone] = []
        var lowestX: CGFloat = .greatestFiniteMagnitude

        for screen in targetScreens {
            let visible = screen.visibleFrame
            let trigger = NSRect(
                x: visible.maxX - zoneWidth,
                y: visible.minY,
                width: zoneWidth,
                height: visible.height
            )
            zones.append(TriggerZone(screenFrame: screen.frame, triggerRect: trigger))
            if trigger.minX < lowestX {
                lowestX = trigger.minX
            }
        }

        self.cachedZones = zones
        self.minZoneX = lowestX
        Log.write("边缘触发缓存更新: \(zones.count) 块屏幕, minZoneX=\(minZoneX)")
    }

    private func evaluate() {
        // 1. 状态短路：如果已暂停或面板处于可见状态，直接跳过
        guard !isPaused, !PanelController.shared.isVisible else {
            if dwellTimer != nil { cancelDwell() }
            return
        }

        let location = NSEvent.mouseLocation

        // 2. 粗筛（Pre-filter）：若鼠标 X 坐标在触发区左侧，单浮点比较直接退出（< 10ns）
        if location.x < minZoneX {
            if dwellTimer != nil { cancelDwell() }
            armed = true
            return
        }

        // 3. 精筛：从缓存的触发区检测，零 IPC、零内存分配
        var inZone = false
        for zone in cachedZones {
            if zone.triggerRect.contains(location) {
                inZone = true
                break
            }
        }

        if inZone {
            // 面板已经开着就不用再触发了
            guard armed else { return }
            startDwell()
        } else {
            cancelDwell()
            armed = true
        }
    }

    private func startDwell() {
        guard dwellTimer == nil else { return }
        let timer = Timer(timeInterval: dwell, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.dwellTimer = nil
            guard self.armed, !self.isPaused, !PanelController.shared.isVisible else { return }
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
