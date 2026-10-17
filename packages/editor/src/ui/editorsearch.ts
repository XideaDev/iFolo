/**
 * 编辑器页面内搜索栏 (Editor In-Page Search)
 *
 * 功能点：
 *   1. 默认在当前 ProseMirror 文档内高亮搜索词、计数 (1/4)、上一处/下一处跳转 (Enter/Shift+Enter)。
 *   2. 光标同步与平滑滚动：跳转匹配项时使用 tr.scrollIntoView() 与 TextSelection。
 *   3. 全局搜索指令支持：
 *      - 输入以 `@all ` 或 `/all ` 开头
 *      - 或按下快捷键 ⌥⏎ (Option+Enter)
 *      - 或点击「🌐 搜全部 ⌥⏎」药丸按钮
 *      触发 onGlobalSearch(query)，一键切换至首页主面板并执行全库语义搜索。
 */

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'
import { el, ICONS } from './dom'
import { getStoredSearchState, setStoredSearchState } from '../storage'

export interface SearchMatch {
  from: number
  to: number
}

export interface SearchPluginState {
  query: string
  matches: SearchMatch[]
  activeIndex: number
  decorations: DecorationSet
}

export const docSearchPluginKey = new PluginKey<SearchPluginState>('docSearch')

export function findMatches(doc: PMNode, query: string): SearchMatch[] {
  const cleanQ = query.trim()
  if (!cleanQ) return []
  const matches: SearchMatch[] = []
  const q = cleanQ.toLowerCase()

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let index = text.indexOf(q)
      while (index !== -1) {
        matches.push({
          from: pos + index,
          to: pos + index + q.length,
        })
        index = text.indexOf(q, index + Math.max(1, q.length))
      }
    }
  })

  return matches
}

export function buildDecorations(
  doc: PMNode,
  matches: SearchMatch[],
  activeIndex: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty

  const decos: Decoration[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const isActive = i === activeIndex
    decos.push(
      Decoration.inline(m.from, m.to, {
        class: isActive ? 'search-highlight search-highlight--active' : 'search-highlight',
      }),
    )
  }

  return DecorationSet.create(doc, decos)
}

export function createDocSearchPlugin(): Plugin<SearchPluginState> {
  return new Plugin<SearchPluginState>({
    key: docSearchPluginKey,
    state: {
      init(): SearchPluginState {
        return {
          query: '',
          matches: [],
          activeIndex: 0,
          decorations: DecorationSet.empty,
        }
      },
      apply(tr, prev, _oldState, newState): SearchPluginState {
        const meta = tr.getMeta(docSearchPluginKey)
        if (meta) {
          const query = meta.query !== undefined ? (meta.query as string) : prev.query
          const matches = findMatches(newState.doc, query)
          let activeIndex = meta.activeIndex !== undefined ? (meta.activeIndex as number) : prev.activeIndex
          if (matches.length === 0) {
            activeIndex = 0
          } else if (activeIndex >= matches.length) {
            activeIndex = matches.length - 1
          } else if (activeIndex < 0) {
            activeIndex = 0
          }
          const decorations = buildDecorations(newState.doc, matches, activeIndex)
          return { query, matches, activeIndex, decorations }
        }

        if (tr.docChanged && prev.query) {
          const matches = findMatches(newState.doc, prev.query)
          let activeIndex = prev.activeIndex
          if (matches.length === 0) {
            activeIndex = 0
          } else if (activeIndex >= matches.length) {
            activeIndex = matches.length - 1
          }
          const decorations = buildDecorations(newState.doc, matches, activeIndex)
          return { query: prev.query, matches, activeIndex, decorations }
        }

        if (tr.docChanged) {
          return {
            ...prev,
            decorations: prev.decorations.map(tr.mapping, newState.doc),
          }
        }

        return prev
      },
    },
    props: {
      decorations(state) {
        return docSearchPluginKey.getState(state)?.decorations ?? null
      },
    },
  })
}

import { CommandItem } from './notelist'

export interface EditorSearchOptions {
  view: EditorView
  onGlobalSearch: (query: string) => void
  onVisibilityChange?: (visible: boolean) => void
  getCommands?: () => CommandItem[]
}

export class EditorSearch {
  readonly dom: HTMLElement
  private searchInput: HTMLInputElement
  private countEl: HTMLElement
  private clearBtn: HTMLButtonElement
  private cmdDropdown: HTMLElement
  private visible = false
  private activeCmdIndex = 0
  private visibleCommands: CommandItem[] = []

