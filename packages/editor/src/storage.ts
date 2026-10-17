/**
 * 存储桥 —— 编辑器与原生外壳之间的唯一通道
 *
 * 在 WKWebView 里走 postMessage；在浏览器里退化为 localStorage，
 * 这样 `pnpm dev` 不需要任何外壳就能完整调试编辑器。
 */

import { cleanTitle, stripMarkdown, hasTodoContent } from './markdown'

export interface NoteMeta {
  id: string
  title: string
  updatedAt: number
  snippet?: string
  tags?: string[]
  folderId?: string | null
  hasTodo?: boolean
  isPinned?: boolean
  pinnedAt?: number
}

export interface FolderItem {
  id: string
  name: string
  isSystem?: boolean
}

export interface BootPayload {
  notes: NoteMeta[]
  folders?: FolderItem[]
  activeId: string | null
  content: string
  panelWidth?: number
  panelOpacity?: number
  statusBarIcon?: string
  edgeHoverDelay?: number
}

export interface SearchResult {
  id: string
  title: string
  snippet: string
  score: number
  matchedText: string
  why?: string
  updatedAt: number
}

export interface Bridge {
  boot(): Promise<BootPayload>
  list(): Promise<NoteMeta[]>
  load(id: string): Promise<string>
  save(id: string, markdown: string): Promise<void>
  create(): Promise<NoteMeta>
  remove(id: string): Promise<void>
  rename(id: string, title: string): Promise<void>
  search(query: string): Promise<SearchResult[]>
  /** 面板不透明度（0.3–1.0），由外壳持久化 */
  setOpacity(value: number): Promise<void>
  /** 卡片不透明度（0.4–1.0），独立持久化 */
  setCardOpacity(value: number): Promise<void>
  /** 面板宽度（320–屏幕一半），由外壳持久化 */
  setWidth(width: number): Promise<void>
  /** 菜单栏图标（default | notebook | pen | document） */
  setStatusBarIcon(name: string): Promise<void>
  /** 请求收起面板 */
  closePanel(): void
  openFinder(): Promise<void>
  listFolders(): Promise<FolderItem[]>
  createFolder(name: string): Promise<FolderItem>
  renameFolder(id: string, name: string): Promise<void>
  deleteFolder(id: string): Promise<void>
  saveFoldersOrder(folders: FolderItem[]): Promise<void>
  setNoteFolder(noteId: string, folderId: string | null): Promise<void>
  setNotePinned(noteId: string, pinned: boolean): Promise<void>
  setEdgeHover(enabled: boolean): Promise<void>
  setAutoHide(enabled: boolean): Promise<void>
  setEdgeHoverDelay(delaySeconds: number): Promise<void>
  readonly isNative: boolean
}

/* ---------------------------------------------------------------------------
   原生桥
   ------------------------------------------------------------------------- */

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void }

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        ifolo?: { postMessage: (msg: unknown) => void }
      }
    }
    __ifoloReceive?: (id: number, ok: boolean, payload: unknown) => void
  }
}

function createNativeBridge(): Bridge | null {
  if (typeof window === 'undefined') return null
  const maybeHandler = window.webkit?.messageHandlers?.ifolo
  if (!maybeHandler) return null
  const handler = maybeHandler

  let seq = 0
  const pending = new Map<number, Pending>()

  window.__ifoloReceive = (id, ok, payload) => {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (ok) entry.resolve(payload)
    else entry.reject(new Error(String(payload)))
  }

  function call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++seq
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      handler.postMessage({ id, method, params })
      // 外壳无响应时的兜底，避免 UI 永久挂起
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`shell timeout: ${method}`))
      }, 8000)
    })
  }

  return {
    isNative: true,
    boot: () => call<BootPayload>('boot'),
    list: () => call<NoteMeta[]>('list'),
    load: (id) => call<string>('load', { id }),
    save: (id, markdown) => call<void>('save', { id, markdown }),
    create: () => call<NoteMeta>('create'),
    remove: (id) => call<void>('remove', { id }),
    rename: (id, title) => call<void>('rename', { id, title }),
    search: (query) => call<SearchResult[]>('search', { query }),
    setOpacity: (value) => call<void>('setOpacity', { value }),
    setCardOpacity: (value) => call<void>('setCardOpacity', { value }),
    setWidth: (width) => call<void>('setWidth', { width }),
    setStatusBarIcon: (name) => call<void>('setStatusBarIcon', { name }),
    openFinder: () => call<void>('openFinder'),
    closePanel: () => handler.postMessage({ method: 'closePanel', params: {} }),
    listFolders: () => call<FolderItem[]>('listFolders'),
    createFolder: (name) => call<FolderItem>('createFolder', { name }),
    renameFolder: (id, name) => call<void>('renameFolder', { id, name }),
    deleteFolder: (id) => call<void>('deleteFolder', { id }),
    saveFoldersOrder: (folders) => call<void>('saveFoldersOrder', { folders }),
    setNoteFolder: (noteId, folderId) => call<void>('setNoteFolder', { noteId, folderId }),
    setNotePinned: (noteId, pinned) => call<void>('setNotePinned', { noteId, pinned }),
    setEdgeHover: (enabled) => call<void>('setEdgeHover', { enabled }),
    setAutoHide: (enabled) => call<void>('setAutoHide', { enabled }),
    setEdgeHoverDelay: (delay) => call<void>('setEdgeHoverDelay', { delay }),
  }
}

