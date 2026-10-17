// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStoredEdgeHoverDelay,
  setStoredEdgeHoverDelay,
  DEFAULT_EDGE_HOVER_DELAY,
  LS_EDGE_HOVER_DELAY,
} from '../storage'
import { SettingsView } from '../ui/settings'

describe('Edge Hover Delay Settings', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns default delay (0.15s / 150ms) when unset', () => {
    expect(getStoredEdgeHoverDelay()).toBe(DEFAULT_EDGE_HOVER_DELAY)
    expect(DEFAULT_EDGE_HOVER_DELAY).toBe(0.15)
  })

  it('stores and retrieves valid hover delay values', () => {
    setStoredEdgeHoverDelay(0.3)
    expect(getStoredEdgeHoverDelay()).toBe(0.3)

    setStoredEdgeHoverDelay(0.08)
    expect(getStoredEdgeHoverDelay()).toBe(0.08)
  })

  it('clamps values below minimum boundary (0.05s / 50ms)', () => {
    setStoredEdgeHoverDelay(0.01)
    expect(getStoredEdgeHoverDelay()).toBe(0.05)
  })

  it('clamps values above maximum boundary (2.0s / 2000ms)', () => {
    setStoredEdgeHoverDelay(5.0)
    expect(getStoredEdgeHoverDelay()).toBe(2.0)
  })

  it('renders hover delay slider in SettingsView and reacts to input', () => {
    const mockBridge = {
      boot: vi.fn(),
      list: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      rename: vi.fn(),
      search: vi.fn(),
      setOpacity: vi.fn(),
      setCardOpacity: vi.fn(),
      setWidth: vi.fn(),
      setStatusBarIcon: vi.fn(),
      closePanel: vi.fn(),
      openFinder: vi.fn(),
      listFolders: vi.fn().mockResolvedValue([]),
      createFolder: vi.fn(),
      renameFolder: vi.fn(),
      deleteFolder: vi.fn(),
      saveFoldersOrder: vi.fn(),
      setNoteFolder: vi.fn(),
      setNotePinned: vi.fn(),
      setEdgeHover: vi.fn(),
      setAutoHide: vi.fn(),
      setEdgeHoverDelay: vi.fn(),
      isNative: false,
    }

    const settingsView = new SettingsView({
      bridge: mockBridge as any,
      onBack: vi.fn(),
      getNotes: () => [],
    })

    const slider = settingsView.dom.querySelector<HTMLInputElement>('input[type="range"][min="50"][max="1000"]')
    expect(slider).not.toBeNull()
    expect(slider?.value).toBe('150')

    const valEl = slider?.parentElement?.querySelector('.slider-val')
    expect(valEl?.textContent).toBe('150ms')

    // 模拟用户拖动滑块至 350ms
    if (slider) {
      slider.value = '350'
      slider.dispatchEvent(new Event('input'))
    }

    expect(valEl?.textContent).toBe('350ms')
    expect(mockBridge.setEdgeHoverDelay).toHaveBeenCalledWith(0.35)
    expect(getStoredEdgeHoverDelay()).toBe(0.35)
  })
})
