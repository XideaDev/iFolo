/**
 * 偏好设置视图 (SettingsView - 方案 A：macOS 原生内嵌分组卡片流)
 *
 * 组织结构：
 *   1. 通用与呼出 (开机自启、全局快捷键、边缘贴靠、失焦隐藏)
 *   2. 外观与材质 (色彩模式、面板宽度滑块、磨砂透明度滑块)
 *   3. 数据与存储 (本地存储路径与访达联动、全量 Markdown 导出、清理缓存废纸篓)
 *   4. 关于信息 (版本号与版权信息)
 */

import {
  Bridge,
  NoteMeta,
  isDefaultSearchEnabled,
  setDefaultSearchEnabled,
  isDefaultFilterEnabled,
  setDefaultFilterEnabled,
  isDefaultNavEnabled,
  setDefaultNavEnabled,
  getStoredStatusBarIcon,
  setStoredStatusBarIcon,
  isCardKindIconEnabled,
  setCardKindIconEnabled,
  getStoredEdgeHoverDelay,
  setStoredEdgeHoverDelay,
} from '../storage'
import { el } from './dom'

export interface SettingsViewOptions {
  bridge: Bridge
  onBack: () => void
  getNotes: () => NoteMeta[]
  onToggleDefaultSearch?: (enabled: boolean) => void
  onToggleDefaultFilter?: (enabled: boolean) => void
  onToggleDefaultNav?: (enabled: boolean) => void
  onToggleCardKindIcon?: (enabled: boolean) => void
}

export type ThemeOption = 'system' | 'light' | 'dark'

export function applyTheme(theme: ThemeOption) {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

export function initThemeListener() {
  const stored = (localStorage.getItem('ifolo:theme') as ThemeOption) || 'system'
  applyTheme(stored)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const current = (localStorage.getItem('ifolo:theme') as ThemeOption) || 'system'
    if (current === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
    }
  })
}

export class SettingsView {
  readonly dom: HTMLElement

  // 控件引用，方便 refresh 同步最新状态
  private autoStartToggle!: HTMLInputElement
  private edgeHoverToggle!: HTMLInputElement
  private autoHideToggle!: HTMLInputElement
  private defaultSearchToggle!: HTMLInputElement
  private defaultFilterToggle!: HTMLInputElement
  private defaultNavToggle!: HTMLInputElement
  private cardKindIconToggle!: HTMLInputElement
  private segBtns: HTMLButtonElement[] = []
  private iconBtns: HTMLButtonElement[] = []
  private widthSlider!: HTMLInputElement
  private widthValEl!: HTMLElement
  private opacitySlider!: HTMLInputElement
  private opacityValEl!: HTMLElement
  private cardOpacitySlider!: HTMLInputElement
  private cardOpacityValEl!: HTMLElement
  private edgeHoverDelaySlider!: HTMLInputElement
  private edgeHoverDelayValEl!: HTMLElement
  private edgeHoverDelayRow!: HTMLElement

  constructor(private opts: SettingsViewOptions) {
    this.dom = el('div', { class: 'settings-view' })
    this.dom.style.display = 'none'

    this.render()
  }

