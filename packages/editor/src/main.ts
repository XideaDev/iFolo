/**
 * iFolo 编辑器入口
 *
 * 装配顺序有讲究：
 *   1. 先建编辑器（需要文档内容）
 *   2. 再建工具栏与各浮层（需要 view 实例）
 */

import './tokens.css'
import './app.css'

import { EditorState, Plugin, TextSelection, Command } from 'prosemirror-state'
import { EditorView, NodeView, Decoration, DecorationSet, ViewMutationRecord } from 'prosemirror-view'
import { Node as PMNode, Slice, Fragment } from 'prosemirror-model'
import { keymap } from 'prosemirror-keymap'
import { history, undo, redo } from 'prosemirror-history'
import { baseKeymap, toggleMark } from 'prosemirror-commands'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  smartQuotes,
  InputRule,
} from 'prosemirror-inputrules'

import { schema, nodes, marks, PLACEHOLDER } from './schema'
import { parseMarkdown, serializeDoc, emptyDoc, docTitle, cleanTitle, hasTodoContent, stripMarkdown } from './markdown'
import {
  createBridge,
  NoteMeta,
  FolderItem,
  extractTags,
  getStoredSearchState,
  isDefaultSearchEnabled,
  isDefaultNavEnabled,
  setStoredStatusBarIcon,
  setStoredEdgeHoverDelay,
} from './storage'
import { slashPlugin, slashKey, SLASH_COMMANDS } from './slash'
import { SlashMenu } from './ui/slashmenu'
import { Toolbar } from './ui/toolbar'
import { el, ICONS } from './ui/dom'
import { statusByKey, nextStatus, TASK_STATUSES } from './taskstatus'
import { NoteList, CommandItem } from './ui/notelist'
import { PanelResizer } from './ui/resizer'
import { EditorSearch, createDocSearchPlugin } from './ui/editorsearch'
import { SettingsView, initThemeListener } from './ui/settings'

/* ============================================================================
   任务项 NodeView —— 6 种状态胶囊
   ========================================================================= */

class TaskItemView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private check: HTMLButtonElement
  private statusBtn: HTMLButtonElement
  private current: string

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.current = node.attrs.status

    this.check = el('button', {
      class: 'task-item__check',
      type: 'button',
      contenteditable: 'false',
    }) as HTMLButtonElement

    this.statusBtn = el('button', {
      class: 'task-item__status',
      type: 'button',
      contenteditable: 'false',
    }) as HTMLButtonElement

    const body = el('div', { class: 'task-item__body' })

    this.dom = el('li', { class: 'task-item', 'data-status': this.current }, [
      this.check,
      body,
      this.statusBtn,
    ])
    this.contentDOM = body

    this.check.addEventListener('mousedown', (e) => {
      e.preventDefault()
      // 勾选框在「待办 ↔ 已完成」之间切换；其它状态先归到已完成
      const target = statusByKey(this.current).isComplete ? 'todo' : 'done'
      this.setStatus(target)
    })

    this.statusBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.setStatus(nextStatus(this.current))
    })

    this.renderStatus()
  }

  private renderStatus() {
    const s = statusByKey(this.current)
    this.statusBtn.textContent = s.label
    this.statusBtn.className = `task-item__status st-${s.key}`
    this.dom.setAttribute('data-status', s.key)
  }

  private setStatus(status: string) {
    const pos = this.getPos()
    if (pos == null) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { status }))
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    if (node.attrs.status !== this.current) {
      this.current = node.attrs.status
      this.renderStatus()
    }
    return true
  }

  stopEvent(event: Event): boolean {
    return event.target === this.check || event.target === this.statusBtn
  }

  ignoreMutation(m: ViewMutationRecord): boolean {
    return !this.contentDOM.contains(m.target)
  }
}

/* ============================================================================
   输入规则 —— 让 Markdown 语法在输入时就生效
   ========================================================================= */

function markRule(regexp: RegExp, markType: typeof marks.strong): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const text = match[1]
    if (!text) return null
    const tr = state.tr
    tr.insertText(text, start, end)
    tr.addMark(start, start + text.length, markType.create())
    tr.removeStoredMark(markType)
    return tr
  })
}

/** `- [ ] ` / `- [x] ` → 任务项 */
const taskRule = new InputRule(/^\s*[-*]\s\[([^\]]{0,16})\]\s$/, (state, match) => {
  const { $from } = state.selection
  if ($from.parent.type.name !== 'paragraph') return null
  const status = statusByKey(match[1]?.trim() === 'x' ? 'done' : 'todo').key
  const item = nodes.task_item.create({ status }, $from.parent)
  const list = nodes.task_list.create(null, item)
  return state.tr.replaceRangeWith($from.before(), $from.after(), list)
})

