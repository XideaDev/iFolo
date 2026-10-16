/**
 * 笔记列表视图（全部笔记 / 抽屉）
 *
 * 对齐 product-analysis.html 原型：
 *   - 搜索与筛选实时联动
 *   - 卡片前置 12px 分类图标（闪电=快速 / 文档=笔记 / 铃铛=待办）
 *   - 标题、相对时间、正文预览摘要
 *   - 卡片悬浮操作：删除、重命名
 */

import { NoteMeta, SearchResult, FolderItem, Bridge, getStoredSearchState, setStoredSearchState, isDefaultFilterEnabled, isCardKindIconEnabled } from '../storage'
import { cleanTitle, stripMarkdown, hasTodoContent } from '../markdown'
import { el, ICONS } from './dom'

export type FilterKind = 'all' | 'todo' | 'note'

export interface CommandItem {
  id: string
  title: string
  keyHint?: string
  icon: string
  perform: () => void
}

export interface NoteListOptions {
  bridge: Bridge
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onCreate: () => void
  onClose: () => void
  onSearch?: (query: string) => Promise<SearchResult[]>
  onSearchToggle?: (visible: boolean) => void
  onFilterToggle?: (visible: boolean) => void
  getCommands?: () => CommandItem[]
  folders?: FolderItem[]
  onFoldersChange?: (folders: FolderItem[]) => void
  onNoteFolderChange?: (noteId: string, folderId: string | null) => void
  onNotePinnedChange?: (noteId: string, pinned: boolean) => void
}

export class NoteList {
  readonly dom: HTMLElement
  private searchInput: HTMLInputElement
  private searchWrap: HTMLElement
  private filterBar: HTMLElement
  private listScroll: HTMLElement
  private notes: NoteMeta[] = []
  private activeId: string | null = null
  private searchQuery = ''
  private currentFilter = 'all'
  private folders: FolderItem[] = []
  private draggedFolderIndex: number | null = null
  private activePickerEl: HTMLElement | null = null
  private isCreatingFolder = false
  private editingFolderId: string | null = null
  private showSearch = true
  private showFilter = false
  private semanticResults: Map<string, SearchResult> = new Map()
  private searchTimer = 0
  private showCardKindIcon = isCardKindIconEnabled()
  private activeCmdIndex = 0
  private visibleCommands: CommandItem[] = []

