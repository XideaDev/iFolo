/**
 * 面板宽度调节器
 *
 * 位于面板左边缘（宽度 6px，鼠标悬浮呈现 ew-resize）。
 * 拖动时计算新宽度并限制在 360px ~ 520px，通知外壳与 CSS 自定义属性。
 */

export class PanelResizer {
  readonly dom: HTMLElement
  private isDragging = false
  private startX = 0
  private startWidth = 432
  private currentWidth = 432

  private getMaxWidth(): number {
    const screenW = window.screen?.availWidth || window.screen?.width || 1440
    return Math.max(720, Math.round(screenW / 2))
  }

  constructor(
    private onResize: (width: number) => void,
    private onResizeEnd: (width: number) => void,
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'panel-resizer'
    this.dom.title = '拖动调节面板宽度 (320px ~ 屏幕一半)'

    this.dom.addEventListener('mousedown', this.onMouseDown)
  }

  private onMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    this.isDragging = true
    this.startX = e.screenX
    this.startWidth = window.innerWidth
    this.currentWidth = this.startWidth
    document.body.classList.add('is-resizing')

    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return
    // 面板挂在屏幕右侧，向左拖 (screenX 变小) 意味着面板宽度增加
    const delta = this.startX - e.screenX
    const maxW = this.getMaxWidth()
    const nextWidth = Math.min(maxW, Math.max(320, Math.round(this.startWidth + delta)))
    if (nextWidth !== this.currentWidth) {
      this.currentWidth = nextWidth
      document.documentElement.style.setProperty('--panel-width', `${nextWidth}px`)
      this.onResize(nextWidth)
    }
  }

  private onMouseUp = (e: MouseEvent) => {
    if (!this.isDragging) return
    this.isDragging = false
    document.body.classList.remove('is-resizing')
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)

    const delta = this.startX - e.screenX
    const maxW = this.getMaxWidth()
    const finalWidth = Math.min(maxW, Math.max(320, Math.round(this.startWidth + delta)))
    this.onResizeEnd(finalWidth)
  }

  destroy() {
    this.dom.remove()
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }
}
