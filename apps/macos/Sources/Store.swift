import Foundation

/// 笔记元信息
struct NoteMeta: Codable {
    let id: String
    var title: String
    var updatedAt: Double
    var snippet: String
    var folderId: String?
    var hasTodo: Bool?
    var isPinned: Bool?
    var pinnedAt: Double?
}

/// 文件夹分类元信息
struct FolderMeta: Codable {
    let id: String
    var name: String
    var isSystem: Bool?
}

struct FolderStoreData: Codable {
    var folders: [FolderMeta]
    var noteFolders: [String: String] // [noteId: folderId]
    var pinnedNotes: [String: Double]? // [noteId: pinnedAt timestamp]
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
    private let assetsDir: URL
    private let foldersFile: URL
    private let defaults = UserDefaults.standard
    private let activeKey = "ifolo.activeNoteId"

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        root = base.appendingPathComponent("iFolo", isDirectory: true)
        notesDir = root.appendingPathComponent("notes", isDirectory: true)
        assetsDir = root.appendingPathComponent("assets", isDirectory: true)
        foldersFile = root.appendingPathComponent("folders.json")
        try? FileManager.default.createDirectory(at: notesDir, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: assetsDir, withIntermediateDirectories: true)
        Log.write("Store 就绪：\(notesDir.path)，附件目录：\(assetsDir.path)")
    }

    var notesDirectoryURL: URL { notesDir }

    // MARK: - 读取

    func listNotes() -> [NoteMeta] {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: notesDir, includingPropertiesForKeys: [.contentModificationDateKey]) else {
            return []
        }
        var result: [NoteMeta] = []
        let folderData = loadFolderData()
        let pinnedMap = folderData.pinnedNotes ?? [:]
        for file in files where file.pathExtension == "md" {
            let id = file.deletingPathExtension().lastPathComponent
            let content = (try? String(contentsOf: file, encoding: .utf8)) ?? ""
            let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            let noteFolder = folderData.noteFolders[id]
            let isPinned = pinnedMap[id] != nil
            let pinnedAt = pinnedMap[id]
            result.append(NoteMeta(
                id: id,
                title: title(from: content),
                updatedAt: date?.timeIntervalSince1970 ?? 0,
                snippet: extractSnippet(from: content),
                folderId: noteFolder,
                hasTodo: Self.detectHasTodo(content: content),
                isPinned: isPinned,
                pinnedAt: pinnedAt
            ))
        }
        return result.sorted {
            let p0 = $0.isPinned ?? false
            let p1 = $1.isPinned ?? false
            if p0 != p1 {
                return p0 && !p1
            }
            if p0 && p1 {
                return ($0.pinnedAt ?? 0) > ($1.pinnedAt ?? 0)
            }
            return $0.updatedAt > $1.updatedAt
        }
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
        let meta = NoteMeta(id: id, title: "无标题", updatedAt: Date().timeIntervalSince1970, snippet: "", folderId: nil, hasTodo: false, isPinned: false, pinnedAt: nil)
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
            SearchEngine.shared.indexNote(id: id, content: markdown)
        } catch {
            Log.write("写入失败 \(id)：\(error)")
        }
    }

    func remove(id: String) {
        let url = notesDir.appendingPathComponent("\(id).md")
        // 移入废纸篓而不是直接删 —— 数据安全优先
        var resulting: NSURL?
        try? FileManager.default.trashItem(at: url, resultingItemURL: &resulting)
        SearchEngine.shared.removeNote(id: id)
        var data = loadFolderData()
        if data.pinnedNotes?.removeValue(forKey: id) != nil {
            saveFolderData(data)
        }
        Log.write("删除笔记 \(id)")
    }

    func setNotePinned(noteId: String, pinned: Bool) {
        var data = loadFolderData()
        if data.pinnedNotes == nil {
            data.pinnedNotes = [:]
        }
        if pinned {
            data.pinnedNotes?[noteId] = Date().timeIntervalSince1970
        } else {
            data.pinnedNotes?.removeValue(forKey: noteId)
        }
        saveFolderData(data)
        Log.write("设置笔记置顶 \(noteId): \(pinned)")
    }

    // MARK: - 文件夹分类管理

    private var noteFoldersMap: [String: String] {
        loadFolderData().noteFolders
    }

    private func loadFolderData() -> FolderStoreData {
        if let data = try? Data(contentsOf: foldersFile),
           var decoded = try? JSONDecoder().decode(FolderStoreData.self, from: data) {
            // 移除已废弃的 "纯笔记" 系统分类，并将 "含待办" 统一修正为 "代办笔记"
            decoded.folders.removeAll(where: { $0.id == "note" })
            for i in 0..<decoded.folders.count {
                if decoded.folders[i].id == "todo" {
                    decoded.folders[i].name = "代办笔记"
                }
            }
            return decoded
        }
        let initialFolders: [FolderMeta] = [
            FolderMeta(id: "all", name: "全部", isSystem: true),
            FolderMeta(id: "todo", name: "代办笔记", isSystem: true),
        ]
        let initialData = FolderStoreData(folders: initialFolders, noteFolders: [:])
        saveFolderData(initialData)
        return initialData
    }

    private func saveFolderData(_ data: FolderStoreData) {
        if let encoded = try? JSONEncoder().encode(data) {
            try? encoded.write(to: foldersFile, options: .atomic)
        }
    }

    func listFolders() -> [FolderMeta] {
        return loadFolderData().folders
    }

    func saveFoldersOrder(folders: [FolderMeta]) {
        var data = loadFolderData()
        data.folders = folders
        saveFolderData(data)
        Log.write("已保存文件夹排序 (共 \(folders.count) 个分类)")
    }

    func createFolder(name: String) -> FolderMeta {
        var data = loadFolderData()
        let id = "folder-" + UUID().uuidString.lowercased().prefix(8)
        let folder = FolderMeta(id: id, name: name, isSystem: false)
        data.folders.append(folder)
        saveFolderData(data)
        Log.write("新建文件夹分类: \(name) (\(id))")
        return folder
    }

    func renameFolder(id: String, name: String) {
        var data = loadFolderData()
        if let idx = data.folders.firstIndex(where: { $0.id == id }) {
            data.folders[idx].name = name
            saveFolderData(data)
            Log.write("重命名文件夹分类: \(id) -> \(name)")
        }
    }

    func deleteFolder(id: String) {
        var data = loadFolderData()
        data.folders.removeAll(where: { $0.id == id })
        // 清理属于该分类的笔记关联
        data.noteFolders = data.noteFolders.filter { $0.value != id }
        saveFolderData(data)
        Log.write("删除文件夹分类: \(id)")
    }

    func setNoteFolder(noteId: String, folderId: String?) {
        var data = loadFolderData()
        if let folderId = folderId, !folderId.isEmpty, folderId != "all" {
            data.noteFolders[noteId] = folderId
        } else {
            data.noteFolders.removeValue(forKey: noteId)
        }
        saveFolderData(data)
        Log.write("设置笔记 \(noteId) 所属文件夹: \(folderId ?? "nil")")
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

    /// 明确判定整篇笔记内容是否「含有待办」：
    /// 1. 标准与扩展 Markdown 复选框/任务项：- [ ], - [x], - [inProgress], - [inReview], - [backlog], - [cancelled] 等；
    /// 2. HTML 任务或复选框标记；
    /// 3. 行首或标题显式待办标记（如【待办】、TODO:、待办事项、任务清单等）。
    static func detectHasTodo(content: String) -> Bool {
        if content.isEmpty { return false }
        // 1. Markdown 任务项正则
        let taskPattern = "(?mi)^\\s*(?:[-*+]|\\d+[.)])\\s*\\[(?:[\\sXx]|in-?progress|in_?progress|in-?review|backlog|cancelled|abandoned|done)?\\]"
        if content.range(of: taskPattern, options: .regularExpression) != nil {
            return true
        }
        // 2. HTML 任务项标记
        let htmlTaskPattern = "<input[^>]+type=[\"']checkbox[\"']|<[^>]+data-type=[\"']task_item[\"']"
        if content.range(of: htmlTaskPattern, options: .regularExpression) != nil {
            return true
        }
        // 3. 显式待办/任务清单标记
        let semanticTodoPattern = "(?mi)^\\s*(?:#{1,6}\\s*)?(?:【待办】|【任务】|\\[TODO\\]|\\[待办\\]|TODO:|待办事项|任务清单)"
        if content.range(of: semanticTodoPattern, options: .regularExpression) != nil {
            return true
        }
        return false
    }

    private func cleanText(_ text: String) -> String {
        var res = text
        // 1. 移除 HTML 标签与代码块围栏
        res = res.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        res = res.replacingOccurrences(of: "```[a-zA-Z0-9_-]*", with: "", options: .regularExpression)
        // 2. 移除引用符与转义反斜杠
        res = res.replacingOccurrences(of: "^(?:>\\s*)+", with: "", options: .regularExpression)
        res = res.replacingOccurrences(of: "(?:^|\\s)>\\s*", with: " ", options: .regularExpression)
        res = res.replacingOccurrences(of: "\\\\([>#*`_~\\[\\]\\-\\+])", with: "$1", options: .regularExpression)
        // 3. 移除列表项目符号 (- , * , + , 1. )
        res = res.replacingOccurrences(of: "^\\s*(?:[-*+]|\\d+\\.)\\s+", with: "", options: .regularExpression)
        // 4. 移除 Markdown 链接与图片符号 [text](url) -> text
        res = res.replacingOccurrences(of: "!?\\[([^\\]]*)\\]\\([^)]+\\)", with: "$1", options: .regularExpression)
        // 5. 移除粗体、斜体、删除线、行内代码符号 (**text**, *text*, ~~text~~, `text`)
        res = res.replacingOccurrences(of: "\\*\\*([^*]+)\\*\\*", with: "$1", options: .regularExpression)
        res = res.replacingOccurrences(of: "__([^_]+)__", with: "$1", options: .regularExpression)
        res = res.replacingOccurrences(of: "~~([^~]+)~~", with: "$1", options: .regularExpression)
        res = res.replacingOccurrences(of: "`([^`]+)`", with: "$1", options: .regularExpression)
        res = res.replacingOccurrences(of: "(?<!\\w)\\*([^*]+)\\*(?!\\w)", with: "$1", options: .regularExpression)
        res = res.replacingOccurrences(of: "(?<!\\w)_([^_]+)_(?!\\w)", with: "$1", options: .regularExpression)
        // 6. 移除剩余的孤立语法符号
        res = res.replacingOccurrences(of: "(?:\\*\\*|__|~~|`)+", with: "", options: .regularExpression)
        // 7. 过滤标签（保留 C#、#123）
        res = res.replacingOccurrences(of: "(?:^|\\s)#[\\w\\u4e00-\\u9fa5]+", with: "", options: .regularExpression)
        res = res.replacingOccurrences(of: "#+", with: "", options: .regularExpression)
        return res.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// 从 Markdown 里提取标题：优先第一个标题行，否则取首行前 40 字
    private func title(from markdown: String) -> String {
        let lines = markdown.components(separatedBy: "\n")
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("#") {
                let text = cleanText(String(trimmed.drop { $0 == "#" }))
                if !text.isEmpty { return String(text.prefix(40)) }
            }
        }
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if !trimmed.isEmpty {
                var cleaned = trimmed
                if cleaned.hasPrefix("- [") {
                    if let closeIdx = cleaned.firstIndex(of: "]") {
                        let afterClose = cleaned.index(after: closeIdx)
                        cleaned = String(cleaned[afterClose...]).trimmingCharacters(in: .whitespaces)
                    }
                } else if cleaned.hasPrefix("- ") || cleaned.hasPrefix("* ") {
                    cleaned = String(cleaned.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                }
                if !cleaned.isEmpty {
                    return cleaned.count > 40 ? String(cleaned.prefix(40)) + "…" : cleaned
                }
            }
        }
        return "无标题"
    }

    /// 提取正文预览摘要
    private func extractSnippet(from markdown: String) -> String {
        let lines = markdown.components(separatedBy: "\n")
        var titleLineIndex: Int?

        // 先定位标题所在行
        for (idx, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("#") {
                titleLineIndex = idx
                break
            }
        }
        if titleLineIndex == nil {
            for (idx, line) in lines.enumerated() {
                if !line.trimmingCharacters(in: .whitespaces).isEmpty {
                    titleLineIndex = idx
                    break
                }
            }
        }

        for (idx, line) in lines.enumerated() {
            if let tIdx = titleLineIndex, idx == tIdx { continue }
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }

            var cleaned = trimmed
            if cleaned.hasPrefix("- [") {
                if let closeIdx = cleaned.firstIndex(of: "]") {
                    let afterClose = cleaned.index(after: closeIdx)
                    cleaned = String(cleaned[afterClose...]).trimmingCharacters(in: .whitespaces)
                }
            } else if cleaned.hasPrefix("- ") || cleaned.hasPrefix("* ") {
                cleaned = String(cleaned.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            } else if cleaned.hasPrefix("#") {
                cleaned = cleaned.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)
            }
            cleaned = cleanText(cleaned)
            if !cleaned.isEmpty {
                return cleaned.count > 60 ? String(cleaned.prefix(60)) + "…" : cleaned
            }
        }
        return ""
    }
}