function buildInputRules() {
  const rules: InputRule[] = [
    ...smartQuotes,
    textblockTypeInputRule(/^(#{1,3})\s$/, nodes.heading, (m) => ({ level: m[1].length })),
    textblockTypeInputRule(/^```$/, nodes.code_block, () => ({ lang: '' })),
    wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)\.\s$/,
      nodes.ordered_list,
      (match) => ({ order: +match[1] }),
      (match, node) => node.childCount + node.attrs.order === +match[1],
    ),
    taskRule,
    markRule(/\*\*([^*]+)\*\*$/, marks.strong),
    markRule(/(?:^|[^*])\*([^*]+)\*$/, marks.em),
    markRule(/~~([^~]+)~~$/, marks.strikethrough),
    markRule(/`([^`]+)`$/, marks.code),
    new InputRule(/^---$/, (state, _m, start, end) => {
      const { $from } = state.selection
      if ($from.parent.type.name !== 'paragraph') return null
      const tr = state.tr.delete(start, end)
      tr.replaceRangeWith($from.before(), $from.after(), nodes.horizontal_rule.create())
      tr.insert(tr.selection.to, nodes.paragraph.create())
      return tr
    }),
  ]
  return inputRules({ rules })
}

/* ============================================================================
   占位符装饰
   ========================================================================= */

const placeholderPlugin = new Plugin({
  props: {
    decorations(state) {
      const doc = state.doc
      if (doc.childCount !== 1 || doc.firstChild?.type.name !== 'paragraph' || doc.firstChild.content.size > 0) {
        return null
      }
      const deco = Decoration.node(0, doc.firstChild.nodeSize, {
        class: 'is-empty',
        'data-placeholder': PLACEHOLDER,
      })
      return DecorationSet.create(doc, [deco])
    },
  },
})

/* ============================================================================
   应用装配
   ========================================================================= */

// 最早的一句标记：原生探针靠它判断脚本是否执行过
;(window as unknown as Record<string, unknown>).__ifoloBooted = false

/** 等 DOM 就绪。
 *  打包产物里 script 被提到 <head>（已加 defer），写这层守卫是为了双保险：
 *  万一构建链哪天忘了加 defer，也不至于白屏。 */
function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve()
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
  })
}

const bridge = createBridge()

let view: EditorView
let toolbar: Toolbar
let slashMenu: SlashMenu
let noteList: NoteList
let editorSearch: EditorSearch
let panelResizer: PanelResizer
let activeId: string | null = null
let notes: NoteMeta[] = []
let folders: FolderItem[] = []
let openTabIds: string[] = []
let saveTimer = 0
let lastSaved = ''
export type ViewMode = 'list' | 'editor' | 'settings'
let viewMode: ViewMode = 'list'
let previousViewMode: 'list' | 'editor' = 'list'
let settingsView: SettingsView

const topbarBackBtn = el('button', {
  class: 'ibtn topbar__back',
  type: 'button',
  title: '返回 (Esc)',
  html: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 3.2L5.2 8l4.8 4.8"/></svg>`,
}) as HTMLButtonElement
topbarBackBtn.style.display = 'none'

const topbarLogo = el('span', { class: 'topbar__logo', html: ICONS.logo })
const topbarTitle = el('span', { class: 'topbar__title' }, ['全部笔记'])
const topbarCount = el('span', { class: 'topbar__count' }, [''])
const topbarActions = el('span', { class: 'topbar__actions' })

const tabstrip = el('div', { class: 'tabstrip' })
const statusDot = el('span', { class: 'statusbar__dot' })
const statusText = el('span', {}, ['已保存'])
let editorScrollEl: HTMLElement
let editorCrumbEl: HTMLElement

// 顶栏右侧按钮
let searchBtnEl: HTMLButtonElement
let plusBtnEl: HTMLButtonElement

function updateEditorCrumb() {
  if (!editorCrumbEl) return
  const cur = notes.find((n) => n.id === activeId)
  const title = cur ? cleanTitle(cur.title) || '无标题' : '无标题'
  editorCrumbEl.replaceChildren()
  const listLink = el('span', { class: 'editor-crumb__item editor-crumb__item--link' }, ['全部笔记'])
  listLink.addEventListener('click', () => switchViewMode('list'))
  const dot1 = el('span', { class: 'dot' })
  const elements: (Node | string)[] = [listLink, dot1]
  if (cur?.folderId) {
    const f = folders.find((x) => x.id === cur.folderId)
    if (f) {
      const folderBadge = el('span', { class: 'editor-crumb__item', style: 'color: var(--accent); font-weight: 600;' }, [f.name])
      const dotF = el('span', { class: 'dot' })
      elements.push(folderBadge, dotF)
    }
  }
  const curTitle = el('span', { class: 'editor-crumb__item' }, [title])
  const dot2 = el('span', { class: 'dot' })
  const saveStatus = el('span', { class: 'editor-crumb__item' }, ['已自动保存'])
  elements.push(curTitle, dot2, saveStatus)
  editorCrumbEl.append(...elements)
}

function updateTopbar() {
  if (viewMode === 'settings') {
    topbarBackBtn.style.display = 'flex'
    topbarLogo.style.display = 'none'
    topbarTitle.style.display = 'inline'
    topbarTitle.textContent = '偏好设置'
    topbarTitle.title = ''
    topbarCount.style.display = 'none'
    topbarActions.replaceChildren()
  } else if (viewMode === 'list') {
    topbarBackBtn.style.display = 'none'
    topbarLogo.style.display = 'flex'
    topbarLogo.title = '全部笔记 (点击打开命令面板 ⌘K)'
    topbarTitle.style.display = 'none'
    topbarTitle.textContent = ''
    topbarCount.style.display = 'none'
    const showSearchBtn = !isDefaultSearchEnabled() || (noteList ? !noteList.isSearchVisible() : false)
    if (searchBtnEl) {
      searchBtnEl.title = '搜索笔记 (⌘F)'
      searchBtnEl.style.display = showSearchBtn ? 'inline-flex' : 'none'
      searchBtnEl.classList.toggle('ibtn--active', noteList ? noteList.isSearchVisible() : false)
    }
    topbarActions.replaceChildren(...(showSearchBtn ? [searchBtnEl] : []), plusBtnEl)
  } else {
    topbarBackBtn.style.display = 'none'
    topbarLogo.style.display = 'flex'
    topbarLogo.title = '返回全部笔记 (⌘L / Esc)'
    topbarTitle.style.display = 'none'
    topbarTitle.textContent = ''
    topbarCount.style.display = 'none'
    const showSearchBtn = !isDefaultSearchEnabled() || (editorSearch ? !editorSearch.isVisible() : false)
    if (searchBtnEl) {
      searchBtnEl.title = '在当前文档中查找 (⌘F)'
      searchBtnEl.style.display = showSearchBtn ? 'inline-flex' : 'none'
      searchBtnEl.classList.toggle('ibtn--active', editorSearch ? editorSearch.isVisible() : false)
    }
    topbarActions.replaceChildren(...(showSearchBtn ? [searchBtnEl] : []), plusBtnEl)
    updateEditorCrumb()
  }
}

function switchViewMode(mode: ViewMode) {
  if (mode !== 'settings') {
    previousViewMode = mode
  } else if (viewMode !== 'settings') {
    previousViewMode = viewMode === 'editor' ? 'editor' : 'list'
  }
  viewMode = mode

  if (mode === 'settings') {
    void flushSave()
    editorScrollEl.style.display = 'none'
    if (toolbar?.dom) toolbar.dom.style.display = 'none'
    if (editorSearch?.dom) editorSearch.dom.style.display = 'none'
    tabstrip.style.display = 'none'
    noteList.dom.style.display = 'none'
    if (settingsView?.dom) {
      settingsView.dom.style.display = 'flex'
      settingsView.refresh()
    }
  } else if (mode === 'list') {
    if (settingsView?.dom) settingsView.dom.style.display = 'none'
    void flushSave()
    editorScrollEl.style.display = 'none'
    if (toolbar?.dom) toolbar.dom.style.display = 'none'
    // 离开编辑器时，隐藏编辑器搜索栏的 DOM（不改变其在 storage 中的记忆状态）
    if (editorSearch?.dom) editorSearch.dom.style.display = 'none'
    // 方案B：首页主面板纯粹卡片流，绝不展示 Tab 栏
    tabstrip.style.display = 'none'
    noteList.dom.style.display = 'flex'
    // 恢复列表搜索栏的记忆状态，但默认不给输入框焦点（不抢焦点）
    const listSearchOpen = getStoredSearchState('list')
    noteList.setSearchVisible(listSearchOpen, undefined, false)
    searchBtnEl?.classList.toggle('ibtn--active', listSearchOpen)
    noteList.update(notes, activeId)
  } else {
    if (settingsView?.dom) settingsView.dom.style.display = 'none'
    noteList.dom.style.display = 'none'
    // 方案B：单篇编辑器页面展示 Tab 栏与富文本工具栏
    tabstrip.style.display = isDefaultNavEnabled() ? 'flex' : 'none'
    if (toolbar?.dom) toolbar.dom.style.display = 'flex'
    editorScrollEl.style.display = 'block'
    // 恢复编辑页搜索栏的记忆状态，但默认不给输入框焦点（不抢焦点）
    const editorSearchOpen = isDefaultSearchEnabled() || getStoredSearchState('editor')
    if (editorSearchOpen) {
      editorSearch?.show(undefined, false)
    } else {
      editorSearch?.hide()
    }
    searchBtnEl?.classList.toggle('ibtn--active', editorSearchOpen)
    view?.focus()
  }

  updateTopbar()
}

function toggleViewMode() {
  switchViewMode(viewMode === 'editor' ? 'list' : 'editor')
}

function getAppCommands(): CommandItem[] {
  return [
    {
      id: 'new_note',
      title: '新建笔记',
      keyHint: '⌘N',
      icon: ICONS.plus,
      perform: () => void newNote(),
    },
    {
      id: 'toggle_list',
      title: '查看全部笔记列表',
      keyHint: '⌘L',
      icon: ICONS.list,
      perform: () => {
        if (viewMode !== 'list') switchViewMode('list')
      },
    },
    {
      id: 'search_notes',
      title: '搜索全部笔记 (全局语义检索)',
      keyHint: '⌘F',
      icon: ICONS.search,
      perform: () => {
        if (viewMode !== 'list') switchViewMode('list')
        noteList.setSearchVisible(true, undefined, true)
      },
    },
    {
      id: 'toggle_filter',
      title: '切换筛选状态 (全部 / 待办 / 纯笔记)',
      keyHint: '',
      icon: ICONS.filter,
      perform: () => {
        if (viewMode !== 'list') switchViewMode('list')
        noteList.toggleFilter()
      },
    },
    {
      id: 'toggle_theme',
      title: '切换深色 / 浅色模式',
      keyHint: '',
      icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 2v12a6 6 0 0 0 0-12z" fill="currentColor"/></svg>`,
      perform: () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
        document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark')
      },
    },
    {
      id: 'settings',
      title: '偏好设置… (/settings)',
      keyHint: '⌘,',
      icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/></svg>`,
      perform: () => {
        switchViewMode('settings')
      },
    },
    {
      id: 'close_panel',
      title: '收起 iFolo 面板',
      keyHint: 'Esc',
      icon: ICONS.close,
      perform: () => void bridge.closePanel(),
    },
  ]
}

function buildShell() {
  const root = document.getElementById('app')!

  searchBtnEl = iconButton(ICONS.search, '搜索 (⌘F)', () => {
    if (viewMode === 'list') {
      noteList.toggleSearch(undefined, true)
    } else {
      editorSearch.toggle(undefined, true)
    }
  })


  plusBtnEl = iconButton(ICONS.plus, '新建笔记 (⌘N)', () => void newNote())

  const topbar = el('div', { class: 'topbar' }, [
    topbarBackBtn,
    topbarLogo,
    topbarTitle,
    topbarCount,
    topbarActions,
  ])

  topbarBackBtn.addEventListener('click', () => {
    switchViewMode(previousViewMode)
  })

  topbarLogo.addEventListener('click', () => {
    if (viewMode === 'list') {
      noteList.toggleCommandMode()
    } else {
      switchViewMode('list')
    }
  })

  topbarTitle.addEventListener('click', () => {
    if (viewMode === 'list') {
      noteList.toggleSearch(undefined, true)
    } else {
      switchViewMode('list')
    }
  })

  topbarCount.addEventListener('click', () => {
    if (viewMode === 'list') {
      noteList.setSearchVisible(false)
    } else {
      switchViewMode('list')
    }
  })

  // Tab 栏鼠标滚轮横向滚动联动
  tabstrip.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        tabstrip.scrollLeft += e.deltaY
        e.preventDefault()
      }
    },
    { passive: false },
  )

  editorScrollEl = el('div', { class: 'editor-scroll' })
  const editorWrap = el('div', { class: 'editor-wrap' })
  editorCrumbEl = el('div', { class: 'editor-crumb' })
  editorWrap.append(editorCrumbEl)
  editorScrollEl.append(editorWrap)

  settingsView = new SettingsView({
    bridge,
    onBack: () => switchViewMode(previousViewMode),
    getNotes: () => notes,
    onToggleDefaultSearch: (enabled) => {
      noteList.setSearchVisible(enabled)
      if (viewMode === 'list') {
        searchBtnEl?.classList.toggle('ibtn--active', enabled)
      } else if (viewMode === 'editor') {
        if (enabled) editorSearch?.show(undefined, false)
        else editorSearch?.hide()
        searchBtnEl?.classList.toggle('ibtn--active', enabled)
      }
      updateTopbar()
    },
    onToggleDefaultFilter: (enabled) => {
      noteList.setFilterVisible(enabled)
    },
    onToggleDefaultNav: (enabled) => {
      if (viewMode === 'editor') {
        tabstrip.style.display = enabled ? 'flex' : 'none'
      }
    },
    onToggleCardKindIcon: (enabled) => {
      noteList.setCardKindIconVisible(enabled)
    },
  })
  noteList = new NoteList({
    bridge,
    folders,
    onFoldersChange: (newFolders) => {
      folders = newFolders
    },
    onNoteFolderChange: (noteId, folderId) => {
      const n = notes.find((x) => x.id === noteId)
      if (n) n.folderId = folderId
    },
    onNotePinnedChange: (noteId, pinned) => {
      const n = notes.find((x) => x.id === noteId)
      if (n) {
        n.isPinned = pinned
        n.pinnedAt = pinned ? Date.now() : undefined
      }
    },
    onSelect: (id) => void selectNoteFromList(id),
    onDelete: (id) => void deleteNote(id),
    onRename: (id, title) => void renameNote(id, title),
    onCreate: () => void newNote(),
    onClose: () => {
      if (viewMode === 'list') {
        noteList.setSearchVisible(false)
      } else {
        switchViewMode('list')
      }
    },
    onSearch: (q) => bridge.search(q),
    onSearchToggle: (visible) => {
      if (viewMode === 'list') {
        searchBtnEl?.classList.toggle('ibtn--active', visible)
      }
    },
    getCommands: getAppCommands,
  })
  noteList.dom.style.display = 'none'

  panelResizer = new PanelResizer(
    (w) => void bridge.setWidth(w),
    (w) => void bridge.setWidth(w),
  )


  const statusbar = el('div', { class: 'statusbar' }, [
    el('span', {}, ['⌥⌘N 呼出 · ⌘K 命令面板 · ⌘L 笔记列表 · / 命令']),
    el('span', { class: 'statusbar__saved' }, [statusDot, statusText]),
  ])

  // 用 replaceChildren 而不是 append —— 否则 index.html 里的启动占位符会留在 DOM 里
  root.replaceChildren(panelResizer.dom, topbar, tabstrip, editorScrollEl, noteList.dom, settingsView.dom, statusbar)
  return { editorWrap, editorScroll: editorScrollEl }
}

function closeTab(id: string) {
  openTabIds = openTabIds.filter((t) => t !== id)
  if (activeId === id) {
    if (openTabIds.length > 0) {
      void openNote(openTabIds[openTabIds.length - 1])
    } else {
      switchViewMode('list')
    }
  } else {
    renderTabs()
  }
}

async function selectNoteFromList(id: string) {
  if (!openTabIds.includes(id)) {
    openTabIds.push(id)
  }
  await openNote(id)
  switchViewMode('editor')
}

async function deleteNote(id: string) {
  try {
    await bridge.remove(id)
    notes = notes.filter((n) => n.id !== id)
    if (activeId === id) {
      const next = notes[0]
      if (next) {
        await openNote(next.id)
      } else {
        await newNote()
      }
    }
    renderTabs()
    noteList.update(notes, activeId)
  } catch (err) {
    console.error('删除笔记失败', err)
  }
}

async function renameNote(id: string, newTitle: string) {
  try {
    // 1. 消除防抖保存竞态，避免待保存的旧内容覆盖新标题
    window.clearTimeout(saveTimer)

    if (activeId === id) {
      // 无损更新：通过 ProseMirror 事务更新标题节点，完整保留 Undo/Redo 历史
      const tr = view.state.tr
      const firstNode = view.state.doc.firstChild
      const titleNode = schema.nodes.heading.create(
        { level: 1 },
        newTitle.trim() ? schema.text(newTitle.trim()) : undefined,
      )
      if (firstNode && firstNode.type.name === 'heading') {
        tr.replaceWith(0, firstNode.nodeSize, titleNode)
      } else {
        tr.insert(0, titleNode)
      }
      view.dispatch(tr)
      const currentMarkdown = serializeDoc(view.state.doc)
      lastSaved = currentMarkdown
      await bridge.save(id, currentMarkdown)
    } else {
      await bridge.rename(id, newTitle)
    }

    const item = notes.find((n) => n.id === id)
    if (item) {
      item.title = newTitle
      item.updatedAt = Date.now()
    }
    renderTabs()
    noteList.update(notes, activeId)
    updateTopbar()
    updateEditorCrumb()
  } catch (err) {
    console.error('重命名笔记失败', err)
  }
}

function iconButton(html: string, title: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const btn = el('button', { class: `ibtn ${extra}`.trim(), type: 'button', title, html }) as HTMLButtonElement
  btn.addEventListener('click', onClick)
  return btn
}

function setSavedState(saved: boolean) {
  statusText.textContent = saved ? '已保存' : '保存中…'
  statusDot.classList.toggle('statusbar__dot--saving', !saved)
}

function scheduleSave() {
  window.clearTimeout(saveTimer)
  setSavedState(false)
  saveTimer = window.setTimeout(() => {
    void flushSave()
  }, 400)
}

async function flushSave() {
  if (!activeId) return
  const markdown = serializeDoc(view.state.doc)
  if (markdown === lastSaved) {
    setSavedState(true)
    return
  }
  lastSaved = markdown
  try {
    await bridge.save(activeId, markdown)
    const meta = notes.find((n) => n.id === activeId)
    if (meta) {
      meta.title = docTitle(view.state.doc) || '无标题'
      meta.updatedAt = Date.now()
      const lines = markdown.split('\n').filter((l) => l.trim().length > 0)
      if (lines.length > 1) {
        const rawSnippet = lines.slice(1).join(' ')
        meta.snippet = stripMarkdown(rawSnippet).slice(0, 80)
      }
      meta.tags = extractTags(markdown)
      meta.hasTodo = hasTodoContent(markdown)
      renderTabs()
      noteList?.update(notes, activeId)
      updateTopbar()
      updateEditorCrumb()
    }
    setSavedState(true)
  } catch {
    statusText.textContent = '保存失败'
  }
}

function renderTabs() {
  tabstrip.replaceChildren()
  if (openTabIds.length === 0 && notes.length > 0) {
    const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
    openTabIds = [sorted[0].id]
  }
  if (activeId && !openTabIds.includes(activeId)) {
    openTabIds.push(activeId)
  }
  openTabIds = openTabIds.filter((id) => notes.some((n) => n.id === id))

  let activeTabEl: HTMLElement | null = null

  for (const id of openTabIds) {
    const note = notes.find((n) => n.id === id)
    if (!note) continue
    const active = note.id === activeId

    const closeBtn = el('i', {
      class: 'tabstrip__close',
      title: '关闭标签 (从快捷栏移出)',
    }, ['×'])

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      closeTab(note.id)
    })

    const titleText = cleanTitle(note.title) || '无标题'
    const titleSpan = el('span', { class: 'tabstrip__tab-title' }, [titleText])

    const tab = el('button', {
      class: `tabstrip__tab${active ? ' tabstrip__tab--active' : ''}`,
      type: 'button',
      title: titleText,
    }, [
      titleSpan,
      closeBtn,
    ])

    if (active) {
      activeTabEl = tab
    }

    tab.addEventListener('click', () => {
      void openNote(note.id)
      if (viewMode !== 'editor') switchViewMode('editor')
    })
    tabstrip.append(tab)
  }

  const add = el('button', {
    class: 'tabstrip__tab tabstrip__tab--add',
    type: 'button',
    title: '新建笔记 ⌘N',
  }, ['＋'])
  add.addEventListener('click', () => void newNote())
  tabstrip.append(add)

  if (activeTabEl) {
    requestAnimationFrame(() => {
      activeTabEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
  }

  updateTopbar()
}

function createView(content: string, container: HTMLElement): EditorView {
  const doc = content.trim() ? parseMarkdown(content) : emptyDoc()

  const state = EditorState.create({
    doc,
    schema,
    plugins: [
      buildInputRules(),
      keymap({
        'Mod-b': toggleMark(marks.strong),
        'Mod-i': toggleMark(marks.em),
        'Mod-u': toggleMark(marks.underline),
        'Mod-e': toggleMark(marks.code),
        'Mod-z': undo,
        'Mod-Shift-z': redo,
        'Mod-Enter': setParagraphBelow,
      }),
      keymap(baseKeymap),
      slashPlugin(),
      placeholderPlugin,
      createDocSearchPlugin(),
      dropCursor(),
      gapCursor(),
      history(),
    ],
  })

  const v = new EditorView(container, {
    state,
    attributes: { spellcheck: 'false' },
    nodeViews: {
      task_item: (node, viewRef, getPos) => new TaskItemView(node, viewRef, getPos),
    },
    clipboardTextParser(text, _context, _view) {
      if (!text || !text.trim()) return Slice.empty
      const hasMarkdown = /(^#{1,6}\s|^\s*[-*+]\s|^\s*>\s|^\s*```|\*\*|~~|\[.*?\]\(.*?\)|<[a-z]+|\n\n)/m.test(text)
      if (hasMarkdown || text.length > 150 || text.includes('\n')) {
        try {
          const doc = parseMarkdown(text)
          return new Slice(doc.content, 0, 0)
        } catch (e) {
          console.warn('Markdown parse on paste fallback:', e)
        }
      }
      const lines = text.split(/\r?\n/)
      if (lines.length === 1) {
        return new Slice(Fragment.from(schema.text(text)), 0, 0)
      }
      const paraNodes = lines.filter((l) => l.trim().length > 0).map((l) => schema.nodes.paragraph.create(null, schema.text(l)))
      return new Slice(Fragment.from(paraNodes), 0, 0)
    },
    handlePaste(view, event) {
      const text = event.clipboardData?.getData('text/plain')
      if (text && text.trim()) {
        const hasMarkdown = /(^#{1,6}\s|^\s*[-*+]\s|^\s*>\s|^\s*```|\*\*|~~|\[.*?\]\(.*?\)|<[a-z]+|\n\n)/m.test(text)
        if (hasMarkdown || text.length > 150 || text.includes('\n')) {
          try {
            const doc = parseMarkdown(text)
            const pasteSlice = new Slice(doc.content, 0, 0)
            const tr = view.state.tr.replaceSelection(pasteSlice)
            view.dispatch(tr.scrollIntoView())
            return true
          } catch (e) {
            console.warn('handlePaste parse error:', e)
          }
        }
      }
      return false
    },
    dispatchTransaction(tr) {
      const next = v.state.apply(tr)
      v.updateState(next)
      toolbar?.update(next)
      slashMenu?.update(next)
      if (tr.docChanged) scheduleSave()
    },
  })

  return v
}

