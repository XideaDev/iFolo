/* ============================================================================
   iFolo 面板复刻 —— 结构与交互
   ----------------------------------------------------------------------------
   一个 createPanel(root, opts) 就能在任意容器里渲染出可交互的面板。
   状态：list（列表） / editor（编辑器） / search（搜索）；命令面板是叠加层。

   这不是「示意图」，是真的能点的：列表行可切换、⌘K 可开命令面板、⌘L 回列表。
   ========================================================================= */

/* ---------- 图标 ---------- */
const I = {
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="7" cy="7" r="4.3"/><path d="M10.3 10.3 14 14"/></svg>',
  filter: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2.6 4.4h10.8M4.6 8h6.8M6.6 11.6h2.8"/></svg>',
  plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3.4v9.2M3.4 8h9.2"/></svg>',
  doc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 2.6h5.4L13 6.2v7.2H4z"/><path d="M9.2 2.6v3.8H13"/></svg>',
  bolt: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M9 2.2 4.4 8.9h3.2l-.6 4.9 4.6-6.7H8.4z"/></svg>',
  bell: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4.6 7.2a3.4 3.4 0 0 1 6.8 0v2.4l1 1.8H3.6l1-1.8z"/><path d="M6.7 12.7a1.4 1.4 0 0 0 2.6 0"/></svg>',
  link: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.7.7"/><path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.7-.7"/></svg>',
  color: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.6 10.4 7 3.6l3.4 6.8M4.6 8.4h4.8"/><path d="M3 13.6h10" stroke-width="2.2"/></svg>',
  hl: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 13.6h10"/><path d="M6.2 9.4 4.4 11.2l1.8 1.8 1.8-1.8z" fill="currentColor" stroke-linejoin="round"/><path d="M8.6 5.6 11.4 2.8l1.8 1.8-2.8 2.8"/></svg>',
  emo: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5.6"/><path d="M5.9 9.3a2.6 2.6 0 0 0 4.2 0"/><circle cx="6.2" cy="6.4" r=".75" fill="currentColor" stroke="none"/><circle cx="9.8" cy="6.4" r=".75" fill="currentColor" stroke="none"/></svg>',
  list: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3.4 4.6h9.2M3.4 8h9.2M3.4 11.4h9.2"/></svg>',
  glass: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="5.4"/><path d="M8 2.6a5.4 5.4 0 0 0 0 10.8z" fill="currentColor" stroke="none" opacity=".55"/></svg>',
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/></svg>',
}

/* ---------- 品牌标记（与 logo 的三原色几何同构） ---------- */
export const LOGO = `<img width=\"19\" height=\"19\" alt=\"iFolo\" src=\"data:image/png;base64,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\" />`

/* ---------- 演示数据（内容取自真实的 iFolo 笔记） ---------- */
const NOTES = [
  {
    id: 'sync',
    kind: 'n',
    title: '同步层的重构计划',
    time: '刚刚',
    snippet: '把同步拆成「正文」与「附件」两条独立通道。附件走对象存储，正文…',
    tags: [],
  },
  { id: 'n1', kind: 'q', title: '无标题', time: '32 分钟前', snippet: '空白笔记', tags: [] },
  {
    id: 'n2', kind: 'n', title: '好用的快捷键备忘',
    time: '34 分钟前', snippet: '⌥⌘N 呼出面板 · ⌘K 命令面板 · ⌘L 笔记列表', tags: [],
  },
  {
    id: 'n3', kind: 'n', title: '数据库连接池调优',
    time: '1 小时前', snippet: 'pgbouncer 的 transaction 模式在长事务下会退化成 session…',
    tags: [['等等', 'n'], ['333', 'n'], ['444', 'n'], ['快结婚3', 'g']],
  },
  { id: 'n4', kind: 'r', title: '周五前回复法务', time: '1 小时前', snippet: '4444', tags: [] },
  {
    id: 'n5', kind: 'n', title: '周报草稿', time: '2 小时前',
    snippet: '发发发放水电放水电', tags: [],
  },
  {
    id: 'n6', kind: 'n', title: '欢迎使用 iFolo', time: '2 小时前',
    snippet: '把指针移到屏幕右边缘，或按 ⌥⌘N 呼出面板。', tags: [],
  },
  { id: 'n7', kind: 'q', title: '得到的', time: '3 小时前', snippet: '女v', tags: [] },
  { id: 'n8', kind: 'q', title: '计划竣工后', time: '22 小时前', snippet: '…', tags: [] },
]

