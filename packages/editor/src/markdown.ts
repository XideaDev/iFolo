/**
 * Markdown 双向序列化 —— iFolo 的存储格式
 *
 * Markdown 不是「导出格式之一」，而是唯一真相源。理由：
 *   1. 用户的数据不该被锁在私有格式里
 *   2. 编辑器崩溃或 App 被卸载，笔记仍然可读
 *   3. 跨平台同步时不必定义二进制协议
 *
 * 任务状态用扩展语法，与标准 Markdown 保持兼容：
 *   - [ ]            → todo
 *   - [x]            → done
 *   - [inProgress]   → inProgress（等）
 * 别的编辑器不认识这些扩展状态时，仍能把它当普通列表项读出来。
 */

import MarkdownIt from 'markdown-it'
import { MarkdownSerializer, MarkdownParser } from 'prosemirror-markdown'
import { Node as PMNode, Fragment, Mark } from 'prosemirror-model'
import { schema, nodes, marks } from './schema'
import { statusByKey, statusByMarker } from './taskstatus'

/* ============================================================================
   序列化：文档 → Markdown
   ========================================================================= */

const serializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },

    code_block(state, node) {
      const lang = node.attrs.lang || ''
      state.write('```' + lang + '\n')
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write('```')
      state.closeBlock(node)
    },

    heading(state, node) {
      state.write('#'.repeat(node.attrs.level) + ' ')
      state.renderInline(node)
      state.closeBlock(node)
    },

    horizontal_rule(state, node) {
      state.write('---')
      state.closeBlock(node)
    },

    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ')
    },

    ordered_list(state, node) {
      const start = node.attrs.order || 1
      const maxW = String(start + node.childCount - 1).length
      const space = state.repeat(' ', maxW + 2)
      state.renderList(node, space, (i) => {
        const nStr = String(start + i)
        return state.repeat(' ', maxW - nStr.length) + nStr + '. '
      })
    },

    list_item(state, node) {
      state.renderContent(node)
    },

    // 任务列表：marker 里带上状态，这样状态就写进了纯文本
    task_list(state, node) {
      state.renderList(node, '    ', (i) => {
        const child = node.child(i)
        const marker = statusByKey(child.attrs.status).marker
        return `- [${marker}] `
      })
    },

    task_item(state, node) {
      state.renderContent(node)
    },

    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },

    image(state, node) {
      state.write(
        '![' + state.esc(node.attrs.alt || '') + '](' +
        node.attrs.src.replace(/[()]/g, '\\$&') +
        (node.attrs.title ? ' "' + node.attrs.title.replace(/"/g, '\\"') + '"' : '') +
        ')',
      )
    },

    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },

    text(state, node) {
      state.text(node.text!, false)
    },
  },
  {
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    code: { open: '`', close: '`', escape: false },
    strikethrough: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    // Markdown 没有下划线 / 高亮 / 文字颜色的标准语法，用 HTML 标签承载。
    // 解析侧由下方 html_inline handler 还原。
    underline: { open: '<u>', close: '</u>' },
    highlight: { open: '<mark>', close: '</mark>' },
    link: {
      open() {
        return '['
      },
      close(_state, mark) {
        return '](' + mark.attrs.href + (mark.attrs.title ? ' "' + mark.attrs.title + '"' : '') + ')'
      },
    },
    text_color: {
      open(_state, mark) {
        return `<span style="color:${mark.attrs.color}">`
      },
      close() {
        return '</span>'
      },
    },
  },
)

export function serializeDoc(doc: PMNode): string {
  const text = serializer.serialize(doc, { tightLists: true })
  return text.replace(/\n+$/, '') + '\n'
}

/* ============================================================================
   解析：Markdown → 文档
   ========================================================================= */

const md = new MarkdownIt('default', {
  html: true,       // 需要它来承载 <u> / <mark> / <span style>
  linkify: false,
  typographer: false,
  breaks: false,
})

const parser = new MarkdownParser(schema, md, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: { block: 'bullet_list' },
  ordered_list: { block: 'ordered_list', getAttrs: (tok) => ({ order: +(tok.attrGet('start') ?? 1) }) },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => ({ lang: tok.info || '' }), noCloseToken: true },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') || null,
      alt: (tok.children && tok.children[0] && tok.children[0].content) || null,
    }),
  },
  hardbreak: { node: 'hard_break' },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strikethrough' },
  link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }) },
  code_inline: { mark: 'code', noCloseToken: true },
  // html_inline 的 handler 在下方直接替换（见 tokenHandlers 注入）
  html_inline: { ignore: true },
})

/**
 * 注入 html_inline 处理器。
 *
 * MarkdownParser 的 tokens 配置只支持 {block|node|mark|ignore} 这几种声明式写法，
 * 没有「传一个函数」的出口。但 tokenHandlers 是公开属性，可以直接覆盖 —— 这是
 * 还原 <u> / <mark> / <span style="color:..."> 的唯一可行做法。
 */
