/**
 * 存储桥 —— 编辑器与原生外壳之间的唯一通道
 *
 * 在 WKWebView 里走 postMessage；在浏览器里退化为 localStorage，
 * 这样 `pnpm dev` 不需要任何外壳就能完整调试编辑器。
 */

export interface NoteMeta {
  id: string
  title: string
  updatedAt: number
}

export interface BootPayload {
  notes: NoteMeta[]
  activeId: string | null
  content: string
}

export interface Bridge {
  boot(): Promise<BootPayload>
  load(id: string): Promise<string>
  save(id: string, markdown: string): Promise<void>
  create(): Promise<NoteMeta>
  remove(id: string): Promise<void>
  rename(id: string, title: string): Promise<void>
  /** 面板不透明度（0.5–1），由外壳持久化 */
  setOpacity(value: number): Promise<void>
  /** 请求收起面板 */
  closePanel(): void
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
    load: (id) => call<string>('load', { id }),
    save: (id, markdown) => call<void>('save', { id, markdown }),
    create: () => call<NoteMeta>('create'),
    remove: (id) => call<void>('remove', { id }),
    rename: (id, title) => call<void>('rename', { id, title }),
    setOpacity: (value) => call<void>('setOpacity', { value }),
    closePanel: () => handler.postMessage({ method: 'closePanel', params: {} }),
  }
}

/* ---------------------------------------------------------------------------
   浏览器兜底（仅供开发调试）
   ------------------------------------------------------------------------- */

const LS_NOTES = 'ifolo.notes'
const LS_ACTIVE = 'ifolo.active'

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
  const cleaned = firstLine.replace(/^#{1,6}\s*/, '').trim()
  return cleaned.length > 40 ? cleaned.slice(0, 40) + '…' : cleaned
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
      const notes: NoteMeta[] = Object.keys(store).map((id) => ({
        id,
        title: titleOf(store[id]) || '无标题',
        updatedAt: Date.now(),
      }))
      return { notes, activeId, content: store[activeId] ?? '' }
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
      localStorage.setItem(LS_ACTIVE, id)
      return { id, title: '无标题', updatedAt: Date.now() }
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
    async setOpacity(value) {
      document.documentElement.style.setProperty('--panel-opacity', String(value))
    },
    closePanel() {
      /* 浏览器里没有面板可关 */
    },
  }
}

export function createBridge(): Bridge {
  return createNativeBridge() ?? createBrowserBridge()
}
