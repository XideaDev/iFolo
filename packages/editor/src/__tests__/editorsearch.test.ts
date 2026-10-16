import { describe, it, expect, beforeEach } from 'vitest'
import { parseMarkdown } from '../markdown'
import { findMatches, buildDecorations } from '../ui/editorsearch'

describe('editorsearch', () => {
  it('finds matches in markdown doc correctly', () => {
    const md = '# 搜索测试\n\n这是一段测试内容，测试关键字命中。'
    const doc = parseMarkdown(md)
    const matches = findMatches(doc, '测试')
    expect(matches.length).toBe(3)
  })

  it('handles case-insensitive search', () => {
    const md = 'Hello World! hello everyone, HELLO again.'
    const doc = parseMarkdown(md)
    const matches = findMatches(doc, 'hello')
    expect(matches.length).toBe(3)
  })

  it('handles empty query', () => {
    const md = 'Some content here'
    const doc = parseMarkdown(md)
    expect(findMatches(doc, '')).toEqual([])
    expect(findMatches(doc, '   ')).toEqual([])
  })

  it('builds decorations with active highlight', () => {
    const md = 'one two one three one'
    const doc = parseMarkdown(md)
    const matches = findMatches(doc, 'one')
    expect(matches.length).toBe(3)

    const decoSet = buildDecorations(doc, matches, 1)
    const found = decoSet.find()
    expect(found.length).toBe(3)
    const activeDeco = found[1] as unknown as { type: { attrs?: { class?: string } } }
    const normalDeco = found[0] as unknown as { type: { attrs?: { class?: string } } }
    expect(activeDeco.type.attrs?.class).toContain('search-highlight--active')
    expect(normalDeco.type.attrs?.class).not.toContain('search-highlight--active')
  })
})

describe('search state storage', () => {
  const store = new Map<string, string>()
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, val: string) => { store.set(key, val) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
  }

  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    })
  })

  it('defaults to true when not set in storage', async () => {
    const { getStoredSearchState } = await import('../storage')
    expect(getStoredSearchState('list')).toBe(true)
    expect(getStoredSearchState('editor')).toBe(true)
  })

  it('persists and retrieves search state', async () => {
    const { getStoredSearchState, setStoredSearchState } = await import('../storage')
    setStoredSearchState('list', false)
    expect(getStoredSearchState('list')).toBe(false)
    setStoredSearchState('list', true)
    expect(getStoredSearchState('list')).toBe(true)

    setStoredSearchState('editor', false)
    expect(getStoredSearchState('editor')).toBe(false)
    setStoredSearchState('editor', true)
    expect(getStoredSearchState('editor')).toBe(true)
  })
  it('persists and retrieves default UI component toggles (search, filter, nav, card icons)', async () => {
    const {
      isDefaultSearchEnabled,
      setDefaultSearchEnabled,
      isDefaultFilterEnabled,
      setDefaultFilterEnabled,
      isDefaultNavEnabled,
      setDefaultNavEnabled,
      isCardKindIconEnabled,
      setCardKindIconEnabled,
      getStoredSearchState,
    } = await import('../storage')

    // 默认值检查
    expect(isDefaultSearchEnabled()).toBe(true)
    expect(isDefaultFilterEnabled()).toBe(false)
    expect(isDefaultNavEnabled()).toBe(true)

    // 默认开启搜索框开关切换与记忆
    setDefaultSearchEnabled(false)
    expect(isDefaultSearchEnabled()).toBe(false)
    expect(getStoredSearchState('list')).toBe(false)
    setDefaultSearchEnabled(true)
    expect(isDefaultSearchEnabled()).toBe(true)
    expect(getStoredSearchState('list')).toBe(true)

    // 默认开启筛选栏开关切换与记忆
    setDefaultFilterEnabled(true)
    expect(isDefaultFilterEnabled()).toBe(true)
    setDefaultFilterEnabled(false)
    expect(isDefaultFilterEnabled()).toBe(false)

    // 默认开启编辑页导航栏开关切换与记忆
    setDefaultNavEnabled(false)
    expect(isDefaultNavEnabled()).toBe(false)
    setDefaultNavEnabled(true)
    expect(isDefaultNavEnabled()).toBe(true)

    // 卡片前置分类图标默认显示（true），可自由切换与持久化记忆
    expect(isCardKindIconEnabled()).toBe(true)
    setCardKindIconEnabled(false)
    expect(isCardKindIconEnabled()).toBe(false)
    setCardKindIconEnabled(true)
    expect(isCardKindIconEnabled()).toBe(true)
  })

  it('manages folders and note categorization', async () => {
    const { createBridge } = await import('../storage')
    const bridge = createBridge()

    // 默认文件夹
    const initialFolders = await bridge.listFolders()
    expect(initialFolders.length).toBeGreaterThanOrEqual(2)
    expect(initialFolders[0].name).toBe('全部')
    expect(initialFolders[1].name).toBe('代办笔记')
    // 创建文件夹
    const created = await bridge.createFolder('工作计划')
    expect(created.name).toBe('工作计划')
    expect(created.id).toContain('folder-')

    let currentFolders = await bridge.listFolders()
    expect(currentFolders.some((f) => f.name === '工作计划')).toBe(true)

    // 重命名文件夹
    await bridge.renameFolder(created.id, '2024战略工作')
    currentFolders = await bridge.listFolders()
    expect(currentFolders.find((f) => f.id === created.id)?.name).toBe('2024战略工作')

    // 拖动排序保存
    const reordered = [...currentFolders].reverse()
    await bridge.saveFoldersOrder(reordered)
    const loadedAfterReorder = await bridge.listFolders()
    expect(loadedAfterReorder[0].id).toBe(reordered[0].id)

    // 笔记归类
    await bridge.setNoteFolder('note-123', created.id)
    // 删除分类
    await bridge.deleteFolder(created.id)
    const afterDelete = await bridge.listFolders()
    expect(afterDelete.some((f) => f.id === created.id)).toBe(false)
  })

  it('persists and updates status bar icon preference', async () => {
    const { getStoredStatusBarIcon, setStoredStatusBarIcon, createBridge } = await import('../storage')
    expect(getStoredStatusBarIcon()).toBe('notebook')

    setStoredStatusBarIcon('notepad')
    expect(getStoredStatusBarIcon()).toBe('notepad')

    setStoredStatusBarIcon('note')
    expect(getStoredStatusBarIcon()).toBe('note')

    setStoredStatusBarIcon('note-2')
    expect(getStoredStatusBarIcon()).toBe('note-2')

    const bridge = createBridge()
    await bridge.setStatusBarIcon('note')
    expect(getStoredStatusBarIcon()).toBe('note')
  })

  it('manages note pinning and puts pinned notes on top', async () => {
    const { createBridge } = await import('../storage')
    const bridge = createBridge()
    const bootData = await bridge.boot()
    expect(bootData.notes).toBeDefined()
    const target = bootData.notes[0]
    if (target) {
      await bridge.setNotePinned(target.id, true)
      const listAfterPin = await bridge.boot()
      const pinned = listAfterPin.notes.find((n) => n.id === target.id)
      expect(pinned?.isPinned).toBe(true)
      expect(listAfterPin.notes[0].id).toBe(target.id)

      await bridge.setNotePinned(target.id, false)
      const listAfterUnpin = await bridge.boot()
      const unpinned = listAfterUnpin.notes.find((n) => n.id === target.id)
      expect(unpinned?.isPinned).toBe(false)
    }
  })

})