const HTML_MARKS: Record<string, { mark: string; open: boolean; attrs?: Record<string, unknown> }> = {
  '<u>': { mark: 'underline', open: true },
  '</u>': { mark: 'underline', open: false },
  '<mark>': { mark: 'highlight', open: true },
  '</mark>': { mark: 'highlight', open: false },
  '<em>': { mark: 'em', open: true },
  '</em>': { mark: 'em', open: false },
  '<strong>': { mark: 'strong', open: true },
  '</strong>': { mark: 'strong', open: false },
  '<s>': { mark: 'strikethrough', open: true },
  '</s>': { mark: 'strikethrough', open: false },
  '<del>': { mark: 'strikethrough', open: true },
  '</del>': { mark: 'strikethrough', open: false },
}

const COLOR_OPEN = /^<span\s+style\s*=\s*["']color\s*:\s*([^"']+)["']\s*>$/i

type ParseState = {
  openMark(mark: Mark): void
  closeMark(type: unknown): void
  addText(text: string): void
}

;(parser as unknown as { tokenHandlers: Record<string, unknown> }).tokenHandlers.html_inline = (
  state: ParseState,
  tok: { content: string },
) => {
  const raw = tok.content.trim()
  const lower = raw.toLowerCase()

  const colorMatch = COLOR_OPEN.exec(raw)
  if (colorMatch) {
    state.openMark(marks.text_color.create({ color: colorMatch[1] }))
    return
  }
  if (lower === '</span>') {
    state.closeMark(marks.text_color)
    return
  }

  const spec = HTML_MARKS[lower]
  if (!spec) return // 其它 HTML 一律忽略，不猜
  const type = marks[spec.mark]
  if (!type) return
  if (spec.open) state.openMark(type.create(spec.attrs ?? {}))
  else state.closeMark(type)
}

/* ---------- 任务项后处理 ----------
   markdown-it 不认识 `- [ ] foo` 这种任务语法，会把它解析成普通列表项，
   段落文本以 `[ ] foo` 开头。这里把它还原成带状态的 task_item。 */

const TASK_PREFIX = /^\[([^\]]{0,16})\]\s+/

function stripPrefix(node: PMNode, prefixLen: number): PMNode {
  if (node.isText) {
    return schema.text(node.text!.slice(prefixLen), node.marks)
  }
  if (node.isLeaf || node.childCount === 0) return node
  const children: PMNode[] = []
  let remaining = prefixLen
  node.forEach((child) => {
    if (remaining > 0) {
      const size = child.isText ? child.text!.length : child.nodeSize
      if (size <= remaining) {
        remaining -= size
        return
      }
      children.push(stripPrefix(child, remaining))
      remaining = 0
    } else {
      children.push(child)
    }
  })
  return node.type.create(node.attrs, Fragment.fromArray(children), node.marks)
}

function toTaskItem(item: PMNode): PMNode | null {
  if (item.type.name !== 'list_item' || item.childCount === 0) return null
  const first = item.firstChild!
  if (first.type.name !== 'paragraph' || first.childCount === 0) return null
  const head = first.firstChild!
  if (!head.isText) return null

  const m = TASK_PREFIX.exec(head.text!)
  if (!m) return null

  const status = statusByMarker(m[1])
  const rest = stripPrefix(first, m[0].length)
  // 内容被清空时补一个空段落，保证 task_item 的 content 合法
  const firstContent = rest.content.size > 0 ? rest : schema.nodes.paragraph.create()

  const blocks: PMNode[] = [firstContent]
  for (let i = 1; i < item.childCount; i++) blocks.push(item.child(i))

  return nodes.task_item.create({ status }, blocks)
}

function convertTasks(node: PMNode): PMNode {
  const children: PMNode[] = []
  node.forEach((child) => children.push(convertTasks(child)))
  if (children.length === 0) return node

  if (node.type.name === 'bullet_list') {
    const converted = children.map(toTaskItem)
    if (converted.length > 0 && converted.every((c): c is PMNode => c !== null)) {
      return nodes.task_list.create(null, converted)
    }
  }

  return node.type.create(node.attrs, Fragment.fromArray(children), node.marks)
}

export function parseMarkdown(text: string): PMNode {
  const doc = parser.parse(text)
  const converted = convertTasks(doc)
  // 文档必须至少有一个块
  if (converted.childCount === 0) {
    return schema.topNodeType.createAndFill()!
  }
  return converted
}

/* ============================================================================
   辅助
   ========================================================================= */

export function emptyDoc(): PMNode {
  return schema.topNodeType.createAndFill()!
}

/** 从文档提取标题：第一个标题节点，或首行的前 40 字 */
export function docTitle(doc: PMNode): string {
  let title = ''
  doc.forEach((node) => {
    if (title) return
    if (node.type.name === 'heading') {
      title = node.textContent
    }
  })
  if (title) return title
  const first = doc.firstChild
  if (!first) return ''
  const raw = first.textContent.trim()
  return raw.length > 40 ? raw.slice(0, 40) + '…' : raw
}
