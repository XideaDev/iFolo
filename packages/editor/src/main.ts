/**
 * iFolo 编辑器入口
 *
 * 装配顺序有讲究：
 *   1. 先建编辑器（需要文档内容）
 *   2. 再建工具栏与各浮层（需要 view 实例）
 *   3. 最后挂段落指示器（它的 layer 要 append 到编辑器容器上）
 */

import './tokens.css'
import './app.css'

import { EditorState, Plugin, TextSelection, Command } from 'prosemirror-state'
import { EditorView, NodeView, Decoration, DecorationSet, ViewMutationRecord } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'
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
import { parseMarkdown, serializeDoc, emptyDoc, docTitle } from './markdown'
import { createBridge, NoteMeta } from './storage'
import { slashPlugin, slashKey, SLASH_COMMANDS } from './slash'
import { SlashMenu } from './ui/slashmenu'
import { Toolbar } from './ui/toolbar'
import { BlockHandle } from './ui/blockhandle'
import { el, ICONS } from './ui/dom'
import { statusByKey, nextStatus, TASK_STATUSES } from './taskstatus'

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
let blockHandle: BlockHandle
let activeId: string | null = null
let notes: NoteMeta[] = []
let saveTimer = 0
let lastSaved = ''

const topbarTitle = el('span', { class: 'topbar__title' }, ['全部笔记'])
const topbarCount = el('span', { class: 'topbar__count' }, [''])
const tabstrip = el('div', { class: 'tabstrip' })
const statusDot = el('span', { class: 'statusbar__dot' })
const statusText = el('span', {}, ['已保存'])

function buildShell() {
  const root = document.getElementById('app')!

  const topbar = el('div', { class: 'topbar' }, [
    el('span', { class: 'topbar__logo', html: ICONS.logo }),
    topbarTitle,
    topbarCount,
    el('span', { class: 'topbar__actions' }, [
      iconButton(ICONS.search, '搜索', () => { /* 见下一步 */ }),
      iconButton(ICONS.filter, '筛选', () => { /* 见下一步 */ }),
      iconButton(ICONS.plus, '新建笔记 ⌘N', () => void newNote(), 'ibtn--accent'),
    ]),
  ])

  const editorScroll = el('div', { class: 'editor-scroll' })
  const editorWrap = el('div', { class: 'editor-wrap' })
  editorScroll.append(editorWrap)

  const statusbar = el('div', { class: 'statusbar' }, [
    el('span', {}, ['⌥⌘N 呼出 · 输入 / 唤出命令']),
    el('span', { class: 'statusbar__saved' }, [statusDot, statusText]),
  ])

  // 用 replaceChildren 而不是 append —— 否则 index.html 里的启动占位符会留在 DOM 里
  root.replaceChildren(topbar, tabstrip, editorScroll, statusbar)
  return { editorWrap, editorScroll }
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
      renderTabs()
    }
    setSavedState(true)
  } catch {
    statusText.textContent = '保存失败'
  }
}

function renderTabs() {
  tabstrip.replaceChildren()
  const sorted = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5)
  for (const note of sorted) {
    const active = note.id === activeId
    const tab = el('button', {
      class: `tabstrip__tab${active ? ' tabstrip__tab--active' : ''}`,
      type: 'button',
    }, [note.title || '无标题'])
    tab.addEventListener('click', () => void openNote(note.id))
    tabstrip.append(tab)
  }
  const add = el('button', { class: 'tabstrip__tab tabstrip__tab--add', type: 'button' }, ['＋'])
  add.addEventListener('click', () => void newNote())
  tabstrip.append(add)

  topbarCount.textContent = String(notes.length)
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

async function openNote(id: string) {
  if (id === activeId) return
  await flushSave()
  const content = await bridge.load(id)
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
  renderTabs()
  setSavedState(true)
}

async function newNote() {
  await flushSave()
  const meta = await bridge.create()
  notes.push(meta)
  activeId = meta.id
  lastSaved = ''
  view.updateState(
    EditorState.create({ doc: emptyDoc(), schema, plugins: view.state.plugins }),
  )
  toolbar.update(view.state)
  renderTabs()
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
  toolbar = new Toolbar(view)
  editorWrap.parentElement?.parentElement?.insertBefore(toolbar.dom, editorWrap.parentElement)

  slashMenu = new SlashMenu(view)
  blockHandle = new BlockHandle(view, editorWrap)

  const payload = await bridge.boot()
  notes = payload.notes
  activeId = payload.activeId
  lastSaved = payload.content

  if (activeId) {
    const doc = payload.content.trim() ? parseMarkdown(payload.content) : emptyDoc()
    view.updateState(EditorState.create({ doc, schema, plugins: view.state.plugins }))
  }

  toolbar.update(view.state)
  renderTabs()
  setSavedState(true)

  // Esc 收起面板
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !slashKey.getState(view.state)?.active) {
      void flushSave().then(() => bridge.closePanel())
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
  w.__ifoloInsert = (text: string) => {
    view.dispatch(view.state.tr.insertText(text))
    view.focus()
  }
  w.__ifoloSetOpacity = (value: number) => {
    document.documentElement.style.setProperty('--panel-opacity', String(value))
  }

  view.focus()
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
export const __debug = { get view() { return view }, get handle() { return blockHandle }, SLASH_COMMANDS, TASK_STATUSES }