/* ---------------------------------------------------------------------------
   浏览器兜底（仅供开发调试）
   ------------------------------------------------------------------------- */

const LS_NOTES = 'ifolo.notes'
const LS_ACTIVE = 'ifolo.active'
const LS_WIDTH = 'ifolo.panelWidth'
const LS_PINNED = 'ifolo.pinned_notes'
function readStore(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES) || '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, string>) {
  localStorage.setItem(LS_NOTES, JSON.stringify(store))
}

function titleOf(markdown: string): string {
  const firstLine = markdown.split('\n').find((l) => l.trim().length > 0) || ''
  const cleaned = cleanTitle(firstLine.replace(/^#{1,6}\s*/, ''))
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned
}

function snippetOf(markdown: string): string {
  const lines = markdown.split('\n')
  if (lines.length <= 1) return ''
  const second = lines.slice(1).find((l) => l.trim().length > 0) || ''
  const cleaned = stripMarkdown(second)
  return cleaned.length > 60 ? cleaned.slice(0, 60) + '…' : cleaned
}

/** 检测笔记内容是否与 MCP 语义相关（大小写不敏感） */
export function isMcpRelated(text: string): boolean {
  if (!text) return false
  return /(?:^|[^a-zA-Z0-9])mcp(?:[^a-zA-Z0-9]|$)|mcpserver|model\s+context\s+protocol/i.test(text)
}

/**
 * 从 Markdown 文本中提取标签：
 * 1. 优先提取 #标签#（双井号）或 #标签（单井号前缀，排除 Markdown 标题如 # 标题 与 C# 等）；
 * 2. 自动打标：若笔记内容与 MCP 相关，自动添加 "mcp" 标签。
 */
export function extractTags(text: string): string[] {
  if (!text) return []
  const pattern = /#([^#\s,]{1,16})#|#([^#\s,]{1,16})(?=[\s，。！？、（）()[\]{}'"]|$)/g
  const matches = text.match(pattern)
  const tags: string[] = []
  if (matches) {
    for (const m of matches) {
      const cleaned = m.replace(/^#+|#+$/g, '').trim()
      if (cleaned.length > 0 && cleaned.length <= 16) {
        tags.push(cleaned)
      }
    }
  }
  if (isMcpRelated(text)) {
    if (!tags.some((t) => t.toLowerCase() === 'mcp')) {
      tags.push('mcp')
    }
  }
  const unique = Array.from(new Set(tags))
  return unique.slice(0, 6)
}

function createBrowserBridge(): Bridge {
  return {
    isNative: false,
    async boot() {
      const store = readStore()
      let activeId = localStorage.getItem(LS_ACTIVE)
      if (!activeId || !(activeId in store)) {
        activeId = Object.keys(store)[0] ?? null
      }
      if (!activeId) {
        const id = `local-${Date.now()}`
        store[id] = '# 欢迎使用 iFolo\n\n把指针移到屏幕右边缘，或按 ⌥⌘N 呼出面板。\n\n- [ ] 试试输入 `/` 唤出命令\n- [inProgress] 悬停段落左侧能看到手柄\n'
        writeStore(store)
        activeId = id
        localStorage.setItem(LS_ACTIVE, id)
      }
      let noteFolders: Record<string, string> = {}
      let pinnedMap: Record<string, number> = {}
      try {
        noteFolders = JSON.parse(localStorage.getItem('ifolo.note_folders') || '{}')
      } catch {}
      try {
        pinnedMap = JSON.parse(localStorage.getItem(LS_PINNED) || '{}')
      } catch {}
      const notes: NoteMeta[] = Object.keys(store).map((id) => ({
        id,
        title: titleOf(store[id]) || '无标题',
        updatedAt: Date.now(),
        snippet: snippetOf(store[id]),
        tags: extractTags(store[id]),
        folderId: noteFolders[id] || null,
        hasTodo: hasTodoContent(store[id]),
        isPinned: Boolean(pinnedMap[id]),
        pinnedAt: pinnedMap[id],
      })).sort((a, b) => {
        const pA = Boolean(a.isPinned)
        const pB = Boolean(b.isPinned)
        if (pA !== pB) return pA ? -1 : 1
        if (pA && pB) return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)
        return b.updatedAt - a.updatedAt
      })
      const panelWidth = Number(localStorage.getItem(LS_WIDTH)) || 432
      const panelOpacity = Number(localStorage.getItem('ifolo.opacity')) || 0.82
      const cardOpacity = Number(localStorage.getItem('ifolo.card_opacity')) || 0.90
      const statusBarIcon = getStoredStatusBarIcon()
      const folders = await this.listFolders()
      return { notes, folders, activeId, content: store[activeId] ?? '', panelWidth, panelOpacity, cardOpacity, statusBarIcon }
    },
    async list() {
      const store = readStore()
      let pinnedMap: Record<string, number> = {}
      try {
        pinnedMap = JSON.parse(localStorage.getItem(LS_PINNED) || '{}')
      } catch {}
      return Object.keys(store).map((id) => ({
        id,
        title: titleOf(store[id]) || '无标题',
        updatedAt: Date.now(),
        snippet: snippetOf(store[id]),
        tags: extractTags(store[id]),
        hasTodo: hasTodoContent(store[id]),
        isPinned: Boolean(pinnedMap[id]),
        pinnedAt: pinnedMap[id],
      }))
    },
    async load(id) {
      return readStore()[id] ?? ''
    },
    async save(id, markdown) {
      const store = readStore()
      store[id] = markdown
      writeStore(store)
      localStorage.setItem(LS_ACTIVE, id)
    },
    async create() {
      const id = `local-${Date.now()}`
      const store = readStore()
      store[id] = ''
      writeStore(store)
      return { id, title: '无标题', updatedAt: Date.now(), snippet: '', hasTodo: false }
    },
    async remove(id) {
      const store = readStore()
      delete store[id]
      writeStore(store)
    },
    async rename(id, title) {
      const store = readStore()
      if (id in store) {
        store[id] = `# ${title}\n\n` + store[id].replace(/^#{1,6}\s.*\n+/, '')
        writeStore(store)
      }
    },
    async search(query) {
      const store = readStore()
      const lower = query.toLowerCase()
      const results: SearchResult[] = []

      // 提取核心词（按常见停用词/标点切分）
      const tokens = lower.split(/[\s,，.。!！?？、]+/).filter((t) => t.length > 0)

      for (const [id, content] of Object.entries(store)) {
        const title = titleOf(content)
        const lowerTitle = title.toLowerCase()
        const lowerContent = content.toLowerCase()

        // 判定相关性
        let matched = ''
        let score = 0
        let why = ''

        if (lower.includes('连接池') || lower.includes('数据库')) {
          if (lowerTitle.includes('数据库连接池') || lowerContent.includes('pgbouncer')) {
            score = 0.91
            why = '语义匹配「连接池」· 命中时间限定「昨天」'
            matched = 'pgbouncer 的 transaction 模式在长事务下会占用连接…'
          } else if (lowerTitle.includes('launch') || lowerContent.includes('keychain')) {
            score = 0.74
            why = '语义匹配「连接池」· 出现在待办中'
            matched = 'Gate refresh behind keychain unlock… 连接池超时改为 30s'
          } else if (lowerTitle.includes('weekly') || lowerContent.includes('sync')) {
            score = 0.58
            why = '弱相关 · 同属「数据库」主题'
            matched = 'look at the sync conflicts and the DB timeouts…'
          }
        } else {
          // 通用匹配
          const matchTitle = lowerTitle.includes(lower)
          const matchContent = lowerContent.includes(lower)
          const tokenMatches = tokens.filter((t) => lowerTitle.includes(t) || lowerContent.includes(t))

          if (matchTitle || matchContent || tokenMatches.length > 0) {
            const lines = content.split('\n').filter((l) => l.trim().length > 0)
            matched = lines.find((l) => l.toLowerCase().includes(lower)) || snippetOf(content)
            score = matchTitle ? 0.9 : (tokenMatches.length / Math.max(1, tokens.length)) * 0.8
            why = matchTitle ? `标题匹配「${query}」` : `全文匹配相关词「${tokenMatches.join(', ')}」`
          }
        }

        if (score > 0) {
          results.push({
            id,
            title,
            snippet: snippetOf(content),
            score,
            matchedText: matched,
            why,
            updatedAt: Date.now(),
          })
        }
      }
      return results.sort((a, b) => b.score - a.score)
    },
    async setOpacity(value) {
      localStorage.setItem('ifolo.opacity', String(value))
      document.documentElement.style.setProperty('--panel-opacity', String(value))
    },
    async setCardOpacity(value) {
      localStorage.setItem('ifolo.card_opacity', String(value))
      document.documentElement.style.setProperty('--card-opacity', String(value))
    },
    async setWidth(value) {
      localStorage.setItem(LS_WIDTH, String(value))
      document.documentElement.style.setProperty('--panel-width', `${value}px`)
    },
    async openFinder() {
      window.alert('本地存储目录：~/Library/Application Support/iFolo/notes')
    },
    closePanel() {
      /* 浏览器里没有面板可关 */
    },

    async listFolders() {
      try {
        const stored = localStorage.getItem('ifolo.folders')
        if (stored) {
          let list = JSON.parse(stored) as FolderItem[]
          list = list.filter((f) => f.id !== 'note')
          list.forEach((f) => {
            if (f.id === 'todo') f.name = '代办笔记'
          })
          localStorage.setItem('ifolo.folders', JSON.stringify(list))
          return list
        }
      } catch {}
      const initial: FolderItem[] = [
        { id: 'all', name: '全部', isSystem: true },
        { id: 'todo', name: '代办笔记', isSystem: true },
      ]
      localStorage.setItem('ifolo.folders', JSON.stringify(initial))
      return initial
    },
    async createFolder(name) {
      const folders = await this.listFolders()
      const id = `folder-${Date.now()}`
      const newFolder: FolderItem = { id, name, isSystem: false }
      folders.push(newFolder)
      localStorage.setItem('ifolo.folders', JSON.stringify(folders))
      return newFolder
    },
    async renameFolder(id, name) {
      const folders = await this.listFolders()
      const target = folders.find((f) => f.id === id)
      if (target) {
        target.name = name
        localStorage.setItem('ifolo.folders', JSON.stringify(folders))
      }
    },
    async deleteFolder(id) {
      let folders = await this.listFolders()
      folders = folders.filter((f) => f.id !== id)
      localStorage.setItem('ifolo.folders', JSON.stringify(folders))
      try {
        const noteFolders = JSON.parse(localStorage.getItem('ifolo.note_folders') || '{}')
        for (const [k, v] of Object.entries(noteFolders)) {
          if (v === id) delete noteFolders[k]
        }
        localStorage.setItem('ifolo.note_folders', JSON.stringify(noteFolders))
      } catch {}
    },
    async saveFoldersOrder(folders) {
      localStorage.setItem('ifolo.folders', JSON.stringify(folders))
    },
    async setNoteFolder(noteId, folderId) {
      try {
        const noteFolders = JSON.parse(localStorage.getItem('ifolo.note_folders') || '{}')
        if (folderId && folderId !== 'all') {
          noteFolders[noteId] = folderId
        } else {
          delete noteFolders[noteId]
        }
        localStorage.setItem('ifolo.note_folders', JSON.stringify(noteFolders))
      } catch {}
    },
    async setStatusBarIcon(name) {
      setStoredStatusBarIcon(name)
    },
    async setNotePinned(noteId, pinned) {
      try {
        const map: Record<string, number> = JSON.parse(localStorage.getItem(LS_PINNED) || '{}')
        if (pinned) {
          map[noteId] = Date.now()
        } else {
          delete map[noteId]
        }
        localStorage.setItem(LS_PINNED, JSON.stringify(map))
      } catch {}
    },
    async setEdgeHover(enabled) {
      localStorage.setItem('ifolo:edge_hover', String(enabled))
    },
    async setAutoHide(enabled) {
      localStorage.setItem('ifolo:auto_hide', String(enabled))
    },
    async setEdgeHoverDelay(delay) {
      setStoredEdgeHoverDelay(delay)
    },
  }
}

export function createBridge(): Bridge {
  return createNativeBridge() ?? createBrowserBridge()
}

// 默认组件显隐配置项
export const LS_DEFAULT_SEARCH = 'ifolo:default_search'
export const LS_DEFAULT_FILTER = 'ifolo:default_filter'
export const LS_DEFAULT_NAV = 'ifolo:default_nav'
export const LS_EDGE_HOVER_DELAY = 'ifolo:edge_hover_delay'
export const DEFAULT_EDGE_HOVER_DELAY = 0.15 // 默认 150ms

export function getStoredEdgeHoverDelay(): number {
  try {
    const val = parseFloat(localStorage.getItem(LS_EDGE_HOVER_DELAY) || '')
    if (isNaN(val) || val < 0.05 || val > 2.0) {
      return DEFAULT_EDGE_HOVER_DELAY
    }
    return val
  } catch {
    return DEFAULT_EDGE_HOVER_DELAY
  }
}

export function setStoredEdgeHoverDelay(delaySeconds: number): void {
  try {
    const clamped = Math.max(0.05, Math.min(2.0, delaySeconds))
    localStorage.setItem(LS_EDGE_HOVER_DELAY, String(clamped))
  } catch {}
}

export function isDefaultSearchEnabled(): boolean {
  try {
    return localStorage.getItem(LS_DEFAULT_SEARCH) !== 'false'
  } catch {
    return true
  }
}

export function setDefaultSearchEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_DEFAULT_SEARCH, String(enabled))
    localStorage.setItem('ifolo:search:list', String(enabled))
    localStorage.setItem('ifolo:search:editor', String(enabled))
  } catch {}
}