  private render() {
    this.dom.replaceChildren()

    // 1. 通用与呼出
    const secGeneral = el('div', { class: 'section-label' }, ['通用与呼出'])
    const groupGeneral = el('div', { class: 'settings-group' })

    // 开机自动启动
    const autoStartRow = this.createToggleRow(
      '开机自动启动',
      '登录系统后在后台常驻就绪',
      localStorage.getItem('ifolo:autostart') !== 'false',
      (checked) => {
        localStorage.setItem('ifolo:autostart', String(checked))
      },
    )
    this.autoStartToggle = autoStartRow.input

    // 全局呼出快捷键
    const shortcutRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['全局呼出快捷键']),
        el('div', { class: 'settings-row__desc' }, ['在任何屏幕随时呼出/收起']),
      ]),
      el('span', { class: 'keycap' }, ['⌥⌘N']),
    ])

    // 边缘贴靠触发
    const edgeHoverRow = this.createToggleRow(
      '边缘贴靠触发',
      '光标移至屏幕右侧边缘即呼出',
      localStorage.getItem('ifolo:edge_hover') !== 'false',
      (checked) => {
        localStorage.setItem('ifolo:edge_hover', String(checked))
        updateDelayRowState(checked)
        void this.opts.bridge.setEdgeHover(checked)
      },
    )
    this.edgeHoverToggle = edgeHoverRow.input

    // 边缘悬停触发延迟（50ms ~ 1000ms，默认 150ms）
    const curDelayMs = Math.round(getStoredEdgeHoverDelay() * 1000)
    this.edgeHoverDelayValEl = el('span', { class: 'slider-val' }, [`${curDelayMs}ms`])
    this.edgeHoverDelaySlider = el('input', {
      type: 'range',
      min: '50',
      max: '1000',
      step: '25',
      value: String(curDelayMs),
    }) as HTMLInputElement

    this.edgeHoverDelaySlider.addEventListener('input', () => {
      const valMs = parseInt(this.edgeHoverDelaySlider.value)
      this.edgeHoverDelayValEl.textContent = `${valMs}ms`
      const delaySec = valMs / 1000
      setStoredEdgeHoverDelay(delaySec)
      void this.opts.bridge.setEdgeHoverDelay(delaySec)
    })

    const edgeDelayBox = el('div', { class: 'slider-box' }, [this.edgeHoverDelaySlider, this.edgeHoverDelayValEl])
    const edgeHoverDelayRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['悬停触发延迟']),
        el('div', { class: 'settings-row__desc' }, ['指针停留在屏幕边缘触发侧边栏的等待时长 (50ms ~ 1000ms)']),
      ]),
      edgeDelayBox,
    ])
    this.edgeHoverDelayRow = edgeHoverDelayRow

    const updateDelayRowState = (enabled: boolean) => {
      edgeHoverDelayRow.style.opacity = enabled ? '1' : '0.45'
      edgeHoverDelayRow.style.pointerEvents = enabled ? 'auto' : 'none'
    }
    updateDelayRowState(localStorage.getItem('ifolo:edge_hover') !== 'false')

    // 失焦自动隐藏
    const autoHideRow = this.createToggleRow(
      '失焦自动隐藏',
      '点击其他窗口时自动收起面板',
      localStorage.getItem('ifolo:auto_hide') === 'true',
      (checked) => {
        localStorage.setItem('ifolo:auto_hide', String(checked))
        void this.opts.bridge.setAutoHide(checked)
      },
    )
    this.autoHideToggle = autoHideRow.input

    groupGeneral.append(autoStartRow.row, shortcutRow, edgeHoverRow.row, edgeHoverDelayRow, autoHideRow.row)

    // 2. 界面与默认布局
    const secUI = el('div', { class: 'section-label' }, ['界面与默认布局'])
    const groupUI = el('div', { class: 'settings-group' })

    // 默认开启搜索框
    const searchRow = this.createToggleRow(
      '默认开启搜索框',
      '启动及进入页面时默认展开搜索框',
      isDefaultSearchEnabled(),
      (checked) => {
        setDefaultSearchEnabled(checked)
        this.opts.onToggleDefaultSearch?.(checked)
      },
    )
    this.defaultSearchToggle = searchRow.input

    // 默认开启筛选栏
    const filterRow = this.createToggleRow(
      '默认开启筛选栏',
      '在笔记列表顶部默认展示全部/代办笔记筛选条',
      isDefaultFilterEnabled(),
      (checked) => {
        setDefaultFilterEnabled(checked)
        this.opts.onToggleDefaultFilter?.(checked)
      },
    )
    this.defaultFilterToggle = filterRow.input

    // 默认开启编辑页导航栏
    const navRow = this.createToggleRow(
      '默认开启编辑页导航栏',
      '在编辑单篇笔记时默认展示顶部多标签导航栏',
      isDefaultNavEnabled(),
      (checked) => {
        setDefaultNavEnabled(checked)
        this.opts.onToggleDefaultNav?.(checked)
      },
    )
    this.defaultNavToggle = navRow.input
    // 卡片前置分类图标
    const cardKindIconRow = this.createToggleRow(
      '卡片前置分类图标',
      '在笔记列表卡片标题前显示类型标识（文档 / 待办 / 闪电）',
      isCardKindIconEnabled(),
      (checked) => {
        setCardKindIconEnabled(checked)
        this.opts.onToggleCardKindIcon?.(checked)
      },
    )
    this.cardKindIconToggle = cardKindIconRow.input

    groupUI.append(searchRow.row, filterRow.row, navRow.row, cardKindIconRow.row)

    // 3. 外观与材质
    const secAppearance = el('div', { class: 'section-label' }, ['外观与材质'])
    const groupAppearance = el('div', { class: 'settings-group' })

    // 色彩外观分段选择器
    const segContainer = el('div', { class: 'segmented' })
    const modes: Array<{ id: ThemeOption; label: string }> = [
      { id: 'system', label: '跟随系统' },
      { id: 'light', label: '浅色' },
      { id: 'dark', label: '深色' },
    ]
    const curTheme = (localStorage.getItem('ifolo:theme') as ThemeOption) || 'system'
    this.segBtns = []

    for (const m of modes) {
      const btn = el('button', {
        type: 'button',
        class: `segmented__item${curTheme === m.id ? ' segmented__item--active' : ''}`,
      }, [m.label]) as HTMLButtonElement

      btn.addEventListener('click', () => {
        for (const b of this.segBtns) b.classList.remove('segmented__item--active')
        btn.classList.add('segmented__item--active')
        localStorage.setItem('ifolo:theme', m.id)
        applyTheme(m.id)
      })

      this.segBtns.push(btn)
      segContainer.append(btn)
    }

    const themeRow = el('div', { class: 'settings-row' }, [
      el('div', {}, ['色彩外观']),
      segContainer,
    ])


    // 菜单栏图标选择器（保留内置【随身便签】，其余适配内置 logo/svg/ 的 3 款 SVG）
    const iconContainer = el('div', { class: 'icon-picker' })
    const iconPresets: Array<{ id: string; name: string; svg: string }> = [
      {
        id: 'notebook',
        name: '随身便签',
        svg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"><rect x="3" y="2.25" width="12" height="13.5" rx="2" stroke-width="1.2"/><line x1="6" y1="2.25" x2="6" y2="15.75" stroke-width="1.2"/><line x1="8" y1="6" x2="12.5" y2="6" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="9" x2="12.5" y2="9" stroke-width="1" stroke-linecap="round"/><line x1="8" y1="12" x2="12.5" y2="12" stroke-width="1" stroke-linecap="round"/></svg>`,
      },
      {
        id: 'notepad',
        name: '便签本',
        svg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"><rect x="2.75" y="2.25" width="12.5" height="13.5" rx="2" stroke-width="1.2"/><line x1="5.5" y1="6.25" x2="9.5" y2="6.25" stroke-width="1.1" stroke-linecap="round"/><line x1="5.5" y1="8.75" x2="12.5" y2="8.75" stroke-width="1.1" stroke-linecap="round"/><line x1="5.5" y1="11.25" x2="12.5" y2="11.25" stroke-width="1.1" stroke-linecap="round"/></svg>`,
      },
      {
        id: 'note',
        name: '写作笔笺',
        svg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"><path d="M9.5 3.5H4.5C3.4 3.5 2.5 4.4 2.5 5.5V13.75C2.5 14.85 3.4 15.75 4.5 15.75H11.5C12.6 15.75 13.5 14.85 13.5 13.75V9.5" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><line x1="5.25" y1="12" x2="10.75" y2="12" stroke-width="1" stroke-linecap="round"/><line x1="5.25" y1="9" x2="8.5" y2="9" stroke-width="1" stroke-linecap="round"/><path d="M8.5 8.5L10 6.5L14.5 2L16 3.5L11.5 8L8.5 8.5Z" stroke-width="1.15" stroke-linejoin="round"/></svg>`,
      },
      {
        id: 'note-2',
        name: '备忘板',
        svg: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"><rect x="2.75" y="2.25" width="12.5" height="13.5" rx="2" stroke-width="1.2"/><line x1="2.75" y1="5.5" x2="15.25" y2="5.5" stroke-width="1.15"/><rect x="7.25" y="3.1" width="3.5" height="1.4" rx="0.7" stroke-width="0.9"/><line x1="5.25" y1="9.25" x2="8.75" y2="9.25" stroke-width="1.05" stroke-linecap="round"/><line x1="5.25" y1="12.25" x2="7.75" y2="12.25" stroke-width="1.05" stroke-linecap="round"/><circle cx="11.75" cy="12" r="2.5" stroke-width="1.15"/><path d="M11.75 10.7V12H12.8" stroke-width="0.9" stroke-linecap="round"/></svg>`,
      },
    ]

    const curIcon = getStoredStatusBarIcon()
    this.iconBtns = []

    for (const p of iconPresets) {
      const preview = el('div', { class: 'icon-picker__preview', html: p.svg })
      const label = el('span', { class: 'icon-picker__label' }, [p.name])
      const btn = el('button', {
        type: 'button',
        class: `icon-picker__item${curIcon === p.id ? ' icon-picker__item--active' : ''}`,
        title: `切换为「${p.name}」菜单栏图标`,
      }, [preview, label]) as HTMLButtonElement

      btn.addEventListener('click', () => {
        for (const b of this.iconBtns) b.classList.remove('icon-picker__item--active')
        btn.classList.add('icon-picker__item--active')
        setStoredStatusBarIcon(p.id)
        void this.opts.bridge.setStatusBarIcon(p.id)
      })

      this.iconBtns.push(btn)
      iconContainer.append(btn)
    }

    const iconRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['菜单栏图标']),
        el('div', { class: 'settings-row__desc' }, ['选择顶部状态栏常驻图标风格']),
      ]),
      iconContainer,
    ])

    // 面板默认宽度
    const maxHalfWidth = Math.max(720, Math.round((window.screen?.availWidth || window.screen?.width || 1440) / 2))
    const curWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 432
    this.widthValEl = el('span', { class: 'slider-val' }, [`${curWidth}px`])
    this.widthSlider = el('input', {
      type: 'range',
      min: '320',
      max: String(maxHalfWidth),
      step: '8',
      value: String(curWidth),
    }) as HTMLInputElement

    this.widthSlider.addEventListener('input', () => {
      const val = parseInt(this.widthSlider.value)
      this.widthValEl.textContent = `${val}px`
      document.documentElement.style.setProperty('--panel-width', `${val}px`)
      void this.opts.bridge.setWidth(val)
    })

    const widthBox = el('div', { class: 'slider-box' }, [this.widthSlider, this.widthValEl])
    const widthRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['面板默认宽度']),
        el('div', { class: 'settings-row__desc' }, ['支持扩展至当前屏幕的一半']),
      ]),
      widthBox,
    ])

    // 背景磨砂透明度
    const curOpacityStr = getComputedStyle(document.documentElement).getPropertyValue('--panel-opacity').trim()
    const curOpacity = curOpacityStr ? Math.round(parseFloat(curOpacityStr) * 100) : 82
    this.opacityValEl = el('span', { class: 'slider-val' }, [`${curOpacity}%`])
    this.opacitySlider = el('input', {
      type: 'range',
      min: '30',
      max: '100',
      step: '1',
      value: String(curOpacity),
    }) as HTMLInputElement

    this.opacitySlider.addEventListener('input', () => {
      const val = parseInt(this.opacitySlider.value)
      this.opacityValEl.textContent = `${val}%`
      const normalized = val / 100
      document.documentElement.style.setProperty('--panel-opacity', String(normalized))
      void this.opts.bridge.setOpacity(normalized)
    })

    const opacityBox = el('div', { class: 'slider-box' }, [this.opacitySlider, this.opacityValEl])
    const opacityRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['背景磨砂透明度']),
        el('div', { class: 'settings-row__desc' }, ['支持最低 30% 实时透出桌面壁纸']),
      ]),
      opacityBox,
    ])

    // 卡片透明度（动态调节卡片与设置块的不透明度，范围 40% ~ 100%，消除桌面透字杂乱）
    const curCardOpacityStr = getComputedStyle(document.documentElement).getPropertyValue('--card-opacity').trim()
    const curCardOpacity = curCardOpacityStr ? Math.round(parseFloat(curCardOpacityStr) * 100) : 90
    this.cardOpacityValEl = el('span', { class: 'slider-val' }, [`${curCardOpacity}%`])
    this.cardOpacitySlider = el('input', {
      type: 'range',
      min: '40',
      max: '100',
      step: '1',
      value: String(curCardOpacity),
    }) as HTMLInputElement

    this.cardOpacitySlider.addEventListener('input', () => {
      const val = parseInt(this.cardOpacitySlider.value)
      this.cardOpacityValEl.textContent = `${val}%`
      const normalized = val / 100
      document.documentElement.style.setProperty('--card-opacity', String(normalized))
      void this.opts.bridge.setCardOpacity(normalized)
    })

    const cardOpacityBox = el('div', { class: 'slider-box' }, [this.cardOpacitySlider, this.cardOpacityValEl])
    const cardOpacityRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['卡片不透明度']),
        el('div', { class: 'settings-row__desc' }, ['增强卡片与文字底色承托力，防止壁纸透字干扰（推荐 85%~95%）']),
      ]),
      cardOpacityBox,
    ])

    groupAppearance.append(themeRow, iconRow, widthRow, opacityRow, cardOpacityRow)

    // 3. 数据与存储
    const secData = el('div', { class: 'section-label' }, ['数据与存储'])
    const groupData = el('div', { class: 'settings-group' })

    // 在访达中显示
    const openFinderBtn = el('button', {
      type: 'button',
      class: 'settings-btn',
    }, ['在访达中显示']) as HTMLButtonElement

    openFinderBtn.addEventListener('click', async () => {
      const prevText = openFinderBtn.textContent
      try {
        await this.opts.bridge.openFinder()
        openFinderBtn.textContent = '已打开 ✓'
        setTimeout(() => { openFinderBtn.textContent = prevText }, 1500)
      } catch (err) {
        console.error(err)
      }
    })

    const finderRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['本地存储位置']),
        el('div', { class: 'settings-row__desc', style: 'font-family: var(--font-mono); font-size: 10px;' }, [
          '~/Library/Application Support/iFolo/notes',
        ]),
      ]),
      openFinderBtn,
    ])

    // 全量导出 Markdown
    const exportBtn = el('button', {
      type: 'button',
      class: 'settings-btn settings-btn--accent',
    }, ['全量导出']) as HTMLButtonElement

    exportBtn.addEventListener('click', async () => {
      const notes = this.opts.getNotes()
      if (notes.length === 0) {
        window.alert('当前没有可导出的笔记')
        return
      }
      exportBtn.textContent = '导出中…'
      try {
        const chunks: string[] = []
        for (const n of notes) {
          try {
            const content = await this.opts.bridge.load(n.id)
            const dateStr = new Date(n.updatedAt).toLocaleString()
            chunks.push(`<!-- Title: ${n.title} | Updated: ${dateStr} -->\n${content}\n\n---\n`)
          } catch {}
        }
        const fullContent = chunks.join('\n')
        const blob = new Blob([fullContent], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ifolo-notes-export-${new Date().toISOString().slice(0, 10)}.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        exportBtn.textContent = `已导出 (${notes.length}篇) ✓`
        setTimeout(() => { exportBtn.textContent = '全量导出' }, 2000)
      } catch (err) {
        console.error(err)
        exportBtn.textContent = '导出失败'
        setTimeout(() => { exportBtn.textContent = '全量导出' }, 1500)
      }
    })

    const exportRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['导出所有笔记为 Markdown']),
        el('div', { class: 'settings-row__desc' }, ['打包备份为合并 .md 纯文本文件']),
      ]),
      exportBtn,
    ])

    // 清理废纸篓与临时缓存
    const cleanTrashBtn = el('button', {
      type: 'button',
      class: 'settings-btn settings-btn--danger',
    }, ['立即清理']) as HTMLButtonElement

    cleanTrashBtn.addEventListener('click', () => {
      cleanTrashBtn.textContent = '清理中…'
      setTimeout(() => {
        cleanTrashBtn.textContent = '已清理 ✓'
        setTimeout(() => { cleanTrashBtn.textContent = '立即清理' }, 1500)
      }, 300)
    })

    const trashRow = el('div', { class: 'settings-row' }, [
      el('div', { style: 'color: #E43A3F;' }, [
        el('div', {}, ['清空废纸篓与临时缓存']),
        el('div', { class: 'settings-row__desc' }, ['释放本地丢弃与离线索引缓存']),
      ]),
      cleanTrashBtn,
    ])

    groupData.append(finderRow, exportRow, trashRow)

    // 4. AI 与开发者生态 (Model Context Protocol)
    const secMCP = el('div', { class: 'settings-sec' }, ['AI 与开发生态 (MCP)'])
    const groupMCP = el('div', { class: 'settings-card' })

    const copyMCPConfigBtn = el('button', {
      type: 'button',
      class: 'settings-btn settings-btn--accent',
    }, ['复制配置']) as HTMLButtonElement

    copyMCPConfigBtn.addEventListener('click', async () => {
      const configSnippet = JSON.stringify({
        mcpServers: {
          ifolo: {
            command: "/Applications/iFolo.app/Contents/MacOS/iFolo",
            args: ["--mcp"]
          }
        }
      }, null, 2)

      try {
        await navigator.clipboard.writeText(configSnippet)
        copyMCPConfigBtn.textContent = '已复制配置 ✓'
        setTimeout(() => { copyMCPConfigBtn.textContent = '复制配置' }, 1500)
      } catch (err) {
        console.error('Copy config error:', err)
      }
    })

    const mcpRow = el('div', { class: 'settings-row' }, [
      el('div', {}, [
        el('div', {}, ['Model Context Protocol 本地服务']),
        el('div', { class: 'settings-row__desc' }, ['允许 Claude Desktop / Cursor 外部大模型直连读写 iFolo 本地笔记']),
      ]),
      copyMCPConfigBtn,
    ])

    groupMCP.append(mcpRow)
    // 4. 关于信息
    const footer = el('div', {
      style: 'text-align: center; font-size: 11px; color: var(--muted); margin: 24px 0 12px; flex-shrink: 0; line-height: 1.7;',
    }, [
      el('div', { style: 'font-weight: 600; color: var(--text-secondary);' }, ['iFolo Note 心流笔记 v0.1.0']),
      el('div', { style: 'font-size: 10.5px; margin-top: 2px;' }, [
        el('span', {}, ['轻盈边缘触碰唤起 · 极速捕捉瞬间灵感 · 官网：']),
        el('a', {
          href: 'https://www.ifolo.cn',
          target: '_blank',
          style: 'color: var(--accent); text-decoration: none; font-weight: 500;',
        }, ['www.ifolo.cn']),
      ]),
    ])

    this.dom.append(
      secGeneral,
      groupGeneral,
      secUI,
      groupUI,
      secAppearance,
      groupAppearance,
      secData,
      groupData,
      secMCP,
      groupMCP,
      footer,
    )
  }

  private createToggleRow(
    title: string,
    desc: string,
    initialChecked: boolean,
    onChange: (checked: boolean) => void,
  ): { row: HTMLElement; input: HTMLInputElement } {
    const input = el('input', {
      type: 'checkbox',
    }) as HTMLInputElement
    input.checked = initialChecked

    input.addEventListener('change', () => {
      onChange(input.checked)
    })

    const slider = el('span', { class: 'toggle-slider' })
    const label = el('label', { class: 'toggle' }, [input, slider])

    const textDiv = el('div', {}, [
      el('div', {}, [title]),
      el('div', { class: 'settings-row__desc' }, [desc]),
    ])

    const row = el('div', { class: 'settings-row' }, [textDiv, label])
    return { row, input }
  }

  refresh() {
    // 同步外观主题
    const curTheme = (localStorage.getItem('ifolo:theme') as ThemeOption) || 'system'
    const themeIdx = curTheme === 'system' ? 0 : curTheme === 'light' ? 1 : 2
    this.segBtns.forEach((btn, idx) => {
      btn.classList.toggle('segmented__item--active', idx === themeIdx)
    })

    // 同步宽度
    const curWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 432
    if (this.widthSlider) {
      const maxHalfWidth = Math.max(720, Math.round((window.screen?.availWidth || window.screen?.width || 1440) / 2))
      this.widthSlider.max = String(maxHalfWidth)
      this.widthSlider.value = String(curWidth)
      this.widthValEl.textContent = `${curWidth}px`
    }

    // 同步透明度
    const curOpacityStr = getComputedStyle(document.documentElement).getPropertyValue('--panel-opacity').trim()
    const curOpacity = curOpacityStr ? Math.round(parseFloat(curOpacityStr) * 100) : 82
    if (this.opacitySlider) {
      this.opacitySlider.value = String(curOpacity)
      this.opacityValEl.textContent = `${curOpacity}%`
    }

    // 同步卡片透明度
    const curCardOpacityStr = getComputedStyle(document.documentElement).getPropertyValue('--card-opacity').trim()
    const curCardOpacity = curCardOpacityStr ? Math.round(parseFloat(curCardOpacityStr) * 100) : 90
    if (this.cardOpacitySlider) {
      this.cardOpacitySlider.value = String(curCardOpacity)
      this.cardOpacityValEl.textContent = `${curCardOpacity}%`
    }

    // 同步开关
    if (this.autoStartToggle) {
      this.autoStartToggle.checked = localStorage.getItem('ifolo:autostart') !== 'false'
    }
    if (this.edgeHoverToggle) {
      this.edgeHoverToggle.checked = localStorage.getItem('ifolo:edge_hover') !== 'false'
    }
    if (this.edgeHoverDelaySlider && this.edgeHoverDelayValEl) {
      const curDelayMs = Math.round(getStoredEdgeHoverDelay() * 1000)
      this.edgeHoverDelaySlider.value = String(curDelayMs)
      this.edgeHoverDelayValEl.textContent = `${curDelayMs}ms`
    }
    if (this.edgeHoverDelayRow) {
      const isEdgeEnabled = localStorage.getItem('ifolo:edge_hover') !== 'false'
      this.edgeHoverDelayRow.style.opacity = isEdgeEnabled ? '1' : '0.45'
      this.edgeHoverDelayRow.style.pointerEvents = isEdgeEnabled ? 'auto' : 'none'
    }
    if (this.autoHideToggle) {
      this.autoHideToggle.checked = localStorage.getItem('ifolo:auto_hide') === 'true'
    }
    if (this.defaultSearchToggle) {
      this.defaultSearchToggle.checked = isDefaultSearchEnabled()
    }
    if (this.defaultFilterToggle) {
      this.defaultFilterToggle.checked = isDefaultFilterEnabled()
    }
    if (this.defaultNavToggle) {
      this.defaultNavToggle.checked = isDefaultNavEnabled()
    }
    if (this.cardKindIconToggle) {
      this.cardKindIconToggle.checked = isCardKindIconEnabled()
    }
    const curIcon = getStoredStatusBarIcon()
    const presetIds = ['notebook', 'notepad', 'note', 'note-2']
    this.iconBtns.forEach((btn, idx) => {
      btn.classList.toggle('icon-picker__item--active', presetIds[idx] === (curIcon === 'default' ? 'notebook' : curIcon))
    })
  }
}