const setParagraphBelow: Command = (state, dispatch, viewRef) => {
  const para = nodes.paragraph.create()
  const tr = state.tr.insert(state.selection.to, para)
  tr.setSelection(TextSelection.near(tr.doc.resolve(state.selection.to + 1)))
  if (dispatch) dispatch(tr)
  viewRef?.focus()
  return true
}
let openingNoteId: string | null = null


async function openNote(id: string) {
  if (id === activeId) return
  openingNoteId = id
  await flushSave()
  if (openingNoteId !== id) return
  if (!openTabIds.includes(id)) {
    openTabIds.push(id)
  }
  const content = await bridge.load(id)
  if (openingNoteId !== id) return
  activeId = id
  const doc = content.trim() ? parseMarkdown(content) : emptyDoc()
  view.updateState(
    EditorState.create({
      doc,
      schema,
      plugins: view.state.plugins,
    }),
  )
  lastSaved = content
  toolbar.update(view.state)
  editorSearch?.refresh()
  renderTabs()
  noteList?.update(notes, activeId)
  updateTopbar()
  updateEditorCrumb()
  setSavedState(true)
}

async function newNote() {
  await flushSave()
  const meta = await bridge.create()
  notes.unshift(meta)
  activeId = meta.id
  if (!openTabIds.includes(meta.id)) {
    openTabIds.push(meta.id)
  }
  lastSaved = ''
  view.updateState(
    EditorState.create({ doc: emptyDoc(), schema, plugins: view.state.plugins }),
  )
  toolbar.update(view.state)
  const editorSearchOpen = getStoredSearchState('editor', true)
  if (editorSearchOpen) {
    editorSearch?.show('', false)
  } else {
    editorSearch?.hide()
  }
  renderTabs()
  noteList?.update(notes, activeId)
  updateTopbar()
  updateEditorCrumb()
  if (viewMode !== 'editor') switchViewMode('editor')
  view.focus()
}

