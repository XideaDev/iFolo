import Foundation

/// 笔记元信息
struct NoteMeta: Codable {
    let id: String
    var title: String
    var updatedAt: Double
}

/// 本地 Markdown 存储
///
/// 目录：~/Library/Application Support/iFolo/notes/<id>.md
///
/// Markdown 是唯一真相源 —— 不是「导出格式之一」。App 被卸载、编辑器崩了，
/// 笔记仍然是普通文本文件，随手就能读。
final class Store {
    static let shared = Store()

    private let root: URL
    private let notesDir: URL
    private let defaults = UserDefaults.standard
    private let activeKey = "ifolo.activeNoteId"

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        root = base.appendingPathComponent("iFolo", isDirectory: true)
        notesDir = root.appendingPathComponent("notes", isDirectory: true)
        try? FileManager.default.createDirectory(at: notesDir, withIntermediateDirectories: true)
        Log.write("Store 就绪：\(notesDir.path)")
    }

    // MARK: - 读取

    func listNotes() -> [NoteMeta] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: notesDir, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return []
        }
        var result: [NoteMeta] = []
        for file in files where file.pathExtension == "md" {
            let id = file.deletingPathExtension().lastPathComponent
            let content = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            result.append(NoteMeta(
                id: id,
                title: title(from: content),
                updatedAt: date?.timeIntervalSince1970 ?? 0
            ))
        }
        return result.sorted { $0.updatedAt > $1.updatedAt }
    }

    func read(id: String) -> String {
        let url = notesDir.appendingPathComponent("\(id).md")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }

    func activeId() -> String? {
        defaults.string(forKey: activeKey)
    }

    func setActive(_ id: String) {
        defaults.set(id, forKey: activeKey)
    }

    // MARK: - 写入

    @discardableResult
    func create() -> NoteMeta {
        let id = UUID().uuidString.lowercased()
        let meta = NoteMeta(id: id, title: "无标题", updatedAt: Date().timeIntervalSince1970)
        write(id: id, markdown: "")
        setActive(id)
        Log.write("新建笔记 \(id)")
        return meta
    }

    func write(id: String, markdown: String) {
        let url = notesDir.appendingPathComponent("\(id).md")
        // 原子写入：先写临时文件再替换，避免中途崩溃留下半截文件
        do {
            try markdown.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            Log.write("写入失败 \(id)：\(error)")
        }
    }

    func remove(id: String) {
        let url = notesDir.appendingPathComponent("\(id).md")
        // 移入废纸篓而不是直接删 —— 数据安全优先
        var resulting: NSURL?
        try? FileManager.default.trashItem(at: url, resultingItemURL: &resulting)
        Log.write("删除笔记 \(id)")
    }

    func rename(id: String, title: String) {
        let current = read(id: id)
        var lines = current.components(separatedBy: "\n")
        let heading = "# \(title)"
        if let first = lines.first, first.hasPrefix("#") {
            lines[0] = heading
        } else {
            lines.insert(heading, at: 0)
            lines.insert("", at: 1)
        }
        write(id: id, markdown: lines.joined(separator: "\n"))
    }

    /// 首次启动时种一条欢迎笔记，避免用户打开面板看到一片空白
    func seedIfEmpty() {
        guard listNotes().isEmpty else { return }
        let id = UUID().uuidString.lowercased()
        let welcome = """
        # 欢迎使用 iFolo

        把指针移到屏幕右边缘，或按 ⌥⌘N 呼出面板。

        - [ ] 试试输入 `/` 唤出命令
        - [inProgress] 悬停段落左侧能看到手柄
        - [ ] 选中文字试试富文本工具栏
        """
        write(id: id, markdown: welcome)
        setActive(id)
        Log.write("已种入欢迎笔记 \(id)")
    }

    // MARK: - 辅助

    /// 从 Markdown 里提取标题：优先第一个标题行，否则取首行前 40 字
    private func title(from markdown: String) -> String {
        let lines = markdown.components(separatedBy: "\n")
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("#") {
                let text = trimmed.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)
                if !text.isEmpty { return String(text.prefix(40)) }
            }
        }
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty {
                let cleaned = trimmed.hasPrefix("- [") ? String(trimmed.dropFirst(6)) : trimmed
                return cleaned.count > 40 ? String(cleaned.prefix(40)) + "…" : cleaned
            }
        }
        return "无标题"
    }
}
