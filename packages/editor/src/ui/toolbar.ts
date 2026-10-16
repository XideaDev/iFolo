/**
 * 富文本工具栏
 *
 * 与「选中气泡」分工不同（PRD FR-29）：
 *   工具栏 —— 先选格式再打字（写之前就设定）
 *   气泡   —— 先选文字再改格式（写完回改）
 * 只做其中一个，都会让一半的操作路径变长。
 */

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { toggleMark, setBlockType, wrapIn, lift } from 'prosemirror-commands'
import { MarkType } from 'prosemirror-model'
import { nodes, marks } from '../schema'
import { NoteMeta, FolderItem } from '../storage'
import { el, positionMenu, ICONS } from './dom'
interface BlockOption {
  label: string
  match: (state: EditorState) => boolean
  apply: (view: EditorView) => void
}

const BLOCK_OPTIONS: BlockOption[] = [
  {
    label: '正文',
    match: (s) => s.selection.$from.parent.type.name === 'paragraph' && !hasAncestor(s, 'blockquote'),
    apply: (v) => {
      if (hasAncestor(v.state, 'blockquote')) {
        lift(v.state, v.dispatch, v)
      }
      setBlockType(nodes.paragraph)(v.state, v.dispatch, v)
    },
  },
  {
    label: '标题 1',
    match: (s) => isHeading(s, 1),
    apply: (v) => setBlockType(nodes.heading, { level: 1 })(v.state, v.dispatch, v),
  },
  {
    label: '标题 2',
    match: (s) => isHeading(s, 2),
    apply: (v) => setBlockType(nodes.heading, { level: 2 })(v.state, v.dispatch, v),
  },
  {
    label: '标题 3',
    match: (s) => isHeading(s, 3),
    apply: (v) => setBlockType(nodes.heading, { level: 3 })(v.state, v.dispatch, v),
  },
  {
    label: '引用',
    match: (s) => hasAncestor(s, 'blockquote'),
    apply: (v) => {
      if (hasAncestor(v.state, 'blockquote')) {
        lift(v.state, v.dispatch, v)
      } else {
        wrapIn(nodes.blockquote)(v.state, v.dispatch, v)
      }
    },
  },
  {
    label: '代码块',
    match: (s) => s.selection.$from.parent.type.name === 'code_block',
    apply: (v) => setBlockType(nodes.code_block, { lang: '' })(v.state, v.dispatch, v),
  },
]

function isHeading(state: EditorState, level: number): boolean {
  const node = state.selection.$from.parent
  return node.type.name === 'heading' && node.attrs.level === level
}

function hasAncestor(state: EditorState, name: string): boolean {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) return true
  }
  return false
}

const TEXT_COLORS = [
  { label: '默认', value: '' },
  { label: '蓝', value: 'var(--blue-700)' },
  { label: '绿', value: 'var(--green-800)' },
  { label: '橙', value: 'var(--orange-800)' },
  { label: '红', value: 'var(--red-700)' },
  { label: '灰', value: 'var(--ink-500)' },
]

const EMOJIS = ['✅', '⚠️', '💡', '📌', '🔥', '⭐️', '❓', '❗️', '📝', '🎯', '🚀', '🐛', '📎', '🔗', '⏰', '☕️']
export interface ToolbarOptions {
  getNote?: () => NoteMeta | null
  getFolders?: () => FolderItem[]
  onSetFolder?: (folderId: string | null) => Promise<void> | void
}

export class Toolbar {
  readonly dom: HTMLElement
  private blockBtn: HTMLButtonElement
  private blockLabel: HTMLElement
  private markButtons: { type: MarkType; btn: HTMLButtonElement }[] = []
  private popover: HTMLElement | null = null

