/**
 * 图标与 DOM 小工具
 *
 * 全部内联 SVG —— 不用图标字体，也不用图片，避免额外的网络请求与体积。
 * 尺寸统一 16×16 viewBox，由调用方指定渲染尺寸。
 */

export const ICONS = {
  logo: `<svg viewBox="0 0 20 20" fill="none"><circle cx="4.8" cy="4.8" r="2.5" fill="#FFA51F"/><rect x="9" y="2.3" width="9" height="3.4" rx="1.7" fill="#E8E8E8"/><rect x="1.9" y="8.5" width="11.7" height="3.7" rx="1.85" fill="#5CA3FF"/><circle cx="10.5" cy="16.2" r="2.5" fill="#69CF3D"/></svg>`,

  search: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3 14 14"/></svg>`,

  filter: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2.6 4.6h10.8M4.6 8h6.8M6.6 11.4h2.8"/></svg>`,

  plus: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>`,

  dots: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><circle cx="3.6" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.4" cy="8" r="1.25"/></svg>`,

  link: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.7.7"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.7-.7"/></svg>`,

  color: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.6 10.4 7 3.6l3.4 6.8M4.6 8.4h4.8"/><path d="M3 13.6h10" stroke-width="2.2"/></svg>`,

  highlight: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 13.6h10"/><path d="M6.2 9.4 4.4 11.2l1.8 1.8 1.8-1.8z" fill="currentColor" stroke-linejoin="round"/><path d="M8.6 5.6 11.4 2.8l1.8 1.8-2.8 2.8"/></svg>`,

  emoji: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5.6"/><path d="M5.9 9.3a2.6 2.6 0 0 0 4.2 0"/><circle cx="6.2" cy="6.4" r=".75" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6.4" r=".75" fill="currentColor" stroke="none"/></svg>`,

  copy: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.6"/><path d="M10.4 3.4H4.2a1.6 1.6 0 0 0-1.6 1.6v6.2"/></svg>`,

  trash: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.4 5.2h9.2M6.4 5.2V3.8h3.2v1.4M4.6 5.2l.7 7.4h5.4l.7-7.4"/></svg>`,

  plusSmall: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>`,

  drag: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="4" r="1.1"/><circle cx="10" cy="4" r="1.1"/><circle cx="6" cy="8" r="1.1"/><circle cx="10" cy="8" r="1.1"/><circle cx="6" cy="12" r="1.1"/><circle cx="10" cy="12" r="1.1"/></svg>`,

  close: `<svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else node.setAttribute(k, v)
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

/** 把一个浮层定位到指定矩形旁边，并夹紧在视口内 */
export function positionMenu(menu: HTMLElement, anchor: DOMRect, preferBelow = true) {
  menu.style.visibility = 'hidden'
  menu.style.left = '0px'
  menu.style.top = '0px'
  document.body.append(menu)

  const rect = menu.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const gap = 4

  let left = anchor.left
  let top = preferBelow ? anchor.bottom + gap : anchor.top - rect.height - gap

  if (left + rect.width > vw - 6) left = vw - rect.width - 6
  if (left < 6) left = 6
  if (top + rect.height > vh - 6) top = anchor.top - rect.height - gap
  if (top < 6) top = 6

  menu.style.left = `${Math.round(left)}px`
  menu.style.top = `${Math.round(top)}px`
  menu.style.visibility = ''
}