/* ============================================================================
   启动
   ========================================================================= */

async function boot() {
  await domReady()
  const { editorWrap } = buildShell()

  // 先用空文档建 view，拿到实例后再灌入真实内容
  view = createView('', editorWrap)
  toolbar = new Toolbar(view, {
    getNote: () => notes.find((n) => n.id === activeId) ?? null,
    getFolders: () => folders,
    onSetFolder: async (folderId) => {
      if (!activeId) return
      await bridge.setNoteFolder(activeId, folderId)
      const cur = notes.find((x) => x.id === activeId)
      if (cur) cur.folderId = folderId
      updateEditorCrumb()
      noteList.update(notes, activeId, folders)
    },
  })
  editorSearch = new EditorSearch({
    view,
    onGlobalSearch: (q) => {
      if (editorSearch.dom) editorSearch.dom.style.display = 'none'
      switchViewMode('list')
      noteList.setSearchVisible(true, q, true)
    },
    onVisibilityChange: (visible) => {
      if (viewMode === 'editor') {
        searchBtnEl?.classList.toggle('ibtn--active', visible)
        updateTopbar()
      }
    },
    getCommands: getAppCommands,
  })

  const rootEl = document.getElementById('app')!
  rootEl.insertBefore(editorSearch.dom, tabstrip)
  rootEl.insertBefore(toolbar.dom, editorScrollEl)

  slashMenu = new SlashMenu(view)

  const payload = await bridge.boot()
  notes = payload.notes
  folders = payload.folders || []
  activeId = payload.activeId
  lastSaved = payload.content

  if (payload.panelWidth) {
    document.documentElement.style.setProperty('--panel-width', `${payload.panelWidth}px`)
  }
  if (payload.panelOpacity !== undefined) {
    document.documentElement.style.setProperty('--panel-opacity', String(payload.panelOpacity))
  }
  const cardOp = Number(localStorage.getItem('ifolo.card_opacity')) || 0.90
  document.documentElement.style.setProperty('--card-opacity', String(cardOp))
  if (payload.statusBarIcon) {
    setStoredStatusBarIcon(payload.statusBarIcon)
  }
  if (payload.edgeHoverDelay !== undefined) {
    setStoredEdgeHoverDelay(payload.edgeHoverDelay)
  }

  if (activeId) {
    const doc = payload.content.trim() ? parseMarkdown(payload.content) : emptyDoc()
    view.updateState(EditorState.create({ doc, schema, plugins: view.state.plugins }))
  }

  toolbar.update(view.state)
  renderTabs()
  noteList.update(notes, activeId, folders)
  initThemeListener()
  setSavedState(true)
  switchViewMode(viewMode)

  // 键盘快捷键监听
  window.addEventListener('keydown', (e) => {
    // ⌘, / Ctrl-, 切换偏好设置
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault()
      if (viewMode === 'settings') {
        switchViewMode(previousViewMode)
      } else {
        switchViewMode('settings')
      }
      return
    }
    // ⌘K / Ctrl-K 唤起命令面板 (原型图 04)
    // ⌘K / Ctrl-K 唤起命令面板
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (viewMode === 'list') {
        noteList.toggleCommandMode()
      } else {
        editorSearch.toggleCommandMode()
      }
      return
    }
    // ⌘L / Ctrl-L 切换笔记列表
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      toggleViewMode()
      return
    }
    // ⌘F / Ctrl-F 唤起笔记搜索
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      e.stopPropagation()
      if (viewMode === 'list') {
        noteList.setSearchVisible(true, undefined, true)
      } else {
        const { from, to } = view.state.selection
        const sel = from !== to && to - from < 50 ? view.state.doc.textBetween(from, to, ' ') : ''
        editorSearch.show(sel.trim() || undefined, true)
      }
      return
    }
    // Esc: 优先收起命令面板；偏好设置返回；其次收起编辑器内搜索；再次收起列表搜索；再次编辑器模式返回列表；最后收起边缘面板
    if (e.key === 'Escape') {
      // 1. 命令模式优先收起
      if (viewMode === 'list' && noteList.isCommandMode()) {
        e.preventDefault()
        e.stopPropagation()
        noteList.closeCommandMode()
        return
      }
      if (viewMode === 'editor' && editorSearch.isCommandMode()) {
        e.preventDefault()
        e.stopPropagation()
        editorSearch.closeCommandMode()
        view.focus()
        return
      }

      // 2. 偏好设置模式返回上一页
      if (viewMode === 'settings') {
        e.preventDefault()
        e.stopPropagation()
        switchViewMode(previousViewMode)
        return
      }

      // 4. 斜杠命令菜单未激活时，才允许返回上一页或收起面板
      if (!slashKey.getState(view.state)?.active) {
        if (viewMode === 'list') {
          if (noteList.isSearchVisible()) {
            e.preventDefault()
            e.stopPropagation()
            noteList.setSearchVisible(false)
            return
          }
          if (activeId) {
            e.preventDefault()
            e.stopPropagation()
            switchViewMode('editor')
            return
          }
          void flushSave().then(() => bridge.closePanel())
          return
        }
        if (viewMode === 'editor') {
          e.preventDefault()
          e.stopPropagation()
          switchViewMode('list')
          return
        }
      }
    }
  })

  // 失焦前尽力落盘
  window.addEventListener('blur', () => void flushSave())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave()
  })

  // 供外壳调用
  const w = window as unknown as Record<string, unknown>
  w.__ifoloFocus = () => view?.focus()
  w.__ifoloNewNote = () => void newNote()
  w.__ifoloToggleList = () => toggleViewMode()
  w.__ifoloCommandPalette = () => {
    if (viewMode === 'list') {
      noteList.toggleCommandMode()
    } else {
      editorSearch.toggleCommandMode()
    }
  }
  w.__ifoloSearch = () => {
    if (viewMode !== 'list') switchViewMode('list')
    noteList.setSearchVisible(true, undefined, true)
  }
  w.__ifoloInsert = (text: string) => {
    if (viewMode !== 'editor') switchViewMode('editor')
    view.dispatch(view.state.tr.insertText(text))
    view.focus()
  }
  w.__ifoloSetOpacity = (value: number) => {
    document.documentElement.style.setProperty('--panel-opacity', String(value))
  }
  w.__ifoloSetWidth = (value: number) => {
    document.documentElement.style.setProperty('--panel-width', `${value}px`)
  }
  w.__ifoloSettings = () => switchViewMode('settings')
  w.__ifoloRefreshNotes = async () => {
    try {
      const payload = await bridge.boot()
      notes = payload.notes
      folders = payload.folders || []
      noteList.update(notes, activeId, folders)
      renderTabs()
    } catch (e) {
      console.warn('Refresh notes error:', e)
    }
  }

  if (viewMode === 'editor') {
    view.focus()
  }
  w.__ifoloBooted = true
}

void boot().catch((err) => {
  // 原生日志会通过 WKNavigationDelegate 探针读走这个全局变量。
  // file:// 下没法开 DevTools，这是唯一的错误出口。
  const w = window as unknown as Record<string, unknown>
  const e = err as Error | undefined
  w.__ifoloBootError =
    `${e?.name ?? 'Error'}: ${e?.message ?? String(err)}\n${e?.stack ?? ''}`
  console.error(err)
  const el = document.getElementById('app')
  if (el) {
    el.replaceChildren()
    const pre = document.createElement('pre')
    pre.style.cssText =
      'padding:24px;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#A91E22;white-space:pre-wrap;margin:0'
    pre.textContent = `iFolo 启动失败\n\n${w.__ifoloBootError as string}`
    el.append(pre)
  }
})

/* 供调试：在控制台里查看状态 */
export const __debug = { get view() { return view }, SLASH_COMMANDS, TASK_STATUSES }
