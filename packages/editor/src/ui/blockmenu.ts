/**
 * 块操作菜单
 *
 * 由段落指示器的手柄唤起。操作对象是「一个块」，不是选区。
 * 菜单项对齐 Flyout 实测到的三条块操作：删除区块 / 复制 / 在下方插入，
 * 另加「转为」——把块换成另一种类型。
 */

import { EditorView } from 'prosemirror-view'
import { TextSelection } from 'prosemirror-state'
import { Node as PMNode } from 'prosemirror-model'
import { nodes } from '../schema'
import { el, positionMenu, ICONS } from './dom'

function replaceBlock(view: EditorView, start: number, end: number, make: () => PMNode) {
  const size = view.state.doc.content.size
  const from = Math.min(start, size)
  const to = Math.min(end, size)
  if (to <= from) return
  view.dispatch(view.state.tr.replaceWith(from, to, make()).scrollIntoView())
  view.focus()
}

interface TurnInto {
  label: string
  /** 当前块是否已经是这个类型 */
  is: (node: PMNode) => boolean
  make: () => PMNode
}

const TURN_INTOS: TurnInto[] = [
  { label: '正文', is: (n) => n.type.name === 'paragraph', make: () => nodes.paragraph.create() },
  { label: '标题 1', is: (n) => n.type.name === 'heading' && n.attrs.level === 1, make: () => nodes.heading.create({ level: 1 }) },
  { label: '标题 2', is: (n) => n.type.name === 'heading' && n.attrs.level === 2, make: () => nodes.heading.create({ level: 2 }) },
  { label: '标题 3', is: (n) => n.type.name === 'heading' && n.attrs.level === 3, make: () => nodes.heading.create({ level: 3 }) },
  { label: '引用', is: (n) => n.type.name === 'blockquote', make: () => nodes.blockquote.create(null, nodes.paragraph.create()) },
  { label: '代码块', is: (n) => n.type.name === 'code_block', make: () => nodes.code_block.create({ lang: '' }) },
  { label: '任务', is: (n) => n.type.name === 'task_list', make: () => nodes.task_list.create(null, nodes.task_item.create({ status: 'todo' }, nodes.paragraph.create())) },
]

export class BlockMenu {
  private dom: HTMLElement | null = null

  constructor(private view: EditorView) {}

  open(anchor: DOMRect, start: number, end: number) {
    this.close()

    const node = this.view.state.doc.nodeAt(start)
    if (!node) return

    const menu = el('div', { class: 'menu' })
    menu.append(el('div', { class: 'menu__title' }, ['区块操作']))

    /* ---------- 转为 ---------- */
    const chips = el('div', { class: 'menu__chips' })
    for (const t of TURN_INTOS) {
      const on = t.is(node)
      const chip = el('button', {
        class: `menu__chip${on ? ' menu__chip--on' : ''}`,
        type: 'button',
      }, [t.label])
      chip.addEventListener('click', () => {
        replaceBlock(this.view, start, end, t.make)
        this.close()
      })
      chips.append(chip)
    }
    menu.append(chips)

    menu.append(el('div', { class: 'menu__sep' }))

    /* ---------- 复制 ---------- */
    menu.append(
      this.item(ICONS.copy, '复制', '⌘D', () => {
        const slice = this.view.state.doc.slice(start, end)
        const text = slice.content.textBetween(0, slice.content.size, '\n\n', '\n')
        void navigator.clipboard?.writeText(text).catch(() => undefined)
        this.close()
      }),
    )

    /* ---------- 在下方插入 ---------- */
    menu.append(
      this.item(ICONS.plusSmall, '在下方插入', '⏎', () => {
        const para = nodes.paragraph.create()
        const tr = this.view.state.tr.insert(end, para)
        tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)))
        this.view.dispatch(tr.scrollIntoView())
        this.view.focus()
        this.close()
      }),
    )

    menu.append(el('div', { class: 'menu__sep' }))

    /* ---------- 删除区块 ---------- */
    menu.append(
      this.item(ICONS.trash, '删除区块', '⌫', () => {
        const doc = this.view.state.doc
        // 删到只剩空文档就没有意义了，直接忽略
        if (doc.childCount <= 1 && doc.firstChild?.nodeSize === 2) {
          this.close()
          return
        }
        this.view.dispatch(this.view.state.tr.delete(start, end).scrollIntoView())
        this.view.focus()
        this.close()
      }, true),
    )

    this.dom = menu
    positionMenu(menu, anchor, true)
  }

  private item(
    icon: string,
    label: string,
    key: string,
    onClick: () => void,
    danger = false,
  ): HTMLElement {
    const btn = el('button', {
      class: `menu__item${danger ? ' menu__danger' : ''}`,
      type: 'button',
    }, [
      el('span', { class: 'menu__icon', html: icon }),
      el('span', {}, [label]),
      ...(key ? [el('span', { class: 'menu__key' }, [key])] : []),
    ])
    btn.addEventListener('click', onClick)
    return btn
  }

  close() {
    this.dom?.remove()
    this.dom = null
  }

  get isOpen() {
    return this.dom !== null
  }
}