  constructor(private opts: EditorSearchOptions) {
    this.searchInput = el('input', {
      class: 'notelist__search-input',
      type: 'text',
      placeholder: '在当前文档中查找… (输入 / 触发命令面板，⌥⏎ 全局搜索)',
    }) as HTMLInputElement

    this.countEl = el('span', {
      class: 'editor-search-count',
    })
    this.countEl.style.display = 'none'

    this.clearBtn = el('button', {
      class: 'notelist__search-clear',
      type: 'button',
      title: '清空或关闭',
      html: ICONS.close,
    }) as HTMLButtonElement

    this.cmdDropdown = el('div', { class: 'editor-search-commands' })
    this.cmdDropdown.style.display = 'none'

    this.dom = el('div', { class: 'notelist__search-wrap editor-search-bar' }, [
      el('span', { class: 'notelist__search-icon', html: ICONS.search }),
      this.searchInput,
      this.countEl,
      this.clearBtn,
      this.cmdDropdown,
    ])

    // 读取存储记忆状态（默认展开）
    this.visible = getStoredSearchState('editor', true)
    this.dom.style.display = this.visible ? 'flex' : 'none'

    this.bindEvents()
  }

  private renderCommands(q: string) {
    const allCmds = this.opts.getCommands?.() ?? []
    this.visibleCommands = allCmds.filter(
      (c) => !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    )
    if (this.activeCmdIndex >= this.visibleCommands.length) {
      this.activeCmdIndex = Math.max(0, this.visibleCommands.length - 1)
    }

    this.cmdDropdown.replaceChildren()
    const header = el('div', {
      class: 'cmd-row',
      style: 'font-size: 11px; color: #959FAC; font-weight: 600; cursor: default; border-bottom: 1px solid var(--border-subtle); padding: 6px 12px;',
    }, ['命令面板 · ↑↓ 键选择，回车或点击执行'])
    this.cmdDropdown.append(header)

    if (this.visibleCommands.length === 0) {
      const empty = el('div', {
        class: 'cmd-row',
        style: 'color: #959FAC; font-size: 11.5px; padding: 12px 14px; cursor: default;',
      }, ['无匹配命令'])
      this.cmdDropdown.append(empty)
    } else {
      this.visibleCommands.forEach((cmd, idx) => {
        const isSelected = idx === this.activeCmdIndex
        const row = el('div', {
          class: `cmd-row${isSelected ? ' cmd-row--active' : ''}`,
        }, [
          el('span', { class: 'ic', html: cmd.icon }),
          el('span', {}, [cmd.title]),
        ])
        if (cmd.keyHint) {
          row.append(el('span', { class: 'kk' }, [cmd.keyHint]))
        }
        row.addEventListener('mousedown', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          this.activeCmdIndex = idx
          this.executeActiveCommand()
        })
        row.addEventListener('click', (ev) => {
          ev.stopPropagation()
        })
        this.cmdDropdown.append(row)
      })
    }

