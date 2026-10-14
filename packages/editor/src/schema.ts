/**
 * iFolo 文档模型
 *
 * 节点与标记的定义。设计上刻意保持克制 —— 只做「屏幕边缘笔记」真正需要的结构，
 * 不做通用文档编辑器。每多一个节点，就多一份 Markdown 序列化与跨平台渲染的负担。
 */

import { Schema, NodeSpec, MarkSpec, DOMOutputSpec } from 'prosemirror-model'
import { DEFAULT_STATUS, statusByKey } from './taskstatus'

/** 段落占位符（空文档时显示） */
export const PLACEHOLDER = '随手记点什么…'

const paragraph: NodeSpec = {
  content: 'inline*',
  group: 'block',
  parseDOM: [{ tag: 'p' }],
  toDOM(): DOMOutputSpec {
    return ['p', 0]
  },
}

const heading: NodeSpec = {
  attrs: { level: { default: 1 } },
  content: 'inline*',
  group: 'block',
  defining: true,
  parseDOM: [1, 2, 3].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  toDOM(node): DOMOutputSpec {
    return [`h${node.attrs.level}`, 0]
  },
}

const blockquote: NodeSpec = {
  content: 'block+',
  group: 'block',
  defining: true,
  parseDOM: [{ tag: 'blockquote' }],
  toDOM(): DOMOutputSpec {
    return ['blockquote', 0]
  },
}

const codeBlock: NodeSpec = {
  attrs: { lang: { default: '' } },
  content: 'text*',
  marks: '',
  group: 'block',
  code: true,
  defining: true,
  parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
  toDOM(): DOMOutputSpec {
    return ['pre', ['code', 0]]
  },
}

const horizontalRule: NodeSpec = {
  group: 'block',
  parseDOM: [{ tag: 'hr' }],
  toDOM(): DOMOutputSpec {
    return ['hr']
  },
}

const bulletList: NodeSpec = {
  content: 'list_item+',
  group: 'block',
  parseDOM: [{ tag: 'ul' }],
  toDOM(): DOMOutputSpec {
    return ['ul', 0]
  },
}

const orderedList: NodeSpec = {
  attrs: { order: { default: 1 } },
  content: 'list_item+',
  group: 'block',
  parseDOM: [{ tag: 'ol' }],
  toDOM(node): DOMOutputSpec {
    return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0]
  },
}

const listItem: NodeSpec = {
  content: 'paragraph block*',
  defining: true,
  parseDOM: [{ tag: 'li' }],
  toDOM(): DOMOutputSpec {
    return ['li', 0]
  },
}

/**
 * 任务项 —— 带状态，而不是单纯的勾选框。
 * status 存的是状态 key（见 taskstatus.ts），以纯文本形式写进 Markdown，
 * 因此会随文件一起移动，不依赖任何私有字段。
 */
const taskItem: NodeSpec = {
  attrs: { status: { default: DEFAULT_STATUS } },
  content: 'paragraph block*',
  defining: true,
  parseDOM: [
    {
      tag: 'li[data-status]',
      getAttrs: (dom) => ({ status: (dom as HTMLElement).getAttribute('data-status') || DEFAULT_STATUS }),
    },
  ],
  toDOM(node): DOMOutputSpec {
    return ['li', { 'data-status': node.attrs.status }, 0]
  },
}

const taskList: NodeSpec = {
  content: 'task_item+',
  group: 'block',
  parseDOM: [{ tag: 'ul[data-task-list]' }],
  toDOM(): DOMOutputSpec {
    return ['ul', { 'data-task-list': '' }, 0]
  },
}

const image: NodeSpec = {
  inline: false,
  attrs: { src: {}, alt: { default: null }, title: { default: null } },
  group: 'block',
  draggable: true,
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return { src: el.getAttribute('src'), alt: el.getAttribute('alt'), title: el.getAttribute('title') }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    const { src, alt, title } = node.attrs
    return ['img', { src, alt, title }]
  },
}

const hardBreak: NodeSpec = {
  inline: true,
  group: 'inline',
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM(): DOMOutputSpec {
    return ['br']
  },
}

const text: NodeSpec = { group: 'inline' }

const strong: MarkSpec = {
  parseDOM: [{ tag: 'strong' }, { tag: 'b', getAttrs: (d) => (d as HTMLElement).style.fontWeight !== 'normal' && null }],
  toDOM(): DOMOutputSpec {
    return ['strong', 0]
  },
}

const em: MarkSpec = {
  parseDOM: [{ tag: 'i' }, { tag: 'em' }],
  toDOM(): DOMOutputSpec {
    return ['em', 0]
  },
}

const underline: MarkSpec = {
  parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
  toDOM(): DOMOutputSpec {
    return ['u', 0]
  },
}

const strikethrough: MarkSpec = {
  parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
  toDOM(): DOMOutputSpec {
    return ['s', 0]
  },
}

const code: MarkSpec = {
  parseDOM: [{ tag: 'code' }],
  toDOM(): DOMOutputSpec {
    return ['code', 0]
  },
}

const link: MarkSpec = {
  attrs: { href: {}, title: { default: null } },
  inclusive: false,
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement
        return { href: el.getAttribute('href'), title: el.getAttribute('title') }
      },
    },
  ],
  toDOM(mark): DOMOutputSpec {
    return ['a', { href: mark.attrs.href, title: mark.attrs.title, rel: 'noopener noreferrer' }, 0]
  },
}

/** 文字颜色与高亮：用于「选中气泡」里的颜色与高亮 */
const textColor: MarkSpec = {
  attrs: { color: {} },
  parseDOM: [
    {
      style: 'color',
      getAttrs: (value) => (typeof value === 'string' ? { color: value } : false),
    },
  ],
  toDOM(mark): DOMOutputSpec {
    return ['span', { style: `color: ${mark.attrs.color}` }, 0]
  },
}

const highlight: MarkSpec = {
  attrs: { color: { default: 'var(--orange-200)' } },
  parseDOM: [{ tag: 'mark' }],
  toDOM(): DOMOutputSpec {
    return ['mark', 0]
  },
}

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph,
    heading,
    blockquote,
    code_block: codeBlock,
    horizontal_rule: horizontalRule,
    bullet_list: bulletList,
    ordered_list: orderedList,
    list_item: listItem,
    task_list: taskList,
    task_item: taskItem,
    image,
    hard_break: hardBreak,
    text,
  },
  marks: {
    strong,
    em,
    underline,
    strikethrough,
    code,
    link,
    text_color: textColor,
    highlight,
  },
})

export const nodes = schema.nodes
export const marks = schema.marks

/** 该节点是否是任务项 */
export function isTaskItem(nodeName: string): boolean {
  return nodeName === 'task_item'
}

/** 状态标签（供 UI 显示） */
export function statusLabel(status: string): string {
  return statusByKey(status).label
}