export function isDefaultFilterEnabled(): boolean {
  try {
    return localStorage.getItem(LS_DEFAULT_FILTER) === 'true'
  } catch {
    return false
  }
}

export function setDefaultFilterEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_DEFAULT_FILTER, String(enabled))
  } catch {}
}

export function isDefaultNavEnabled(): boolean {
  try {
    return localStorage.getItem(LS_DEFAULT_NAV) !== 'false'
  } catch {
    return true
  }
}

export function setDefaultNavEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_DEFAULT_NAV, String(enabled))
  } catch {}
}

export const LS_CARD_KIND_ICON = 'ifolo:card_kind_icon'

export function isCardKindIconEnabled(): boolean {
  try {
    return localStorage.getItem(LS_CARD_KIND_ICON) !== 'false'
  } catch {
    return true
  }
}

export function setCardKindIconEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_CARD_KIND_ICON, String(enabled))
  } catch {}
}

export function getStoredSearchState(key: 'list' | 'editor', defaultValue?: boolean): boolean {
  try {
    const defaultVal = defaultValue !== undefined ? defaultValue : isDefaultSearchEnabled()
    const val = localStorage.getItem(`ifolo:search:${key}`)
    return val === null ? defaultVal : val === 'true'
  } catch {
    return defaultValue !== undefined ? defaultValue : true
  }
}

export function setStoredSearchState(key: 'list' | 'editor', open: boolean): void {
  try {
    localStorage.setItem(`ifolo:search:${key}`, String(open))
  } catch {}
}

export const LS_STATUS_BAR_ICON = 'ifolo:statusBarIcon'

export function getStoredStatusBarIcon(): string {
  try {
    const val = localStorage.getItem(LS_STATUS_BAR_ICON)
    if (!val || val === 'default') return 'notebook'
    return val
  } catch {
    return 'notebook'
  }
}

export function setStoredStatusBarIcon(name: string): void {
  try {
    localStorage.setItem(LS_STATUS_BAR_ICON, name)
  } catch {}
}
