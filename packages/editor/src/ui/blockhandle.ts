/**
 * 段落指示器
 *
 * 悬停任意块，左侧浮出两个手柄：
 *   ＋   在下方插入一个空段落
 *   ⠿   拖拽重排 / 单击唤出块菜单
 *
 * ⚠️ 硬约束（PRD FR-28）：
 *   手柄必须渲染在**编辑器容器外层**、用绝对定位对齐行高，
 *   不能作为外来节点插进编辑器管理的节点树 —— 那会破坏光标与选区。
 *   本文件里的 layer 就是那个外层。
 */

import { EditorView } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'
import { el, ICONS } from './dom'
import { BlockMenu } from './blockmenu'
import { nodes } from '../schema'

interface BlockHit {
  index: number
  /** 块在文档中的起始位置（块之前的位置） */
  start: number
  end: number
  rect: DOMRect
}

export class BlockHandle {
  private layer: HTMLElement
  private handle: HTMLElement
  private plusBtn: HTMLButtonElement
  private dragBtn: HTMLButtonElement
  private menu: BlockMenu
  private current: BlockHit | null = null
  private hideTimer = 0

  constructor(
    private view: EditorView,
    private container: HTMLElement,
  ) {
    this.layer = el('div', { class: 'block-handle-layer' })
    this.container.append(this.layer)

    this.plusBtn = el('button', {
      class: 'block-handle__btn',
      type: 'button',
      title: '在下方插入',
      html: ICONS.plusSmall,
    }) as HTMLButtonElement

    this.dragBtn = el('button', {
      class: 'block-handle__btn block-handle__btn--drag',
      type: 'button',
      title: '拖动排序 · 单击打开菜单',
      html: ICONS.drag,
    }) as HTMLButtonElement

    this.handle = el('div', { class: 'block-handle' }, [this.plusBtn, this.dragBtn])
    this.layer.append(this.handle)

    this.menu = new BlockMenu(view)

    this.plusBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.insertBelow()
    })

    this.dragBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.beginDrag(e)
    })

    view.dom.addEventListener('mousemove', this.onMouseMove)
    view.dom.addEventListener('mouseleave', this.onMouseLeave)
    view.dom.addEventListener('scroll', this.onScroll, true)
    window.addEventListener('scroll', this.onScroll, true)
  }

  /* ------------------------------------------------------------------ 命中 */

  private hitTest(clientY: number): BlockHit | null {
    const doc = this.view.state.doc
    const children = Array.from(this.view.dom.children) as HTMLElement[]
    if (children.length !== doc.childCount) return null

    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect()
      if (clientY >= rect.top - 2 && clientY <= rect.bottom + 2) {
        let start = 0
        for (let k = 0; k < i; k++) start += doc.child(k).nodeSize
        return { index: i, start, end: start + doc.child(i).nodeSize, rect }
      }
    }
    return null
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.menu.isOpen) return
    window.clearTimeout(this.hideTimer)

    const hit = this.hitTest(event.clientY)
    if (!hit) {
      this.scheduleHide()
      return
    }
    if (this.current && this.current.start === hit.start && this.current.rect.top === hit.rect.top) {
      return
    }
    this.current = hit
    this.reposition()
    this.handle.classList.add('block-handle--visible')
  }

  private onMouseLeave = () => {
    if (this.menu.isOpen) return
    this.scheduleHide()
  }

  private onScroll = () => {
    if (this.menu.isOpen) return
    this.scheduleHide()
  }

  private scheduleHide() {
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => {
      this.handle.classList.remove('block-handle--visible')
      this.current = null
    }, 180)
  }

  private reposition() {
    if (!this.current) return
    const layerRect = this.layer.getBoundingClientRect()
    const { rect } = this.current
    const top = rect.top - layerRect.top + 1
    const left = Math.max(0, rect.left - layerRect.left - 22)
    this.handle.style.top = `${Math.round(top)}px`
    this.handle.style.left = `${Math.round(left)}px`
  }

  /* ------------------------------------------------------------------ 操作 */

  private insertBelow() {
    if (!this.current) return
    const { end } = this.current
    const tr = this.view.state.tr.insert(end, nodes.paragraph.create())
    this.view.dispatch(tr.scrollIntoView())
    this.view.focus()
  }

  private beginDrag(event: MouseEvent) {
    if (!this.current) return
    const hit = this.current

    // 拖动重排：拖到目标块上时把源块移动到目标位置
    const startY = event.clientY
    let moved = false
    let target: BlockHit | null = null

    const onMove = (e: MouseEvent) => {
      if (Math.abs(e.clientY - startY) > 4) moved = true
      if (!moved) return
      target = this.hitTest(e.clientY)
      this.handle.style.transform = `translateY(${e.clientY - startY}px)`
      this.handle.style.opacity = '0.6'
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      this.handle.style.transform = ''
      this.handle.style.opacity = ''

      if (moved && target && target.start !== hit.start) {
        this.moveBlock(hit, target)
      } else if (!moved) {
        // 没拖动 = 单击，唤出块菜单
        this.menu.open(hit.rect, hit.start, hit.end)
      }
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  }

  private moveBlock(from: BlockHit, to: BlockHit) {
    const doc = this.view.state.doc
    const node = doc.nodeAt(from.start)
    if (!node) return

    const tr = this.view.state.tr
    const slice = doc.slice(from.start, from.end)
    // 先删后插，插入点要按删除后的坐标修正
    tr.delete(from.start, from.end)
    const insertAt = to.start > from.start ? to.start - slice.size : to.start
    tr.insert(Math.max(0, insertAt), slice.content)
    this.view.dispatch(tr.scrollIntoView())
    this.view.focus()
    this.current = null
    this.handle.classList.remove('block-handle--visible')
  }

  /* ------------------------------------------------------------------ 清理 */

  destroy() {
    window.clearTimeout(this.hideTimer)
    this.view.dom.removeEventListener('mousemove', this.onMouseMove)
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave)
    this.view.dom.removeEventListener('scroll', this.onScroll, true)
    window.removeEventListener('scroll', this.onScroll, true)
    this.menu.close()
    this.layer.remove()
  }
}

/** 供外部判断某个块是否可被手柄操作 */
export function isHandleableBlock(node: PMNode): boolean {
  return node.isBlock
}
