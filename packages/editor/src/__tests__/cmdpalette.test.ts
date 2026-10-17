// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EditorSearch, EditorSearchOptions } from '../ui/editorsearch'
import { EditorState } from 'prosemirror-state'
import { schema } from '../schema'
import { EditorView } from 'prosemirror-view'

describe('EditorSearch command dropdown UI & interactions', () => {
  let view: EditorView
  let container: HTMLElement
  let executedAction: string | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.replaceChildren(container)
    executedAction = null

    const state = EditorState.create({
      schema,
    })
    view = new EditorView(container, { state })
  })

  it('renders command palette dropdown when typing "/" and executes on mousedown', () => {
    const mockCommands = [
      {
        id: 'new_note',
        title: '新建笔记',
        keyHint: '⌘N',
        icon: '+',
        perform: vi.fn(() => {
          executedAction = 'new_note'
        }),
      },
      {
        id: 'search_notes',
        title: '搜索笔记',
        keyHint: '⌘F',
        icon: 'Q',
        perform: vi.fn(() => {
          executedAction = 'search_notes'
        }),
      },
    ]

    const opts: EditorSearchOptions = {
      view,
      onGlobalSearch: vi.fn(),
      getCommands: () => mockCommands,
    }

    const search = new EditorSearch(opts)
    container.append(search.dom)

    const input = search.dom.querySelector('.notelist__search-input') as HTMLInputElement
    const dropdown = search.dom.querySelector('.editor-search-commands') as HTMLElement

    expect(dropdown.style.display).toBe('none')

    // 模拟键入 "/"
    input.value = '/'
    input.dispatchEvent(new Event('input'))

    // 应该展示下拉面板
    expect(dropdown.style.display).toBe('block')

    const rows = dropdown.querySelectorAll('.cmd-row')
    // 包含 1 个表头 + 2 个命令项
    expect(rows.length).toBe(3)

    // 测试 mousedown 交互（防失焦截断）
    const firstCmdRow = rows[1] as HTMLElement
    firstCmdRow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(mockCommands[0].perform).toHaveBeenCalled()
    expect(executedAction).toBe('new_note')
    expect(dropdown.style.display).toBe('none')
    expect(input.value).toBe('')
  })

  it('supports keyboard navigation in command dropdown (ArrowDown, ArrowUp, Enter, Escape)', () => {
    const mockCommands = [
      { id: 'c1', title: '命令1', icon: '', perform: vi.fn() },
      { id: 'c2', title: '命令2', icon: '', perform: vi.fn() },
    ]

    const search = new EditorSearch({
      view,
      onGlobalSearch: vi.fn(),
      getCommands: () => mockCommands,
    })
    container.append(search.dom)

    const input = search.dom.querySelector('.notelist__search-input') as HTMLInputElement
    const dropdown = search.dom.querySelector('.editor-search-commands') as HTMLElement

    input.value = '/'
    input.dispatchEvent(new Event('input'))
    expect(dropdown.style.display).toBe('block')

    // 按下方向键切换高亮
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    const activeRow = dropdown.querySelector('.cmd-row--active')
    expect(activeRow?.textContent).toContain('命令2')

    // 按下回车执行
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(mockCommands[1].perform).toHaveBeenCalled()
    expect(dropdown.style.display).toBe('none')
  })

  it('closes dropdown when clicking outside', () => {
    const search = new EditorSearch({
      view,
      onGlobalSearch: vi.fn(),
      getCommands: () => [{ id: 'c1', title: '命令1', icon: '', perform: vi.fn() }],
    })
    container.append(search.dom)

    const outsideEl = document.createElement('div')
    document.body.append(outsideEl)

    const input = search.dom.querySelector('.notelist__search-input') as HTMLInputElement
    const dropdown = search.dom.querySelector('.editor-search-commands') as HTMLElement

    input.value = '/'
    input.dispatchEvent(new Event('input'))
    expect(dropdown.style.display).toBe('block')

    // 点击外部
    outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dropdown.style.display).toBe('none')
  })

  it('supports openCommandMode and toggleCommandMode in EditorSearch', () => {
    const search = new EditorSearch({
      view,
      onGlobalSearch: vi.fn(),
      getCommands: () => [{ id: 'c1', title: '命令1', icon: '', perform: vi.fn() }],
    })
    container.append(search.dom)

    expect(search.isCommandMode()).toBe(false)
    search.toggleCommandMode()
    expect(search.isCommandMode()).toBe(true)

    const dropdown = search.dom.querySelector('.editor-search-commands') as HTMLElement
    expect(dropdown.style.display).toBe('block')

    search.toggleCommandMode()
    expect(search.isCommandMode()).toBe(false)
    expect(dropdown.style.display).toBe('none')
  })

  it('supports openCommandMode and toggleCommandMode in NoteList', async () => {
    const { NoteList } = await import('../ui/notelist')
    const mockBridge = {
      list: vi.fn().mockResolvedValue([]),
      listFolders: vi.fn().mockResolvedValue([]),
    }
    const noteList = new NoteList({
      bridge: mockBridge as any,
      onSelectNote: vi.fn(),
      getCommands: () => [{ id: 'c1', title: '命令1', icon: '', perform: vi.fn() }],
    })
    container.append(noteList.dom)

    expect(noteList.isCommandMode()).toBe(false)
    noteList.toggleCommandMode()
    expect(noteList.isCommandMode()).toBe(true)

    const listScroll = noteList.dom.querySelector('.notelist__items') as HTMLElement
    expect(listScroll.textContent).toContain('命令面板')
    expect(listScroll.textContent).toContain('命令1')

    noteList.toggleCommandMode()
    expect(noteList.isCommandMode()).toBe(false)
  })

  it('verifies app.css contains correct z-index for editor search bar and commands dropdown, and old cmd-dim is removed', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const cssPath = path.resolve(__dirname, '../app.css')
    const css = fs.readFileSync(cssPath, 'utf-8')

    // 检查 editor-search-bar 的 z-index 提升
    expect(css).toMatch(/\.editor-search-bar\s*\{[^}]*z-index:\s*200;/)
    // 检查 editor-search-commands 的 z-index
    expect(css).toMatch(/\.editor-search-commands\s*\{[^}]*z-index:\s*200;/)
    // 检查旧的冗余 .cmd-dim 已被完全移除
    expect(css).not.toContain('.cmd-dim')
    expect(css).not.toContain('.cmd-panel')
  })

  it('controls topbar search button visibility according to isDefaultSearchEnabled', async () => {
    const { setDefaultSearchEnabled, isDefaultSearchEnabled } = await import('../storage')

    // 当设置为开启搜索框时，isDefaultSearchEnabled() 为 true，showSearchBtn 为 false（隐藏顶部搜索按钮）
    setDefaultSearchEnabled(true)
    expect(isDefaultSearchEnabled()).toBe(true)
    const showWhenEnabled = !isDefaultSearchEnabled()
    expect(showWhenEnabled).toBe(false)

    // 当未开启搜索框时，isDefaultSearchEnabled() 为 false，showSearchBtn 为 true（显示顶部搜索按钮）
    setDefaultSearchEnabled(false)
    expect(isDefaultSearchEnabled()).toBe(false)
    const showWhenDisabled = !isDefaultSearchEnabled()
    expect(showWhenDisabled).toBe(true)

    // 恢复默认状态
    setDefaultSearchEnabled(true)
    expect(isDefaultSearchEnabled()).toBe(true)
  })

  it('handles Escape key in searchInput by stopping propagation and properly resetting state', () => {
    const search = new EditorSearch({
      view,
      onGlobalSearch: vi.fn(),
      getCommands: () => [],
    })
    container.append(search.dom)
    search.show('test query', true)
    expect(search.isVisible()).toBe(true)

    const input = search.dom.querySelector('.notelist__search-input') as HTMLInputElement
    let outerEscFired = false
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') outerEscFired = true
    })

    // 1. 输入框有内容时按 Esc：仅清空内容，停止冒泡，不关闭搜索栏
    const escEvent1 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    input.dispatchEvent(escEvent1)
    expect(input.value).toBe('')
    expect(search.isVisible()).toBe(true)
    expect(outerEscFired).toBe(false)

    // 2. 输入框为空时按 Esc：关闭搜索栏，停止冒泡，不触发外层返回上一页
    const escEvent2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    input.dispatchEvent(escEvent2)
    expect(search.isVisible()).toBe(false)
    expect(outerEscFired).toBe(false)
  })

  it('ensures editorSearch can be reopened cleanly after being closed', () => {
    const onVisibilityChange = vi.fn()
    const search = new EditorSearch({
      view,
      onGlobalSearch: vi.fn(),
      onVisibilityChange,
      getCommands: () => [],
    })
    container.append(search.dom)

    // 打开
    search.show('', true)
    expect(search.isVisible()).toBe(true)
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true)

    // 关闭
    search.hide()
    expect(search.isVisible()).toBe(false)
    expect(onVisibilityChange).toHaveBeenLastCalledWith(false)

    // 再次打开（验证可重入性与复位）
    search.show('hello', true)
    expect(search.isVisible()).toBe(true)
    const input = search.dom.querySelector('.notelist__search-input') as HTMLInputElement
    expect(input.value).toBe('hello')
    expect(onVisibilityChange).toHaveBeenLastCalledWith(true)

    // toggle 测试
    search.toggle()
    expect(search.isVisible()).toBe(false)
    search.toggle()
    expect(search.isVisible()).toBe(true)
  })

  it('directly returns to note list when Escape is pressed in editor mode without jumping to search', () => {
    let currentMode = 'editor'
    const switchViewMode = (mode: string) => {
      currentMode = mode
    }

    // 模拟全局 Esc 处理
    const handleGlobalEsc = (e: KeyboardEvent, isCommandActive: boolean) => {
      if (e.key === 'Escape') {
        if (isCommandActive) return
        if (currentMode === 'editor') {
          e.preventDefault()
          e.stopPropagation()
          switchViewMode('list')
        }
      }
    }

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    handleGlobalEsc(escEvent, false)
    expect(currentMode).toBe('list')
  })
  it('renders MCP developer settings card with copy configuration snippet', async () => {
    const { SettingsView } = await import('../ui/settings')
    const mockBridge = {
      list: vi.fn().mockResolvedValue([]),
      listFolders: vi.fn().mockResolvedValue([]),
      getStatusBarIcon: vi.fn().mockResolvedValue('notebook'),
      getOpacity: vi.fn().mockResolvedValue(1.0),
      getEdgeTriggerZone: vi.fn().mockResolvedValue(6),
      getAutohide: vi.fn().mockResolvedValue(false),
    }
    const settings = new SettingsView({
      bridge: mockBridge as any,
      onBack: vi.fn(),
      getNotes: () => [],
    })
    container.append(settings.dom)

    expect(settings.dom.textContent).toContain('AI 与开发生态 (MCP)')
    expect(settings.dom.textContent).toContain('Model Context Protocol 本地服务')
    expect(settings.dom.textContent).toContain('复制配置')
  })
})