/* ---------- 编辑器内容（展示全部富文本能力） ---------- */
const DOC = `
  <h1 class="ifp__h1">为什么现在做</h1>
  <p class="ifp__p">当前 <code>Store</code> 把附件内嵌在正文里，一条带 12 张截图的笔记轻松超过 1&nbsp;MB。参考实现把这类笔记直接跳过同步，用户看到的是「内容莫名其妙不同步」。</p>

  <div class="ifp__todo"><span class="ifp__cb done"></span><span class="ifp__line">调研 CRDT 库（Yjs / Automerge）</span><span class="ifp__st done">已完成</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line">把附件抽成独立通道</span><span class="ifp__st ip">进行中</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line">冲突解决 UI</span><span class="ifp__st rv">审核中</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line">迁移脚本：把历史笔记的内嵌图片外置</span><span class="ifp__st td">待办</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line">端到端加密的密钥轮换</span><span class="ifp__st td">待办</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line">自托管中继服务的部署文档</span><span class="ifp__st bk">待办池</span></div>
  <div class="ifp__todo"><span class="ifp__cb"></span><span class="ifp__line cancel">先做只读的 Web 分享页</span><span class="ifp__st cancel">已取消</span></div>

  <h2 class="ifp__h2">关键决策</h2>
  <p class="ifp__p"><b>不引入服务端解密能力。</b>中继只存密文与操作日志，密钥永远不出设备。代价是无法做服务端全文索引，但换来了可以公开宣称的隐私承诺。</p>

  <blockquote class="ifp__quote">如果为了做一个「搜索快一点」的功能而放弃零知识，那这个产品就不值得做。</blockquote>

  <pre class="ifp__code"><span class="c">// 附件走独立通道，不参与 CRDT 合并</span>
<span class="k">func</span> <span class="f">uploadAttachment</span>(_ data: Data, noteId: String)
    <span class="k">async throws</span> -&gt; String {
  <span class="k">let</span> key = <span class="k">try</span> Vault.shared.attachmentKey(<span class="k">for</span>: noteId)
  <span class="k">let</span> sealed = <span class="k">try</span> AES.GCM.seal(data, using: key)
  <span class="k">return try await</span> Relay.shared.put(sealed.combined!)
}</pre>

  <h2 class="ifp__h2">待确认</h2>
  <p class="ifp__p">选 <code>Yjs</code> 还是 <code>Automerge</code> 取决于<b>离线时长</b>的预期。需要先定一个上限：<b>离线多久算异常</b>。</p>
  <p class="ifp__p">参考：<a href="#">CRDT 选型对比</a> · <mark>迁移成本是主要风险</mark> · <s>先做只读分享页</s></p>
`

/* ---------- 小工具 ---------- */
const el = (html) => {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstElementChild
}
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------- 渲染：笔记列表 ---------- */
function renderList() {
  return NOTES.map(
    (n, i) => `
    <div class="ifp__row${i === 0 ? ' on' : ''}" data-note="${n.id}">
      <div class="ifp__rt">
        <span class="ifp__kind ${n.kind}">${n.kind === 'q' ? I.bolt : n.kind === 'r' ? I.bell : I.doc}</span>
        <b>${esc(n.title)}</b>
        <span class="t">${esc(n.time)}</span>
      </div>
      <div class="ifp__rs">${esc(n.snippet)}</div>
      ${
        n.tags.length
          ? `<div class="ifp__tags">${n.tags
              .map(([t, k]) => `<span class="ifp__tag ${k}">${esc(t)}</span>`)
              .join('')}</div>`
          : ''
      }
    </div>`
  ).join('')
}

