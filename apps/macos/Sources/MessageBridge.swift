import WebKit

/// Web 内容与原生之间的消息桥。
///
/// 协议：JS 侧 `window.webkit.messageHandlers.ifolo.postMessage({ id, method, params })`，
/// 原生侧回 `window.__ifoloReceive(id, ok, payload)`。
/// `closePanel` 没有 id，是单向通知。
final class MessageBridge: NSObject, WKScriptMessageHandler {

    static let shared = MessageBridge()

    private override init() { super.init() }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let method = body["method"] as? String else {
            Log.write("收到无法解析的消息：\(message.body)")
            return
        }

        let id = body["id"] as? Int
        let params = body["params"] as? [String: Any] ?? [:]

        switch method {
        case "closePanel":
            PanelController.shared.hide()

        case "boot":
            let store = Store.shared
            store.seedIfEmpty()
            let notes = store.listNotes()
            var activeId = store.activeId()
            if activeId == nil || !notes.contains(where: { $0.id == activeId }) {
                activeId = notes.first?.id
            }
            let content = activeId.map { store.read(id: $0) } ?? ""
            reply(id, ok: true, payload: [
                "notes": notes.map { ["id": $0.id, "title": $0.title, "updatedAt": $0.updatedAt] },
                "activeId": activeId as Any,
                "content": content,
            ])
            // 面板以半透明覆盖在原生材质上，让 Liquid Glass 透出来
            PanelController.shared.evaluate(
                "document.documentElement.style.setProperty('--panel-opacity', '0.82')"
            )

        case "load":
            guard let noteId = params["id"] as? String else { return reply(id, ok: false, payload: "缺少 id") }
            Store.shared.setActive(noteId)
            reply(id, ok: true, payload: Store.shared.read(id: noteId))

        case "save":
            guard let noteId = params["id"] as? String,
                  let markdown = params["markdown"] as? String else {
                return reply(id, ok: false, payload: "缺少参数")
            }
            Store.shared.write(id: noteId, markdown: markdown)
            Store.shared.setActive(noteId)
            reply(id, ok: true, payload: NSNull())

        case "create":
            let meta = Store.shared.create()
            reply(id, ok: true, payload: ["id": meta.id, "title": meta.title, "updatedAt": meta.updatedAt])

        case "remove":
            guard let noteId = params["id"] as? String else { return reply(id, ok: false, payload: "缺少 id") }
            Store.shared.remove(id: noteId)
            reply(id, ok: true, payload: NSNull())

        case "rename":
            guard let noteId = params["id"] as? String,
                  let title = params["title"] as? String else {
                return reply(id, ok: false, payload: "缺少参数")
            }
            Store.shared.rename(id: noteId, title: title)
            reply(id, ok: true, payload: NSNull())

        case "setOpacity":
            if let value = params["value"] as? Double {
                let clamped = min(1.0, max(0.4, value))
                UserDefaults.standard.set(clamped, forKey: "ifolo.panelOpacity")
                PanelController.shared.evaluate(
                    "document.documentElement.style.setProperty('--panel-opacity', '\(clamped)')"
                )
            }
            reply(id, ok: true, payload: NSNull())

        default:
            Log.write("未知方法：\(method)")
            reply(id, ok: false, payload: "未知方法 \(method)")
        }
    }

    /// 回包给 JS。payload 用 JSON 序列化后再注入，避免手拼字符串的转义问题。
    private func reply(_ id: Int?, ok: Bool, payload: Any) {
        guard let id else { return }
        let json: String
        if let data = try? JSONSerialization.data(withJSONObject: ["v": payload]),
           let text = String(data: data, encoding: .utf8) {
            // 剥掉外层 {"v": ...}，只取值
            let inner = text.dropFirst(5).dropLast(1)
            json = String(inner)
        } else {
            json = "null"
        }
        PanelController.shared.evaluate("window.__ifoloReceive && window.__ifoloReceive(\(id), \(ok), \(json))")
    }
}
