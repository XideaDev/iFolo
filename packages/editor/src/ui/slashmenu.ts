/**
 * 斜杠命令菜单
 *
 * 只负责渲染 slash 插件的状态，不持有任何业务逻辑。
 * 位置贴着光标 —— 面板很窄，菜单跑偏了会直接跑到屏幕外。
 */

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { slashKey, runSlashCommand, SlashCommand } from '../slash'
import { el } from './dom'

export class SlashMenu {
  readonly dom: HTMLElement
  private itemEls: HTMLElement[] = []
  private commands: SlashCommand[] = []
  private visible = false

  constructor(private view: EditorView) {
    this.dom = el('div', { class: 'menu slash-menu' })
    this.dom.style.display = 'none'
    this.dom.addEventListener('mousedown', (e) => {
      // 阻止默认行为，避免编辑器失焦
      e.preventDefault()
    })
    document.body.append(this.dom)
  }

  update(state: EditorState) {
    const st = slashKey.getState(state)
    if (!st?.active) {
      this.hide()
      return
    }

    // 命令列表变了才重建 DOM
    if (this.commands !== st.items) {
      this.commands = st.items
      this.render()
    }

    this.itemEls.forEach((node, i) => {
      node.classList.toggle('slash-menu__item--active', i === st.index)
    })

    if (st.items.length === 0) {
      this.showAt(state.selection.from, 44)
      return
    }

    const active = this.itemEls[st.index]
    this.showAt(state.selection.from, active ? active.offsetTop : 0)
  }

  private render() {
    this.dom.replaceChildren()
    this.itemEls = []

    if (this.commands.length === 0) {
      this.dom.append(el('div', { class: 'slash-menu__empty' }, ['没有匹配的命令']))
      return
    }

    this.commands.forEach((cmd, i) => {
      const item = el('button', { class: 'slash-menu__item', type: 'button' }, [
        el('span', { class: 'slash-menu__glyph' }, [cmd.glyph]),
        el('span', { class: 'slash-menu__text' }, [
          el('div', { class: 'slash-menu__name' }, [cmd.name]),
          el('div', { class: 'slash-menu__desc' }, [cmd.desc]),
        ]),
      ])
      item.addEventListener('click', () => {
        const st = slashKey.getState(this.view.state)
        if (st?.active) runSlashCommand(this.view, st, cmd)
      })
      item.addEventListener('mouseenter', () => {
        this.view.dispatch(this.view.state.tr.setMeta(slashKey, { index: i }))
      })
      this.itemEls.push(item)
      this.dom.append(item)
    })
  }

  private showAt(pos: number, scrollTop: number) {
    let rect: { left: number; top: number; bottom: number }
    try {
      rect = this.view.coordsAtPos(pos)
    } catch {
      this.hide()
      return
    }

    if (!this.visible) {
      this.dom.style.display = ''
      this.visible = true
    }

    const menuRect = this.dom.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 6

    let left = rect.left - 12
    let top = rect.bottom + gap

    if (left + menuRect.width > vw - 8) left = vw - menuRect.width - 8
    if (left < 8) left = 8
    // 下方放不下就翻到上方
    if (top + menuRect.height > vh - 8) top = rect.top - menuRect.height - gap
    if (top < 8) top = 8

    this.dom.style.left = `${Math.round(left)}px`
    this.dom.style.top = `${Math.round(top)}px`
    this.dom.scrollTop = scrollTop
  }

  private hide() {
    if (!this.visible) return
    this.dom.style.display = 'none'
    this.visible = false
  }

  destroy() {
    this.dom.remove()
  }
}
