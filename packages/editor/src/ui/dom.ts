/**
 * 图标与 DOM 小工具
 *
 * 全部内联 SVG —— 不用图标字体，也不用图片，避免额外的网络请求与体积。
 * 尺寸统一 16×16 viewBox，由调用方指定渲染尺寸。
 */

export const ICONS = {
  logo: `<img width="19" height="19" alt="iFolo" src="data:image/png;base64,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" />`,

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
