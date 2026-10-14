/**
 * 斜杠命令
 *
 * 在编辑器里输入 `/` 唤出命令列表，继续输入过滤。
 * 命令定义与插件状态放在一起 —— 菜单 UI 只负责渲染 plugin state。
 */

import { Plugin, PluginKey, EditorState, Transaction, Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { nodes } from './schema'
import { DEFAULT_STATUS } from './taskstatus'

export interface SlashCommand {
  id: string
  name: string
  desc: string
  glyph: string
  /** 用于过滤的额外关键词（拼音首字母也放这里） */
  keywords: string[]
  run: Command
}

/* ---------------------------------------------------------------------------
   命令实现
   ------------------------------------------------------------------------- */

/** 把当前段落包成一个任务列表项 */
function makeTask(status: string): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    if ($from.parent.type.name !== 'paragraph') return false
    const item = nodes.task_item.create({ status }, $from.parent)
    const list = nodes.task_list.create(null, item)
    if (dispatch) {
      const tr = state.tr.replaceRangeWith($from.before(), $from.after(), list)
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

/** 插入分隔线，并保证后面还有一个可输入的段落 */
const insertDivider: Command = (state, dispatch) => {
  const { $from } = state.selection
  const type = $from.parent.type
  if (!type.isTextblock) return false
  if (dispatch) {
    const hr = nodes.horizontal_rule.create()
    const para = type.createAndFill()
    if (!para) return false
    const tr = state.tr.replaceSelectionWith(hr)
    tr.insert(tr.selection.to, para)
    tr.setSelection(state.selection.constructor as never)
    dispatch(tr.scrollIntoView())
  }
  return true
}

const insertImage: Command = (state, dispatch) => {
  const src = window.prompt('图片地址：')
  if (!src) return false
  if (dispatch) {
    const node = nodes.image.create({ src, alt: null, title: null })
    dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
  }
  return true
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'task',
    name: '任务列表',
    desc: '带状态的任务，可推进到进行中 / 已完成',
    glyph: '☑',
    keywords: ['todo', 'task', 'renwu', 'rw'],
    run: makeTask(DEFAULT_STATUS),
  },
  {
    id: 'check',
    name: '核对清单',
    desc: '简单的勾选列表',
    glyph: '✓',
    keywords: ['check', 'list', 'qingdan', 'qd'],
    run: makeTask('todo'),
  },
  {
    id: 'h1',
    name: '标题 1',
    desc: '大号章节标题',
    glyph: 'H1',
    keywords: ['h1', 'title', 'biaoti', 'bt'],
    run: setBlockType(nodes.heading, { level: 1 }),
  },
  {
    id: 'h2',
    name: '标题 2',
    desc: '中号章节标题',
    glyph: 'H2',
    keywords: ['h2', 'title', 'biaoti', 'bt'],
    run: setBlockType(nodes.heading, { level: 2 }),
  },
  {
    id: 'h3',
    name: '标题 3',
    desc: '小号章节标题',
    glyph: 'H3',
    keywords: ['h3', 'title', 'biaoti', 'bt'],
    run: setBlockType(nodes.heading, { level: 3 }),
  },
  {
    id: 'bullet',
    name: '项目符号列表',
    desc: '无序列表',
    glyph: '•',
    keywords: ['bullet', 'ul', 'list', 'liebiao', 'lb'],
    run: wrapInList(nodes.bullet_list),
  },
  {
    id: 'ordered',
    name: '编号列表',
    desc: '有序列表',
    glyph: '1.',
    keywords: ['ordered', 'ol', 'number', 'bianhao', 'bh'],
    run: wrapInList(nodes.ordered_list),
  },
  {
    id: 'code',
    name: '代码块',
    desc: '等宽字体，带语法高亮',
    glyph: '</>',
    keywords: ['code', 'daima', 'dm'],
    run: setBlockType(nodes.code_block, { lang: '' }),
  },
  {
    id: 'quote',
    name: '引用',
    desc: '记下一段引用',
    glyph: '❝',
    keywords: ['quote', 'yinyong', 'yy'],
    run: wrapIn(nodes.blockquote),
  },
  {
    id: 'divider',
    name: '分隔线',
    desc: '在视觉上分隔区块',
    glyph: '—',
    keywords: ['divider', 'hr', 'line', 'fengexian', 'fgx'],
    run: insertDivider,
  },
  {
    id: 'image',
    name: '图像',
    desc: '从这台 Mac 插入',
    glyph: '▣',
    keywords: ['image', 'img', 'picture', 'tupian', 'tp'],
    run: insertImage,
  },
]

/* ---------------------------------------------------------------------------
   插件状态
   ------------------------------------------------------------------------- */

export interface SlashState {
  active: boolean
  /** `/` 的位置 */
  from: number
  /** 光标位置 */
  to: number
  query: string
  index: number
  items: SlashCommand[]
}

export const slashKey = new PluginKey<SlashState>('ifolo-slash')

const INACTIVE: SlashState = { active: false, from: 0, to: 0, query: '', index: 0, items: [] }

/** 匹配光标前的 `/查询词`；要求 `/` 位于行首或空白之后 */
const TRIGGER = /(?:^|\s)\/([\p{L}\p{N}_-]*)$/u

export function matchSlash(state: EditorState): { from: number; to: number; query: string } | null {
  const { $from, empty } = state.selection
  if (!empty) return null
  if (!$from.parent.isTextblock) return null
  if ($from.parent.type.name === 'code_block') return null

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const m = TRIGGER.exec(textBefore)
  if (!m) return null

  const query = m[1]
  const to = $from.pos
  const from = to - query.length - 1
  return { from, to, query }
}

export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.id.includes(q) ||
      c.keywords.some((k) => k.includes(q)),
  )
}