/* ---------- 渲染：命令面板 ---------- */
const CMDS = [
  { ic: I.plus, title: '新建笔记', kk: '⌘N' },
  { ic: I.list, title: '查看全部笔记列表', kk: '⌘L' },
  { ic: I.search, title: '搜索笔记内容', kk: '⌘F' },
  { ic: I.glass, title: '设置面板透明度为 82%（毛玻璃材质）', kk: '' },
  { ic: I.glass, title: '设置面板透明度为 100%（纯白底色）', kk: '' },
  { ic: I.close, title: '收起 iFolo 面板', kk: 'Esc' },
]
function renderCmd() {
  return `
    <div class="ifp__dim"></div>
    <div class="ifp__cmd">
      <div class="ifp__cmd-in">
        <span class="ifp__cmd-badge">⌘K</span>
        <span class="txt">键入命令或直接搜索笔记…</span>
        <span class="caret"></span>
      </div>
      <div class="ifp__cmd-list">
        ${CMDS.map(
          (c, i) => `
          <div class="ifp__cmd-item${i === 0 ? ' on' : ''}">
            <span class="ic">${c.ic}</span>${esc(c.title)}
            ${c.kk ? `<span class="kk">${c.kk}</span>` : ''}
          </div>`
        ).join('')}
      </div>
    </div>`
}

/* ============================================================================
   createPanel —— 主入口
   ----------------------------------------------------------------------------
   opts: { initial: 'list'|'editor'|'search', height: number,
           toolbar: boolean, interactive: boolean }
   ========================================================================= */
