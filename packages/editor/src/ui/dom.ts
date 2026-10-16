/**
 * 图标与 DOM 小工具
 *
 * 全部内联 SVG —— 不用图标字体，也不用图片，避免额外的网络请求与体积。
 * 尺寸统一 16×16 viewBox，由调用方指定渲染尺寸。
 */

export const ICONS = {
  logo: `<img width=\"19\" height=\"19\" alt=\"iFolo\" src=\"data:image/png;base64,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\" />`,

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

  back: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.2L5.2 8l4.8 4.8"/></svg>`,

  list: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h10"/></svg>`,

  noteDoc: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 2.6h5.4L13 6.2v7.2H4z"/><path d="M9.2 2.6v3.8H13"/></svg>`,

  lightning: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M9 2.2 4.4 8.9h3.2l-.6 4.9 4.6-6.7H8.4z"/></svg>`,

  bell: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.6 7.2a3.4 3.4 0 0 1 6.8 0v2.4l1 1.8H3.6l1-1.8z"/><path d="M6.7 12.7a1.4 1.4 0 0 0 2.6 0"/></svg>`,
  spark: `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8 2.6 14 8l-6 5.4L2 8z"/></svg>`,
  chevronUp: `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.5 8 6l4.5 4.5"/></svg>`,
  chevronDown: `<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5.5 8 10l4.5-4.5"/></svg>`,
  globe: `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8a10.5 10.5 0 0 1 0 12.4M8 1.8a10.5 10.5 0 0 0 0 12.4"/></svg>`,
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