  constructor(private opts: NoteListOptions) {
    this.searchInput = el('input', {
      class: 'notelist__search-input',
      type: 'text',
      placeholder: '搜索笔记标题、内容，或输入 / 触发命令面板…',
    }) as HTMLInputElement

    const searchClear = el('button', {
      class: 'notelist__search-clear',
      type: 'button',
      title: '清空',
      html: ICONS.close,
    }) as HTMLButtonElement

    this.searchWrap = el('div', { class: 'notelist__search-wrap' }, [
      el('span', { class: 'notelist__search-icon', html: ICONS.search }),
      this.searchInput,
      searchClear,
    ])

    searchClear.addEventListener('click', () => {
      this.searchInput.value = ''
      this.searchQuery = ''
      this.semanticResults.clear()
      this.render()
      this.searchInput.focus()
    })

    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase()
      if (this.searchQuery.startsWith('/')) {
        this.activeCmdIndex = 0
      }
      this.render()
      if (!this.searchQuery.startsWith('/')) {
        this.triggerSemanticSearch()
      }
    })

    this.searchInput.addEventListener('keydown', (e) => {
      if (this.searchQuery.startsWith('/')) {
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
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (this.searchInput.value) {
          this.searchInput.value = ''
          this.searchQuery = ''
          this.semanticResults.clear()
          this.render()
        } else {
          this.setSearchVisible(false)
        }
      }
    })

    if (opts.folders && opts.folders.length > 0) {
      this.folders = opts.folders.filter((f) => f.id !== 'note')
      this.folders.forEach((f) => {
        if (f.id === 'todo') f.name = '代办笔记'
      })
    } else {
      this.folders = [
        { id: 'all', name: '全部', isSystem: true },
        { id: 'todo', name: '代办笔记', isSystem: true },
      ]
    }

    this.filterBar = el('div', { class: 'notelist__filters' })
    this.renderFilters()
    this.listScroll = el('div', { class: 'notelist__items' })

    this.dom = el('div', { class: 'notelist' }, [
      this.searchWrap,
      this.filterBar,
      this.listScroll,
    ])

    // 初始状态根据存储恢复（默认展开），但不自动抢占焦点
    this.showSearch = getStoredSearchState('list')
    this.searchWrap.style.display = this.showSearch ? 'flex' : 'none'
    this.showFilter = isDefaultFilterEnabled()
    this.filterBar.style.display = this.showFilter ? 'flex' : 'none'
  }

  private triggerSemanticSearch() {
    window.clearTimeout(this.searchTimer)
    if (!this.searchQuery || !this.opts.onSearch) {
      this.semanticResults.clear()
      return
    }
    const q = this.searchQuery
    this.searchTimer = window.setTimeout(async () => {
      try {
        const results = await this.opts.onSearch!(q)
        if (this.searchQuery === q) {
          this.semanticResults.clear()
          for (const res of results) {
            this.semanticResults.set(res.id, res)
          }
          this.render()
        }
      } catch (err) {
        console.warn('语义检索失败，降级为本地匹配', err)
      }
    }, 150)
  }

  private renderFilters() {
    this.filterBar.replaceChildren()

    this.folders.forEach((f, idx) => {
      // 如果当前分类正在就地内联编辑重命名
      if (this.editingFolderId === f.id) {
        const input = el('input', {
          class: 'notelist__chip notelist__chip--input',
          type: 'text',
          value: f.name,
          title: '回车确认，Esc 取消',
        }) as HTMLInputElement

        let renameDone = false
        const finishRename = async () => {
          if (renameDone) return
          renameDone = true
          const val = input.value.trim()
          this.editingFolderId = null
          if (val && val !== f.name) {
            await this.opts.bridge.renameFolder(f.id, val)
            f.name = val
            this.opts.onFoldersChange?.(this.folders)
          }
          this.renderFilters()
          this.render()
        }

        const cancelRename = () => {
          if (renameDone) return
          renameDone = true
          this.editingFolderId = null
          this.renderFilters()
        }

        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void finishRename()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancelRename()
          }
        })

        input.addEventListener('blur', () => {
          void finishRename()
        })

        this.filterBar.append(input)
        requestAnimationFrame(() => {
          input.focus()
          input.select()
        })
        return
      }

      const isAct = f.id === this.currentFilter
      const chip = el('button', {
        class: `notelist__chip${isAct ? ' notelist__chip--active' : ''}`,
        type: 'button',
        title: f.isSystem ? f.name : `分类：${f.name} (双击重命名，可拖动排序)`,
      }) as HTMLButtonElement

      chip.textContent = f.name

      // 点击切换分类筛选
      chip.addEventListener('click', () => {
        this.currentFilter = f.id
        this.renderFilters()
        this.render()
      })

      // 双击直接触发就地内联重命名
      chip.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        if (f.isSystem) return
        this.editingFolderId = f.id
        this.renderFilters()
      })

      // 右键操作 (重命名、删除)
      chip.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (f.isSystem) return
        this.showFolderContextMenu(e.clientX, e.clientY, f)
      })

      // 拖拽排序与拖入归类
      chip.draggable = true
      chip.addEventListener('dragstart', (e) => {
        this.draggedFolderIndex = idx
        chip.classList.add('is-dragging')
        e.dataTransfer?.setData('application/x-ifolo-folder', String(idx))
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      })

      chip.addEventListener('dragover', (e) => {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        chip.classList.add('is-drag-over')
      })

      chip.addEventListener('dragleave', () => {
        chip.classList.remove('is-drag-over')
      })

      chip.addEventListener('drop', async (e) => {
        e.preventDefault()
        chip.classList.remove('is-drag-over')

        // 场景 A: 拖入笔记卡片归类到该分类
        const noteId = e.dataTransfer?.getData('application/x-ifolo-note')
        if (noteId) {
          const targetFId = f.id === 'all' ? null : f.id
          await this.opts.bridge.setNoteFolder(noteId, targetFId)
          const n = this.notes.find((x) => x.id === noteId)
          if (n) n.folderId = targetFId
          this.opts.onNoteFolderChange?.(noteId, targetFId)
          this.render()
          return
        }

        // 场景 B: 拖拽分类芯片调整顺序并保存
        if (this.draggedFolderIndex !== null && this.draggedFolderIndex !== idx) {
          const [moved] = this.folders.splice(this.draggedFolderIndex, 1)
          this.folders.splice(idx, 0, moved)
          this.draggedFolderIndex = null
          this.renderFilters()
          await this.opts.bridge.saveFoldersOrder(this.folders)
          this.opts.onFoldersChange?.(this.folders)
        }
      })

      chip.addEventListener('dragend', () => {
        chip.classList.remove('is-dragging')
        this.draggedFolderIndex = null
      })

      this.filterBar.append(chip)
    })

    // 新建分类：就地内联输入框 vs ＋ 按钮
    if (this.isCreatingFolder) {
      const addInput = el('input', {
        class: 'notelist__chip notelist__chip--input',
        type: 'text',
        placeholder: '新分类名称',
        title: '回车确认，Esc 取消',
      }) as HTMLInputElement

      let createDone = false
      const finishCreate = async () => {
        if (createDone) return
        createDone = true
        const name = addInput.value.trim()
        this.isCreatingFolder = false
        if (name) {
          const newFolder = await this.opts.bridge.createFolder(name)
          this.folders.push(newFolder)
          this.currentFilter = newFolder.id
          this.opts.onFoldersChange?.(this.folders)
          this.render()
        }
        this.renderFilters()
      }

      const cancelCreate = () => {
        if (createDone) return
        createDone = true
        this.isCreatingFolder = false
        this.renderFilters()
      }

      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void finishCreate()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelCreate()
        }
      })

      addInput.addEventListener('blur', () => {
        void finishCreate()
      })

      this.filterBar.append(addInput)
      requestAnimationFrame(() => {
        addInput.focus()
      })
    } else {
      const addBtn = el('button', {
        class: 'notelist__chip notelist__chip--add',
        type: 'button',
        title: '新建分类',
      }, ['＋']) as HTMLButtonElement

      addBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.isCreatingFolder = true
        this.renderFilters()
      })
      this.filterBar.append(addBtn)
    }
  }

  private showFolderContextMenu(x: number, y: number, folder: FolderItem) {
    this.closeFolderPicker()
    const menu = el('div', {
      class: 'notelist__folder-picker',
      style: `position: fixed; left: ${x}px; top: ${y}px; right: auto; margin: 0;`,
    })

    const renameItem = el('button', {
      class: 'notelist__folder-picker-item',
      type: 'button',
    }, ['重命名'])
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation()
      this.closeFolderPicker()
      this.editingFolderId = folder.id
      this.renderFilters()
    })

    const deleteItem = el('button', {
      class: 'notelist__folder-picker-item',
      style: 'color: var(--danger);',
      type: 'button',
    }, ['删除分类'])
    deleteItem.addEventListener('click', async (e) => {
      e.stopPropagation()
      this.closeFolderPicker()
      if (window.confirm(`确定删除分类「${folder.name}」吗？分类下的笔记将变为未分类。`)) {
        await this.opts.bridge.deleteFolder(folder.id)
        this.folders = this.folders.filter((f) => f.id !== folder.id)
        if (this.currentFilter === folder.id) {
          this.currentFilter = 'all'
        }
        this.notes.forEach((n) => {
          if (n.folderId === folder.id) n.folderId = null
        })
        this.renderFilters()
        this.opts.onFoldersChange?.(this.folders)
        this.render()
      }
    })

    menu.append(renameItem, deleteItem)
    document.body.append(menu)
    this.activePickerEl = menu

    const close = () => {
      this.closeFolderPicker()
      window.removeEventListener('click', close)
    }
    setTimeout(() => window.addEventListener('click', close), 10)
  }
  toggleSearch(force?: boolean, shouldFocus = true) {
    const target = force ?? !this.showSearch
    this.setSearchVisible(target, undefined, target ? shouldFocus : false)
  }

  setSearchVisible(visible: boolean, query?: string, shouldFocus = false) {
    this.showSearch = visible
    setStoredSearchState('list', visible)
    this.searchWrap.style.display = visible ? 'flex' : 'none'
    if (visible) {
      if (query !== undefined) {
        this.searchInput.value = query
        this.searchQuery = query.trim().toLowerCase()
        this.render()
        this.triggerSemanticSearch()
      }
      if (shouldFocus) {
        this.searchInput.focus()
        if (query) {
          this.searchInput.select()
        }
      }
    } else {
      this.searchInput.value = ''
      this.searchQuery = ''
      this.semanticResults.clear()
      this.render()
    }
    this.opts.onSearchToggle?.(visible)
  }

  isSearchVisible(): boolean {
    return this.showSearch
  }

  focusSearch() {
    this.searchInput.focus()
  }

  isFilterVisible(): boolean {
    return this.showFilter
  }

  setFilterVisible(visible: boolean) {
    this.toggleFilter(visible)
  }

  toggleFilter(force?: boolean) {
    this.showFilter = force ?? !this.showFilter
    this.filterBar.style.display = this.showFilter ? 'flex' : 'none'
    this.opts.onFilterToggle?.(this.showFilter)
  }

  setCardKindIconVisible(visible: boolean) {
    this.showCardKindIcon = visible
    this.render()
  }

  private closeFolderPicker() {
    if (this.activePickerEl) {
      this.activePickerEl.remove()
      this.activePickerEl = null
    }
  }


  update(notes: NoteMeta[], activeId: string | null, folders?: FolderItem[]) {
    this.notes = notes
    this.activeId = activeId
    if (folders && folders.length > 0) {
      this.folders = folders.filter((f) => f.id !== 'note')
      this.folders.forEach((f) => {
        if (f.id === 'todo') f.name = '代办笔记'
      })
      this.renderFilters()
    }
    this.render()
  }

  private highlight(text: string, query: string): string {
    if (!query) return escapeHtml(text)
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedQuery})`, 'gi')
    return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>')
  }

  private moveCommandActive(delta: number) {
    if (this.visibleCommands.length === 0) return
    this.activeCmdIndex = (this.activeCmdIndex + delta + this.visibleCommands.length) % this.visibleCommands.length
    const rows = this.listScroll.querySelectorAll('.cmd-row')
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
    this.searchInput.value = ''
    this.searchQuery = ''
    this.render()
    cmd.perform()
  }

  private render() {
    this.dom.classList.toggle('notelist--no-kind', !this.showCardKindIcon)
    this.listScroll.replaceChildren()

    // 命令面板模式：以 / 开头时展示更多选项命令
    if (this.searchQuery.startsWith('/')) {
      this.filterBar.style.display = 'none'
      const cmdQuery = this.searchQuery.slice(1).trim().toLowerCase()
      const allCmds = this.opts.getCommands?.() ?? []
      this.visibleCommands = allCmds.filter(
        (c) => !cmdQuery || c.title.toLowerCase().includes(cmdQuery) || c.id.toLowerCase().includes(cmdQuery),
      )
      if (this.activeCmdIndex >= this.visibleCommands.length) {
        this.activeCmdIndex = Math.max(0, this.visibleCommands.length - 1)
      }

      const metaRow = el('div', { class: 'notelist__meta' }, [
        el('span', {}, [`命令面板 (${this.visibleCommands.length}) · ↑↓ 选择，回车或点击执行`]),
        el('span', { class: 'notelist__pin' }, ['更多选项']),
      ])
      this.listScroll.append(metaRow)

      if (this.visibleCommands.length === 0) {
        const empty = el('div', { class: 'notelist__empty', style: 'padding: 24px 14px;' }, ['无匹配命令'])
        this.listScroll.append(empty)
        return
      }

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
        row.addEventListener('click', () => {
          this.activeCmdIndex = idx
          this.executeActiveCommand()
        })
        this.listScroll.append(row)
      })
      return
    }

    if (this.showFilter) {
      this.filterBar.style.display = 'flex'
    }

    let items = [...this.notes].sort((a, b) => {
      const pA = Boolean(a.isPinned)
      const pB = Boolean(b.isPinned)
      if (pA !== pB) return pA ? -1 : 1
      if (pA && pB) {
        const timeA = a.pinnedAt ?? a.updatedAt
        const timeB = b.pinnedAt ?? b.updatedAt
        return timeB - timeA
      }
      return b.updatedAt - a.updatedAt
    })

    // 关键词与语义过滤
    if (this.searchQuery) {
      if (this.semanticResults.size > 0) {
        items = items.filter((n) =>
          this.semanticResults.has(n.id) ||
          n.title.toLowerCase().includes(this.searchQuery) ||
          (n.snippet && n.snippet.toLowerCase().includes(this.searchQuery)),
        ).sort((a, b) => {
          const scoreA = this.semanticResults.get(a.id)?.score ?? 0
          const scoreB = this.semanticResults.get(b.id)?.score ?? 0
          if (scoreA !== scoreB) return scoreB - scoreA
          return b.updatedAt - a.updatedAt
        })
      } else {
        items = items.filter((n) =>
          n.title.toLowerCase().includes(this.searchQuery) ||
          (n.snippet && n.snippet.toLowerCase().includes(this.searchQuery)),
        )
      }
    }

    // 属性过滤
    if (this.currentFilter === 'todo') {
      items = items.filter((n) => n.hasTodo || hasTodoContent(n.title + '\n' + (n.snippet || '')))
    } else if (this.currentFilter !== 'all') {
      items = items.filter((n) => n.folderId === this.currentFilter)
    }

    if (items.length === 0) {
      const empty = el('div', { class: 'notelist__empty' }, [
        this.searchQuery ? '没有找到匹配的笔记' : '暂无笔记，点击右上角 ＋ 新建',
      ])
      this.listScroll.append(empty)
      return
    }

    // 检索元信息条（原型图 03）
    if (this.searchQuery) {
      const metaRow = el('div', { class: 'notelist__meta' }, [
        el('span', {}, [`${this.notes.length} 条笔记中找到 ${items.length} 条`]),
        el('span', { class: 'notelist__pin' }, ['全部在本地完成']),
      ])
      this.listScroll.append(metaRow)
    }

    let isFirst = true
    for (const note of items) {
      const isActive = note.id === this.activeId
      const semanticMatch = this.semanticResults.get(note.id)
      const isBest = isFirst && semanticMatch && semanticMatch.score >= 0.65
      isFirst = false

      const isPinned = Boolean(note.isPinned)
      const row = el('div', {
        class: `notelist__item${isActive ? ' notelist__item--active' : ''}${isBest ? ' notelist__item--best' : ''}${isPinned ? ' notelist__item--pinned' : ''}${!this.showCardKindIcon ? ' notelist__item--no-kind' : ''}`,
      })
      row.draggable = true
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('application/x-ifolo-note', note.id)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove'
      })

      let iconSpan: HTMLElement | null = null
      if (this.showCardKindIcon) {
        let kindIcon = ICONS.noteDoc
        let kindClass = 'notelist__kind--note'
        if (note.hasTodo || hasTodoContent(note.snippet || '')) {
          kindIcon = ICONS.bell
          kindClass = 'notelist__kind--todo'
        } else if (note.title === '无标题' || note.title.length <= 6) {
          kindIcon = ICONS.lightning
          kindClass = 'notelist__kind--quick'
        }
        iconSpan = el('span', { class: `notelist__kind ${kindClass}`, html: kindIcon })
      }

      const rawTitle = cleanTitle(note.title) || '无标题'
      const titleEl = el('b', { class: 'notelist__title', html: this.highlight(rawTitle, this.searchQuery) })
      const timeEl = el('span', { class: 'notelist__time' }, [formatRelativeTime(note.updatedAt)])

      const topRowChildren: (Node | string)[] = []
      if (iconSpan) topRowChildren.push(iconSpan)
      topRowChildren.push(titleEl)
      if (isPinned) {
        const pinBadge = el('span', { class: 'notelist__pin-badge' }, ['置顶'])
        topRowChildren.push(pinBadge)
      }
      if (semanticMatch && semanticMatch.score > 0.35) {
        const scoreVal = (Math.round(semanticMatch.score * 100) / 100).toFixed(2)
        const scoreBadge = el('span', {
          class: 'notelist__score',
          title: `置信度: ${scoreVal}`,
        }, [scoreVal])
        topRowChildren.push(scoreBadge)
      }
      topRowChildren.push(timeEl)

      const topRow = el('div', { class: 'notelist__top-row' }, topRowChildren)

      const displaySnippet = stripMarkdown(semanticMatch?.matchedText || note.snippet || '空白笔记')
      const snippetEl = el('div', {
        class: 'notelist__snippet',
        html: this.highlight(displaySnippet, this.searchQuery),
      })

      // 提取正文里的标签（例如 #work, #个人, #v1.0）
      const tags = note.tags && note.tags.length > 0 ? note.tags : extractTags(note.title + ' ' + (note.snippet || ''))

      // 操作按钮（归类、置顶、删除）
      const acts = el('div', { class: 'notelist__item-acts' })

      const pinBtn = el('button', {
        class: `notelist__act-btn${isPinned ? ' notelist__act-btn--pinned' : ''}`,
        type: 'button',
        title: isPinned ? '取消置顶' : '置顶笔记',
        html: isPinned
          ? `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H5l.8 3.2L4 9v1h3.5v4.5l.5.5.5-.5V10H12V9l-1.8-1.8L11 4h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-7z"/></svg>`
          : `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3h7M5.5 3l.8 3.8L4.5 9v1h3.5v4.5l.5.5.5-.5V10H11.5V9l-1.8-2.2.8-3.8M5 3v-1h6v1"/></svg>`,
      }) as HTMLButtonElement

      pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const newPinned = !note.isPinned
        note.isPinned = newPinned
        note.pinnedAt = newPinned ? Date.now() : undefined
        await this.opts.bridge.setNotePinned(note.id, newPinned)
        this.opts.onNotePinnedChange?.(note.id, newPinned)
        this.render()
      })
      const delBtn = el('button', {
        class: 'notelist__act-btn notelist__act-btn--danger',
        type: 'button',
        title: '删除笔记',
        html: ICONS.trash,
      }) as HTMLButtonElement

      delBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (window.confirm(`确定将「${note.title}」移入废纸篓吗？`)) {
          this.opts.onDelete(note.id)
        }
      })

      acts.append(pinBtn, delBtn)
      topRow.append(acts)

      row.append(topRow, snippetEl)

      // 渲染归因行（原型图 03）
      if (semanticMatch && this.searchQuery) {
        const reason = semanticMatch.why || `语义匹配「${this.searchQuery}」· 命中相关段落`
        const whyEl = el('div', { class: 'notelist__why' }, [
          el('span', { class: 'notelist__why-dot' }),
          el('span', {}, [reason]),
        ])
        row.append(whyEl)
      }

      // 渲染彩色标签 Chips（原型图 01）
      if (tags.length > 0) {
        const chipsEl = el('div', { class: 'notelist__chips' })
        for (const tag of tags) {
          const colorClass = getTagColorClass(tag)
          const chipEl = el('span', { class: `notelist__chip-tag notelist__chip-tag--${colorClass}` }, [tag])
          chipEl.addEventListener('click', (e) => {
            e.stopPropagation()
            this.searchInput.value = tag
            this.searchQuery = tag.toLowerCase()
            this.render()
          })
          chipsEl.append(chipEl)
        }
        row.append(chipsEl)
      }

      row.addEventListener('click', () => {
        this.opts.onSelect(note.id)
      })

      this.listScroll.append(row)
    }
  }
}

function extractTags(text: string): string[] {
  const matches = text.match(/#[^\s#,]+/g)
  if (!matches) return []
  const unique = Array.from(new Set(matches.map((m) => m.slice(1).trim())))
  return unique.filter((t) => t.length > 0 && t.length <= 16).slice(0, 4)
}

function getTagColorClass(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = (hash << 5) - hash + tag.charCodeAt(i)
  }
  const colors = ['b', 'g', 'w', 'p']
  return colors[Math.abs(hash) % colors.length]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '刚刚'
  const diff = Date.now() - (timestamp > 1e11 ? timestamp : timestamp * 1000)
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  if (days < 30) return `${days} 天前`
  const d = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