export function createPanel(opts = {}) {
  const {
    initial = 'list',
    height = 620,
    toolbar = true,
    interactive = true,
    tabs = true,
  } = opts

  const root = el(`
    <div class="ifp" role="img" aria-label="iFolo 面板界面">
      <div class="ifp__top">
        <span class="ifp__logo">${LOGO}</span>
        <span class="ifp__title">全部笔记</span>
        <span class="ifp__count">9</span>
        <span class="ifp__acts">
          <span class="ifp__ib" data-act="search" title="搜索">${I.search}</span>
          <span class="ifp__ib" data-act="filter" title="筛选">${I.filter}</span>
          <span class="ifp__ib acc" data-act="new" title="新建">${I.plus}</span>
        </span>
      </div>
      ${
        tabs
          ? `<div class="ifp__tabs">
              <span class="ifp__tab on">同步层的重构计划<i>×</i></span>
              <span class="ifp__tab">数据库连接池<i>×</i></span>
              <span class="ifp__tab add">＋</span>
            </div>`
          : ''
      }
      ${
        toolbar
          ? `<div class="ifp__bar">
              <span class="ifp__blk">正文 ▾</span>
              <span class="ifp__sep"></span>
              <span class="ifp__fmt b">B</span><span class="ifp__fmt i">I</span>
              <span class="ifp__fmt u">U</span><span class="ifp__fmt s">S</span>
              <span class="ifp__fmt mono">&lt;/&gt;</span>
              <span class="ifp__sep"></span>
              <span class="ifp__fmt">${I.link}</span><span class="ifp__fmt">${I.color}</span>
              <span class="ifp__fmt">${I.hl}</span><span class="ifp__fmt">${I.emo}</span>
              <span class="ifp__more">⋯</span>
            </div>`
          : ''
      }
      <div class="ifp__body" style="height:${height}px">
        <div class="ifp__view" data-view="list"><div class="ifp__list">${renderList()}</div></div>
        <div class="ifp__view" data-view="editor"><div class="ifp__doc">${DOC}</div></div>
        <div class="ifp__view" data-view="search" hidden>
          <div class="ifp__search">
            ${I.search}<span>搜索笔记标题、内容或自然语言意图…</span><span class="caret"></span>
            <span class="clr">✕</span>
          </div>
          <div class="ifp__filters">
            <span class="ifp__chip">全部</span>
            <span class="ifp__chip">含待办</span>
            <span class="ifp__chip on">纯笔记</span>
          </div>
          <div class="ifp__hint">9 条笔记中找到 7 条</div>
          <div class="ifp__list">${renderList()}</div>
        </div>
      </div>
      <div class="ifp__status">
        <span><b>⌥⌘N</b> 呼出 · <b>⌘K</b> 命令面板 · <b>⌘L</b> 笔记列表 · <b>/</b> 命令</span>
        <span class="ok"><i></i>已保存</span>
      </div>
    </div>`)

  const views = root.querySelectorAll('[data-view]')
  const topTitle = root.querySelector('.ifp__title')
  const topCount = root.querySelector('.ifp__count')

  function show(name) {
    views.forEach((v) => {
      v.hidden = v.dataset.view !== name
    })
    // 编辑器视图才显示工具栏与标签页
    const bar = root.querySelector('.ifp__bar')
    const tabsEl = root.querySelector('.ifp__tabs')
    if (bar) bar.style.display = name === 'editor' ? '' : 'none'
    if (tabsEl) tabsEl.style.display = name === 'editor' ? '' : 'none'
    topTitle.textContent = name === 'editor' ? '同步层的重构计划' : '全部笔记'
    topCount.style.display = name === 'editor' ? 'none' : ''
    root.querySelectorAll('.ifp__ib').forEach((b) => b.classList.remove('on'))
    if (name === 'search') root.querySelector('[data-act="search"]')?.classList.add('on')
    root.dataset.state = name
  }

  let cmdOpen = false
  function toggleCmd(force) {
    cmdOpen = force === undefined ? !cmdOpen : force
    const old = root.querySelector('.ifp__cmd, .ifp__dim')
    root.querySelectorAll('.ifp__cmd, .ifp__dim').forEach((n) => n.remove())
    if (cmdOpen) {
      const frag = el(`<div>${renderCmd()}</div>`)
      root.querySelector('.ifp__body').append(...frag.children)
    }
  }

  if (interactive) {
    // 列表行 → 打开编辑器
    root.addEventListener('click', (e) => {
      const row = e.target.closest('.ifp__row')
      if (row) {
        root.querySelectorAll('.ifp__row').forEach((r) => r.classList.remove('on'))
        row.classList.add('on')
        if (row.dataset.note === 'sync' || true) show('editor')
        return
      }
      const ib = e.target.closest('.ifp__ib')
      if (ib) {
        const act = ib.dataset.act
        if (act === 'search') show(root.dataset.state === 'search' ? 'list' : 'search')
        if (act === 'new') show('editor')
        return
      }
      const chip = e.target.closest('.ifp__chip')
      if (chip) {
        chip.parentElement.querySelectorAll('.ifp__chip').forEach((c) => c.classList.remove('on'))
        chip.classList.add('on')
        return
      }
      if (e.target.closest('.ifp__dim')) toggleCmd(false)
    })

    // 键盘：⌘K 命令面板 / ⌘L 列表 / ⌘F 搜索 / Esc 关闭
    const onKey = (e) => {
      if (!root.isConnected) {
        document.removeEventListener('keydown', onKey)
        return
      }
      if (root.dataset.focus !== 'on') return
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleCmd() }
      else if (meta && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleCmd(false); show('list') }
      else if (meta && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleCmd(false); show('search') }
      else if (e.key === 'Escape') { toggleCmd(false); show('list') }
    }
    document.addEventListener('keydown', onKey)

    // 只有指针在面板上时才响应全局快捷键，避免抢页面其他快捷键
    root.addEventListener('mouseenter', () => { root.dataset.focus = 'on' })
    root.addEventListener('mouseleave', () => { root.dataset.focus = 'off' })
  }

  show(initial)
  root.__show = show
  root.__toggleCmd = toggleCmd
  return root
}