    this.cmdDropdown.style.display = 'block'
  }

  private hideCommands() {
    this.cmdDropdown.style.display = 'none'
  }

  private moveCommandActive(delta: number) {
    if (this.visibleCommands.length === 0) return
    this.activeCmdIndex = (this.activeCmdIndex + delta + this.visibleCommands.length) % this.visibleCommands.length
    const rows = this.cmdDropdown.querySelectorAll('.cmd-row:not(:first-child)')
    rows.forEach((row, i) => {
      row.classList.toggle('cmd-row--active', i === this.activeCmdIndex)
      if (i === this.activeCmdIndex) {
        row.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  private executeActiveCommand() {
    const cmd = this.visibleCommands[this.activeCmdIndex]
    if (!cmd) return
    this.hideCommands()
    this.searchInput.value = ''
    this.performSearch('')
    cmd.perform()
  }

  private bindEvents() {
    this.searchInput.addEventListener('input', () => {
      const val = this.searchInput.value.trim()
      const lower = val.toLowerCase()
      if (val.startsWith('/') && !lower.startsWith('/all ') && lower !== '/all') {
        this.renderCommands(val.slice(1).trim().toLowerCase())
      } else {
        this.hideCommands()
        this.performSearch(this.searchInput.value)
      }
    })

    this.searchInput.addEventListener('keydown', (e) => {
      if (this.cmdDropdown.style.display !== 'none') {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          this.moveCommandActive(1)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          this.moveCommandActive(-1)
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          this.executeActiveCommand()
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          this.hideCommands()
          this.searchInput.value = ''
          this.performSearch('')
          return
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        const raw = this.searchInput.value.trim()
        const lower = raw.toLowerCase()

        // 快捷键 ⌥⏎ 或 @all / /all 指令触发全库检索
        if (
          e.altKey ||
          lower.startsWith('@all ') ||
          lower.startsWith('/all ') ||
          lower === '@all' ||
          lower === '/all'
        ) {
          let globalQ = raw
          if (lower.startsWith('@all ') || lower.startsWith('/all ')) {
            globalQ = raw.slice(5).trim()
          } else if (lower === '@all' || lower === '/all') {
            globalQ = ''
          }
          this.opts.onGlobalSearch(globalQ)
          return
        }

        if (e.shiftKey) {
          this.prevMatch()
        } else {
          this.nextMatch()
        }
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.hideCommands()
        if (this.searchInput.value) {
          this.searchInput.value = ''
          this.performSearch('')
        } else {
          this.hide()
          this.opts.view.focus()
        }
        return
      }
    })

    this.clearBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      this.hideCommands()
      if (this.searchInput.value) {
        this.searchInput.value = ''
        this.performSearch('')
        this.searchInput.focus()
      } else {
        this.hide()
        this.opts.view.focus()
      }
    })

    window.addEventListener('mousedown', (e) => {
      if (this.cmdDropdown.style.display !== 'none' && !this.dom.contains(e.target as Node)) {
        this.hideCommands()
      }
    })
  }

  show(initialQuery?: string, shouldFocus = false) {
    this.visible = true
    setStoredSearchState('editor', true)
    this.dom.style.display = 'flex'
    if (initialQuery !== undefined) {
      this.searchInput.value = initialQuery
    }
    if (this.searchInput.value) {
      this.performSearch(this.searchInput.value)
    }
    if (shouldFocus) {
      this.searchInput.focus()
      if (this.searchInput.value) {
        this.searchInput.select()
      }
    }
    this.opts.onVisibilityChange?.(true)
  }

  hide() {
    this.visible = false
    this.hideCommands()
    setStoredSearchState('editor', false)
    if (this.dom.style.display === 'none') {
      this.opts.onVisibilityChange?.(false)
      return
    }
    this.dom.style.display = 'none'

    // 清空 ProseMirror 搜索高亮
    const tr = this.opts.view.state.tr.setMeta(docSearchPluginKey, {
      query: '',
      activeIndex: 0,
    })
    this.opts.view.dispatch(tr)

    this.countEl.textContent = ''
    this.countEl.style.display = 'none'
    this.opts.onVisibilityChange?.(false)
  }

  toggle(initialQuery?: string, shouldFocus = true) {
    if (this.isVisible()) {
      this.hide()
      this.opts.view.focus()
    } else {
      this.show(initialQuery, shouldFocus)
    }
  }

  isVisible(): boolean {
    return this.visible && this.dom.style.display !== 'none'
  }
  isCommandMode(): boolean {
    return this.isVisible() && (this.cmdDropdown.style.display !== 'none' || this.searchInput.value.startsWith('/'))
  }

  openCommandMode() {
    this.show('/', true)
    this.searchInput.value = '/'
    this.renderCommands('')
    this.searchInput.focus()
  }

  closeCommandMode() {
    this.hideCommands()
    this.searchInput.value = ''
    this.performSearch('')
  }

  toggleCommandMode() {
    if (this.isCommandMode()) {
      this.closeCommandMode()
    } else {
      this.openCommandMode()
    }
  }

  performSearch(query: string) {
    let cleanQ = query.trim()
    // 若带了 @all 指令，搜索文档时去除指令前缀
    if (cleanQ.toLowerCase().startsWith('@all ') || cleanQ.toLowerCase().startsWith('/all ')) {
      cleanQ = cleanQ.slice(5).trim()
    }

    const tr = this.opts.view.state.tr.setMeta(docSearchPluginKey, {
      query: cleanQ,
      activeIndex: 0,
    })
    this.opts.view.dispatch(tr)

    const pluginState = docSearchPluginKey.getState(this.opts.view.state)
    const matches = pluginState?.matches ?? []
    const total = matches.length

    if (!cleanQ) {
      this.countEl.textContent = ''
      this.countEl.style.display = 'none'
      return
    }

    this.countEl.style.display = 'inline-block'
    if (total === 0) {
      this.countEl.textContent = '0/0'
    } else {
      this.jumpToMatch(0)
    }
  }

  jumpToMatch(index: number) {
    const state = docSearchPluginKey.getState(this.opts.view.state)
    if (!state || state.matches.length === 0) return
    const total = state.matches.length
    const nextIndex = ((index % total) + total) % total
    const match = state.matches[nextIndex]

    const tr = this.opts.view.state.tr
    tr.setMeta(docSearchPluginKey, { activeIndex: nextIndex })
    tr.setSelection(TextSelection.create(this.opts.view.state.doc, match.from, match.to))
    tr.scrollIntoView()
    this.opts.view.dispatch(tr)

    this.countEl.style.display = 'inline-block'
    this.countEl.textContent = `${nextIndex + 1}/${total}`
  }

  nextMatch() {
    const state = docSearchPluginKey.getState(this.opts.view.state)
    if (!state || state.matches.length === 0) return
    this.jumpToMatch(state.activeIndex + 1)
  }

  prevMatch() {
    const state = docSearchPluginKey.getState(this.opts.view.state)
    if (!state || state.matches.length === 0) return
    this.jumpToMatch(state.activeIndex - 1)
  }

  refresh() {
    if (this.isVisible() && this.searchInput.value.trim()) {
      this.performSearch(this.searchInput.value)
    }
  }
}
