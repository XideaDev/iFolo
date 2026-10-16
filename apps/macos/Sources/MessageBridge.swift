import WebKit
import AppKit

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
            let activeValue: Any = activeId ?? NSNull()
            reply(id, ok: true, payload: [
                "notes": notes.map { [
                    "id": $0.id,
                    "title": $0.title,
                    "updatedAt": $0.updatedAt,
                    "snippet": $0.snippet,
                    "folderId": $0.folderId != nil ? ($0.folderId! as Any) : (NSNull() as Any),
                    "hasTodo": $0.hasTodo ?? false,
                    "isPinned": $0.isPinned ?? false,
                    "pinnedAt": $0.pinnedAt != nil ? ($0.pinnedAt! as Any) : (NSNull() as Any),
                ] },
                "folders": store.listFolders().map { [
                    "id": $0.id,
                    "name": $0.name,
                    "isSystem": $0.isSystem ?? false,
                ] },
                "activeId": activeValue,
                "content": content,
                "panelWidth": Double(PanelController.shared.currentWidth),
                "panelOpacity": UserDefaults.standard.object(forKey: "ifolo.panelOpacity") as? Double ?? 0.82,
                "statusBarIcon": UserDefaults.standard.string(forKey: "ifolo.statusBarIcon") ?? "notebook",
            ])
            // 面板以半透明覆盖在原生材质上，恢复用户配置或默认 0.82
            let savedOpacity = UserDefaults.standard.object(forKey: "ifolo.panelOpacity") as? Double ?? 0.82
            PanelController.shared.evaluate(
                "document.documentElement.style.setProperty('--panel-opacity', '\(savedOpacity)')"
            )

        case "list":
            let notes = Store.shared.listNotes()
            reply(id, ok: true, payload: notes.map { [
                "id": $0.id,
                "title": $0.title,
                "updatedAt": $0.updatedAt,
                "snippet": $0.snippet,
                "folderId": $0.folderId != nil ? ($0.folderId! as Any) : (NSNull() as Any),
                "hasTodo": $0.hasTodo ?? false,
                "isPinned": $0.isPinned ?? false,
                "pinnedAt": $0.pinnedAt != nil ? ($0.pinnedAt! as Any) : (NSNull() as Any),
            ] })

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
            reply(id, ok: true, payload: [
                "id": meta.id,
                "title": meta.title,
                "updatedAt": meta.updatedAt,
                "snippet": meta.snippet,
                "folderId": meta.folderId != nil ? (meta.folderId! as Any) : (NSNull() as Any),
                "hasTodo": meta.hasTodo ?? false,
                "isPinned": meta.isPinned ?? false,
                "pinnedAt": meta.pinnedAt != nil ? (meta.pinnedAt! as Any) : (NSNull() as Any),
            ])

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
                let clamped = min(1.0, max(0.3, value))
                UserDefaults.standard.set(clamped, forKey: "ifolo.panelOpacity")
                PanelController.shared.evaluate(
                    "document.documentElement.style.setProperty('--panel-opacity', '\(clamped)')"
                )
            }
            reply(id, ok: true, payload: NSNull())

        case "setWidth":
            if let value = params["width"] as? Double {
                PanelController.shared.setWidth(CGFloat(value))
            }
            reply(id, ok: true, payload: NSNull())

        case "search":
            let query = (params["query"] as? String) ?? ""
            SearchEngine.shared.search(query: query) { [weak self] results in
                DispatchQueue.main.async {
                    self?.reply(id, ok: true, payload: results.map { [
                        "id": $0.id,
                        "title": $0.title,
                        "snippet": $0.snippet,
                        "score": $0.score,
                        "matchedText": $0.matchedText,
                        "updatedAt": $0.updatedAt
                    ] })
                }
            }

        case "openFinder":
            NSWorkspace.shared.open(Store.shared.notesDirectoryURL)
            reply(id, ok: true, payload: NSNull())

        case "listFolders":
            let folders = Store.shared.listFolders()
            reply(id, ok: true, payload: folders.map { [
                "id": $0.id,
                "name": $0.name,
                "isSystem": $0.isSystem ?? false,
            ] })

        case "createFolder":
            guard let name = params["name"] as? String else { return reply(id, ok: false, payload: "缺少 name") }
            let folder = Store.shared.createFolder(name: name)
            reply(id, ok: true, payload: [
                "id": folder.id,
                "name": folder.name,
                "isSystem": folder.isSystem ?? false,
            ])

        case "renameFolder":
            guard let folderId = params["id"] as? String,
                  let name = params["name"] as? String else {
                return reply(id, ok: false, payload: "缺少参数")
            }
            Store.shared.renameFolder(id: folderId, name: name)
            reply(id, ok: true, payload: NSNull())

        case "deleteFolder":
            guard let folderId = params["id"] as? String else { return reply(id, ok: false, payload: "缺少 id") }
            Store.shared.deleteFolder(id: folderId)
            reply(id, ok: true, payload: NSNull())

        case "saveFoldersOrder":
            if let items = params["folders"] as? [[String: Any]] {
                let folders = items.compactMap { item -> FolderMeta? in
                    guard let fid = item["id"] as? String, let fname = item["name"] as? String else { return nil }
                    return FolderMeta(id: fid, name: fname, isSystem: item["isSystem"] as? Bool)
                }
                Store.shared.saveFoldersOrder(folders: folders)
            }
            reply(id, ok: true, payload: NSNull())

        case "setNoteFolder":
            guard let noteId = params["noteId"] as? String else { return reply(id, ok: false, payload: "缺少 noteId") }
            let folderId = params["folderId"] as? String
            Store.shared.setNoteFolder(noteId: noteId, folderId: folderId)
            reply(id, ok: true, payload: NSNull())

        case "setNotePinned":
            guard let noteId = params["noteId"] as? String,
                  let pinned = params["pinned"] as? Bool else {
                return reply(id, ok: false, payload: "缺少参数")
            }
            Store.shared.setNotePinned(noteId: noteId, pinned: pinned)
            reply(id, ok: true, payload: NSNull())
        case "setStatusBarIcon":
            if let iconName = params["name"] as? String {
                StatusItem.shared?.updateIcon(named: iconName)
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
        if let data = try? JSONSerialization.data(withJSONObject: [payload]),
           let text = String(data: data, encoding: .utf8) {
            // 剥掉外层 [...]，只取值
            let inner = text.dropFirst(1).dropLast(1)
            json = String(inner)
        } else {
            json = "null"
        }
        PanelController.shared.evaluate("window.__ifoloReceive && window.__ifoloReceive(\(id), \(ok), \(json))")
    }
}
