/**
 * 全局命令面板 (Command Palette ⌘K, 对齐原型图 04)
 *
 * 同一输入框承担两种意图：
 *   1. 快捷动作触发（新建、搜索、切换列表、透明度、导出等）
 *   2. 笔记标题/内容模糊直达
 */

import { NoteMeta } from '../storage'
import { el, ICONS } from './dom'

export interface CommandAction {
  id: string
  title: string
  keyHint?: string
  icon: string
  perform: () => void
}

export interface CommandPaletteOptions {
  getNotes: () => NoteMeta[]
  onOpenNote: (id: string) => void
  onNewNote: () => void
  onToggleList: () => void
  onSearch: (query: string) => void
  onSetOpacity: (value: number) => void
  onClosePanel: () => void
  onOpenSettings: () => void
}

export class CommandPalette {
  readonly dom: HTMLElement
  private input: HTMLInputElement
  private listEl: HTMLElement
  private isOpen = false
  private activeIndex = 0
  private visibleItems: Array<{ type: 'action'; action: CommandAction } | { type: 'note'; note: NoteMeta }> = []

  constructor(private opts: CommandPaletteOptions) {
    this.input = el('input', {
      class: 'cmd-input',
      type: 'text',
      placeholder: '键入命令或直接搜索笔记…',
      spellcheck: 'false',
    }) as HTMLInputElement

    const inputRow = el('div', { class: 'cmd-input-row' }, [
      el('span', { class: 'cmd-badge' }, ['⌘K']),
      this.input,
    ])

    this.listEl = el('div', { class: 'cmd-list' })

    const panel = el('div', { class: 'cmd-panel' }, [inputRow, this.listEl])

    this.dom = el('div', { class: 'cmd-dim' }, [panel])
    this.dom.style.display = 'none'

    // 点击背景收起
    this.dom.addEventListener('mousedown', (e) => {
      if (e.target === this.dom) {
        this.close()
      }
    })

    // 输入响应
    this.input.addEventListener('input', () => {
      this.activeIndex = 0
      this.render()
    })

    // 键盘快捷导航
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.moveActive(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.moveActive(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        this.executeActive()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })
  }

  private getDefaultActions(): CommandAction[] {
    return [
      {
        id: 'new_note',
        title: '新建笔记',
        keyHint: '⌘N',
        icon: ICONS.plus,
        perform: () => this.opts.onNewNote(),
      },
      {
        id: 'toggle_list',
        title: '查看全部笔记列表',
        keyHint: '⌘L',
        icon: ICONS.list,
        perform: () => this.opts.onToggleList(),
      },
      {
        id: 'search_notes',
        title: '搜索笔记内容',
        keyHint: '⌘F',
        icon: ICONS.search,
        perform: () => this.opts.onSearch(''),
      },
      {
        id: 'settings',
        title: '偏好设置…',
        keyHint: '⌘,',
        icon: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/></svg>`,
        perform: () => this.opts.onOpenSettings(),
      },
      {
        id: 'close_panel',
        title: '收起 iFolo 面板',
        keyHint: 'Esc',
        icon: ICONS.close,
        perform: () => this.opts.onClosePanel(),
      },
    ]
  }

  open() {
    this.isOpen = true
    this.dom.style.display = 'flex'
    this.input.value = ''
    this.activeIndex = 0
    this.render()
    setTimeout(() => this.input.focus(), 10)
  }

  close() {
    this.isOpen = false
    this.dom.style.display = 'none'
  }

  toggle() {
    if (this.isOpen) this.close()
    else this.open()
  }

  private moveActive(delta: number) {
    if (this.visibleItems.length === 0) return
    this.activeIndex = (this.activeIndex + delta + this.visibleItems.length) % this.visibleItems.length
    this.updateActiveStyles()
  }

  private updateActiveStyles() {
    const rows = this.listEl.querySelectorAll('.cmd-row')
    rows.forEach((row, i) => {
      row.classList.toggle('cmd-row--active', i === this.activeIndex)
      if (i === this.activeIndex) {
        row.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  private executeActive() {
    const item = this.visibleItems[this.activeIndex]
    if (!item) return
    this.close()
    if (item.type === 'action') {
      item.action.perform()
    } else {
      this.opts.onOpenNote(item.note.id)
    }
  }

  private render() {
    this.listEl.replaceChildren()
    const query = this.input.value.trim().toLowerCase()
    const actions = this.getDefaultActions()
    const notes = this.opts.getNotes()

    this.visibleItems = []

    // 1. 过滤动作
    for (const a of actions) {
      if (!query || a.title.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)) {
        this.visibleItems.push({ type: 'action', action: a })
      }
    }

    // 2. 匹配笔记直达
    if (query) {
      const matchedNotes = notes.filter((n) =>
        n.title.toLowerCase().includes(query) || (n.snippet && n.snippet.toLowerCase().includes(query)),
      ).slice(0, 8)

      for (const n of matchedNotes) {
        this.visibleItems.push({ type: 'note', note: n })
      }
    }

    if (this.visibleItems.length === 0) {
      const empty = el('div', {
        class: 'notelist__empty',
        style: 'padding: 20px 14px; font-size: 11.5px;',
      }, ['无匹配命令或笔记'])
      this.listEl.append(empty)
      return
    }

    this.visibleItems.forEach((item, index) => {
      const isSelected = index === this.activeIndex
      const row = el('div', {
        class: `cmd-row${isSelected ? ' cmd-row--active' : ''}`,
      })

      if (item.type === 'action') {
        const iconEl = el('span', { class: 'ic', html: item.action.icon })
        const titleEl = el('span', {}, [item.action.title])
        row.append(iconEl, titleEl)
        if (item.action.keyHint) {
          row.append(el('span', { class: 'kk' }, [item.action.keyHint]))
        }
      } else {
        const iconEl = el('span', { class: 'ic', html: ICONS.noteDoc })
        const titleEl = el('span', {}, [item.note.title || '无标题'])
        const snippetEl = el('span', {
          style: 'color: var(--text-tertiary); font-size: 10px; margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;',
        }, [item.note.snippet || ''])
        row.append(iconEl, titleEl, snippetEl, el('span', { class: 'kk' }, ['回车直达']))
      }

      row.addEventListener('click', () => {
        this.activeIndex = index
        this.executeActive()
      })

      this.listEl.append(row)
    })
  }
}