function compute(state: EditorState, index: number): SlashState {
  const hit = matchSlash(state)
  if (!hit) return INACTIVE
  const items = filterCommands(hit.query)
  if (items.length === 0) return { ...INACTIVE, active: true, from: hit.from, to: hit.to, query: hit.query }
  return {
    active: true,
    from: hit.from,
    to: hit.to,
    query: hit.query,
    index: Math.max(0, Math.min(index, items.length - 1)),
    items,
  }
}

export function slashPlugin(): Plugin<SlashState> {
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => INACTIVE,
      apply(tr: Transaction, prev: SlashState, _old: EditorState, newState: EditorState) {
        // 鼠标点击等外部改动导致失焦时直接收起
        if (!tr.docChanged && !tr.selectionSet) return prev
        return compute(newState, tr.getMeta(slashKey)?.index ?? prev.index)
      },
    },
    props: {
      handleKeyDown(view, event) {
        const st = slashKey.getState(view.state)
        if (!st?.active) return false

        if (event.key === 'Escape') {
          view.dispatch(view.state.tr.setMeta(slashKey, { dismiss: true }))
          // 用一次空事务把状态刷成 inactive
          requestAnimationFrame(() => {
            view.dispatch(view.state.tr.setMeta(slashKey, { index: 0 }))
          })
          return true
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const dir = event.key === 'ArrowDown' ? 1 : -1
          const count = st.items.length || 1
          const index = (st.index + dir + count) % count
          view.dispatch(view.state.tr.setMeta(slashKey, { index }))
          return true
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const cmd = st.items[st.index]
          if (!cmd) return false
          runSlashCommand(view, st, cmd)
          return true
        }
        return false
      },
    },
  })
}

export function runSlashCommand(view: EditorView, st: SlashState, cmd: SlashCommand) {
  // 先删掉 `/查询词`，再执行命令
  const tr = view.state.tr.delete(st.from, st.to)
  view.dispatch(tr)
  cmd.run(view.state, view.dispatch, view)
  view.focus()
}

export function dismissSlash(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(slashKey, { index: 0 }))
}