  constructor(private view: EditorView, private opts?: ToolbarOptions) {
    this.blockBtn = el('button', { class: 'toolbar__block', type: 'button' }) as HTMLButtonElement
    this.blockLabel = el('span', {}, ['正文'])
    this.blockBtn.append(this.blockLabel, el('span', { class: 'toolbar__caret' }, ['▾']))
    this.blockBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.openBlockMenu()
    })

    this.dom = el('div', { class: 'toolbar' }, [
      this.blockBtn,
      el('span', { class: 'toolbar__sep' }),
      this.markButton('B', 'strong', 'toolbar__btn--b', '加粗 ⌘B'),
      this.markButton('I', 'em', 'toolbar__btn--i', '斜体 ⌘I'),
      this.markButton('U', 'underline', 'toolbar__btn--u', '下划线 ⌘U'),
      this.markButton('S', 'strikethrough', 'toolbar__btn--s', '删除线'),
      this.markButton('</>', 'code', 'toolbar__btn--mono', '行内代码 ⌘E'),
      el('span', { class: 'toolbar__sep' }),
      this.actionButton(ICONS.link, '链接', () => this.applyLink()),
      this.actionButton(ICONS.color, '文字颜色', (btn) => this.openColorMenu(btn)),
      this.actionButton(ICONS.highlight, '高亮', () => this.toggleHighlight()),
      this.actionButton(ICONS.emoji, '表情符号', (btn) => this.openEmojiMenu(btn), 'toolbar__btn--optional'),
      this.actionButton(ICONS.dots, '更多选项 (文件分类 / 清除格式)', (btn) => this.openMoreMenu(btn), 'toolbar__more'),
    ])
  }

  /* ------------------------------------------------------------------ 构建 */

  private markButton(text: string, markName: string, cls: string, title: string): HTMLButtonElement {
    const type = marks[markName]
    const btn = el('button', {
      class: `toolbar__btn ${cls}`,
      type: 'button',
      title,
    }, [text]) as HTMLButtonElement
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      toggleMark(type)(this.view.state, this.view.dispatch, this.view)
      this.view.focus()
    })
    this.markButtons.push({ type, btn })
    return btn
  }

  private actionButton(
    icon: string,
    title: string,
    onClick: (btn: HTMLButtonElement) => void,
    extraClass = '',
  ): HTMLButtonElement {
    const btn = el('button', {
      class: `toolbar__btn ${extraClass}`.trim(),
      type: 'button',
      title,
      html: icon,
    }) as HTMLButtonElement
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      onClick(btn)
    })
    return btn
  }

  /* ------------------------------------------------------------------ 状态 */

  update(state: EditorState) {
    for (const { type, btn } of this.markButtons) {
      const active = type.isInSet(state.storedMarks ?? state.selection.$from.marks()) != null
      btn.classList.toggle('toolbar__btn--on', active)
    }
    const current = BLOCK_OPTIONS.find((o) => o.match(state))
    this.blockLabel.textContent = current?.label ?? '正文'
  }

  /* ------------------------------------------------------------------ 浮层 */

  private closePopover() {
    this.popover?.remove()
    this.popover = null
  }

  private openBlockMenu() {
    if (this.popover) {
      this.closePopover()
      return
    }
    const menu = el('div', { class: 'menu' })
    menu.append(el('div', { class: 'menu__title' }, ['段落类型']))
    for (const opt of BLOCK_OPTIONS) {
      const on = opt.match(this.view.state)
      const item = el('button', { class: `menu__item${on ? ' menu__item--active' : ''}`, type: 'button' }, [
        el('span', { class: 'menu__icon' }, [on ? '•' : '']),
        el('span', {}, [opt.label]),
      ])
      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        opt.apply(this.view)
        this.view.focus()
        this.closePopover()
      })
      menu.append(item)
    }
    this.popover = menu
    positionMenu(menu, this.blockBtn.getBoundingClientRect(), true)
  }

  private openColorMenu(anchor: HTMLButtonElement) {
    if (this.popover) {
      this.closePopover()
      return
    }
    const menu = el('div', { class: 'menu' })
    menu.append(el('div', { class: 'menu__title' }, ['文字颜色']))
    const grid = el('div', { class: 'menu__swatches' })
    for (const c of TEXT_COLORS) {
      const sw = el('button', {
        class: 'menu__swatch',
        type: 'button',
        title: c.label,
        style: c.value ? `background:${c.value}` : 'background:var(--text-primary)',
      })
      sw.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.applyTextColor(c.value)
        this.closePopover()
      })
      grid.append(sw)
    }
    menu.append(grid)
    this.popover = menu
    positionMenu(menu, anchor.getBoundingClientRect(), true)
  }

  private openEmojiMenu(anchor: HTMLButtonElement) {
    if (this.popover) {
      this.closePopover()
      return
    }
    const menu = el('div', { class: 'menu' })
    menu.append(el('div', { class: 'menu__title' }, ['表情符号']))
    const grid = el('div', { class: 'menu__emoji' })
    for (const e of EMOJIS) {
      const btn = el('button', { class: 'menu__emoji-item', type: 'button' }, [e])
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
        this.view.dispatch(this.view.state.tr.insertText(e))
        this.view.focus()
        this.closePopover()
      })
      grid.append(btn)
    }
    menu.append(grid)
    this.popover = menu
    positionMenu(menu, anchor.getBoundingClientRect(), true)
  }

  /* ------------------------------------------------------------------ 动作 */

  private applyLink() {
    const { from, to, empty } = this.view.state.selection
    const existing = marks.link.isInSet(this.view.state.selection.$from.marks())
    const href = window.prompt('链接地址：', (existing?.attrs.href as string) ?? 'https://')
    if (!href) return
    if (empty && !existing) return
    const tr = this.view.state.tr
    if (empty && existing) {
      tr.removeMark(from, to, marks.link)
    }
    tr.addMark(from, to, marks.link.create({ href, title: null }))
    this.view.dispatch(tr)
    this.view.focus()
  }

  private applyTextColor(color: string) {
    const { from, to, empty } = this.view.state.selection
    const tr = this.view.state.tr
    if (!color) {
      tr.removeMark(from, to, marks.text_color)
    } else {
      tr.addMark(from, to, marks.text_color.create({ color }))
    }
    if (empty) {
      // 无选区时把 mark 挂到 storedMarks，下一个输入的字符就会带上
      const marks_ = color ? [marks.text_color.create({ color })] : []
      this.view.dispatch(tr.setStoredMarks(marks_))
    } else {
      this.view.dispatch(tr)
    }
    this.view.focus()
  }

  private toggleHighlight() {
    toggleMark(marks.highlight)(this.view.state, this.view.dispatch, this.view)
    this.view.focus()
  }
  private clearFormatting() {
    const { from, to } = this.view.state.selection
    this.view.dispatch(this.view.state.tr.removeMark(from, to))
    this.view.focus()
  }

  private openMoreMenu(anchor: HTMLButtonElement) {
    if (this.popover) {
      this.closePopover()
      return
    }
    const currentNote = this.opts?.getNote?.()
    const folders = (this.opts?.getFolders?.() ?? []).filter((f) => !f.isSystem)

    const menu = el('div', { class: 'menu toolbar-more-menu', style: 'min-width: 136px;' })
    menu.append(el('div', { class: 'menu__title' }, ['文件分类']))

    const isUnclassified = !currentNote?.folderId
    const defaultItem = el('button', {
      class: `menu__item${isUnclassified ? ' menu__item--active' : ''}`,
      type: 'button',
    }, [
      el('span', { class: 'menu__icon' }, [isUnclassified ? '✓' : '']),
      el('span', {}, ['未分类 / 默认']),
    ])
    defaultItem.addEventListener('mousedown', async (e) => {
      e.preventDefault()
      await this.opts?.onSetFolder?.(null)
      this.closePopover()
    })
    menu.append(defaultItem)

    for (const f of folders) {
      const isCurrent = currentNote?.folderId === f.id
      const item = el('button', {
        class: `menu__item${isCurrent ? ' menu__item--active' : ''}`,
        type: 'button',
      }, [
        el('span', { class: 'menu__icon' }, [isCurrent ? '✓' : '']),
        el('span', {}, [f.name]),
      ])
      item.addEventListener('mousedown', async (e) => {
        e.preventDefault()
        await this.opts?.onSetFolder?.(f.id)
        this.closePopover()
      })
      menu.append(item)
    }

    menu.append(el('div', { style: 'height: 1px; background: var(--border-subtle); margin: 3px 0;' }))

    const clearItem = el('button', {
      class: 'menu__item',
      type: 'button',
      title: '清除所选区域的文本格式',
    }, [
      el('span', { class: 'menu__icon', style: 'font-size: 11px;' }, ['⌫']),
      el('span', {}, ['清除格式']),
    ])
    clearItem.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.clearFormatting()
      this.closePopover()
    })
    menu.append(clearItem)

    this.popover = menu
    positionMenu(menu, anchor.getBoundingClientRect(), true)
  }

  destroy() {
    this.closePopover()
    this.dom.remove()
  }
}
