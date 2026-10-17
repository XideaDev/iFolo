import { describe, it, expect } from 'vitest'
import { parseMarkdown, serializeDoc, docTitle, hasTodoContent } from '../markdown'
import { statusByMarker } from '../taskstatus'

describe('taskstatus', () => {
  it('correctly maps standard and custom markers', () => {
    expect(statusByMarker(' ').key).toBe('todo')
    expect(statusByMarker('').key).toBe('todo')
    expect(statusByMarker('x').key).toBe('done')
    expect(statusByMarker('X').key).toBe('done')
    expect(statusByMarker('inProgress').key).toBe('inProgress')
    expect(statusByMarker('in-progress').key).toBe('inProgress')
    expect(statusByMarker('in_progress').key).toBe('inProgress')
    expect(statusByMarker('inReview').key).toBe('inReview')
    expect(statusByMarker('in-review').key).toBe('inReview')
    expect(statusByMarker('backlog').key).toBe('backlog')
    expect(statusByMarker('cancelled').key).toBe('cancelled')
  })
})

describe('markdown parsing & serialization', () => {
  it('handles headings, paragraphs, and hr', () => {
    const md = '# 标题 1\n\n## 标题 2\n\n### 标题 3\n\n正文段落。\n\n---\n'
    const doc = parseMarkdown(md)
    expect(doc.childCount).toBe(5)
    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(0).attrs.level).toBe(1)
    expect(doc.child(1).attrs.level).toBe(2)
    expect(doc.child(2).attrs.level).toBe(3)
    expect(doc.child(3).type.name).toBe('paragraph')
    expect(doc.child(4).type.name).toBe('horizontal_rule')

    const serialized = serializeDoc(doc)
    expect(serialized).toBe(md)
  })

  it('handles inline marks (strong, em, code, strikethrough, link)', () => {
    const md = '这是 **粗体** 和 *斜体* 以及 `行内代码` 和 ~~删除线~~ 还有 [链接](https://example.com)。\n'
    const doc = parseMarkdown(md)
    const serialized = serializeDoc(doc)
    expect(serialized).toBe(md)
  })

  it('handles html inline marks (underline, highlight, text_color with semicolon/spaces)', () => {
    const md = '这是 <u>下划线</u> 和 <mark>高亮</mark> 以及 <span style="color:#0965DC">彩色文字</span> 和 <span style="color:#FF0000; ">带分号彩色</span>。\n'
    const doc = parseMarkdown(md)
    const serialized = serializeDoc(doc)
    expect(serialized).toContain('<span style="color:#0965DC">彩色文字</span>')
    expect(serialized).toContain('<span style="color:#FF0000">带分号彩色</span>')
  })

  it('handles standard tasks and custom status tasks', () => {
    const md = '- [ ] 待办任务 1\n- [x] 已完成任务 2\n- [inProgress] 进行中任务 3\n- [inReview] 审核中任务 4\n'
    const doc = parseMarkdown(md)
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('task_list')
    expect(doc.child(0).childCount).toBe(4)

    const serialized = serializeDoc(doc)
    expect(serialized).toBe(md)
  })

  it('handles PRD format hyphenated task status (- [in-progress])', () => {
    const md = '- [in-progress] 正在做的事项\n- [in-review] 审核的事项\n'
    const doc = parseMarkdown(md)
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('task_list')
    expect(doc.child(0).child(0).attrs.status).toBe('inProgress')
    expect(doc.child(0).child(1).attrs.status).toBe('inReview')
  })

  it('handles empty task items (- [ ]) without error', () => {
    const md = '- [ ]\n- [x] \n'
    const doc = parseMarkdown(md)
    expect(doc.childCount).toBe(1)
    expect(doc.child(0).type.name).toBe('task_list')
    expect(doc.child(0).childCount).toBe(2)
  })

  it('handles mixed bullet lists and task lists without dropping either', () => {
    const md = '- [ ] 任务 1\n- 普通项目符号\n- [x] 任务 2\n'
    const doc = parseMarkdown(md)
    // Should split into task_list, bullet_list, task_list
    expect(doc.childCount).toBe(3)
    expect(doc.child(0).type.name).toBe('task_list')
    expect(doc.child(1).type.name).toBe('bullet_list')
    expect(doc.child(2).type.name).toBe('task_list')

    const serialized = serializeDoc(doc)
    expect(serialized).toContain('- [ ] 任务 1')
    expect(serialized).toContain('- 普通项目符号')
    expect(serialized).toContain('- [x] 任务 2')
  })

  it('handles blockquotes and code blocks', () => {
    const md = '> 这是一个引用块\n\n```ts\nconst x = 1\n```\n'
    const doc = parseMarkdown(md)
    expect(doc.childCount).toBe(2)
    expect(doc.child(0).type.name).toBe('blockquote')
    expect(doc.child(1).type.name).toBe('code_block')
    expect(doc.child(1).attrs.lang).toBe('ts')

    const serialized = serializeDoc(doc)
    expect(serialized).toBe(md)
  })

  it('extracts title correctly with docTitle', () => {
    const withHeading = parseMarkdown('# 这是重要标题\n\n内容')
    expect(docTitle(withHeading)).toBe('这是重要标题')

    const withNumberHeading = parseMarkdown('# 2024年年度规划\n\n内容')
    expect(docTitle(withNumberHeading)).toBe('2024年年度规划')

    const withNumberListHeading = parseMarkdown('# 10 个核心技巧\n\n内容')
    expect(docTitle(withNumberListHeading)).toBe('10 个核心技巧')

    const withParagraph = parseMarkdown('这是第一行普通段落文本\n\n第二行')
    expect(docTitle(withParagraph)).toBe('这是第一行普通段落文本')
  })

  it('handles parsing pasted Markdown notes and long clipboard text', () => {
    const pastedMarkdown = `# 项目规划说明书

这是一段很长的文字，包含**粗体**与*斜体*以及\`代码\`。

- [ ] 第一项待办
- [x] 第二项已完成
- [inProgress] 进行中任务

> 这是引用块内容

\`\`\`ts
const x: number = 42
\`\`\`
`
    const doc = parseMarkdown(pastedMarkdown)
    expect(doc.childCount).toBe(5)
    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(0).textContent).toBe('项目规划说明书')
    expect(doc.child(1).type.name).toBe('paragraph')
    expect(doc.child(2).type.name).toBe('task_list')
    expect(doc.child(2).childCount).toBe(3)
    expect(doc.child(3).type.name).toBe('blockquote')
    expect(doc.child(4).type.name).toBe('code_block')

    const serialized = serializeDoc(doc)
    expect(serialized).toContain('# 项目规划说明书')
    expect(serialized).toContain('- [ ] 第一项待办')
    expect(serialized).toContain('- [x] 第二项已完成')
  })

  it('accurately identifies whether content contains todos (hasTodoContent)', () => {
    // 1. 标准任务与复选框
    expect(hasTodoContent('- [ ] 待办事项')).toBe(true)
    expect(hasTodoContent('- [x] 已完成项')).toBe(true)
    expect(hasTodoContent('* [ ] 待办项')).toBe(true)
    expect(hasTodoContent('1. [ ] 序号待办项')).toBe(true)

    // 2. 扩展任务状态
    expect(hasTodoContent('- [inProgress] 正在做的事情')).toBe(true)
    expect(hasTodoContent('- [in-review] 审核中的事项')).toBe(true)
    expect(hasTodoContent('- [backlog] 待办池需求')).toBe(true)
    expect(hasTodoContent('- [cancelled] 已取消事项')).toBe(true)

    // 3. 多段落长文本中后段出现待办
    const longNoteWithTodo = '# 深度架构文档\n\n这是第一段介绍内容。\n\n这是第二段背景说明。\n\n## 实施路径\n\n- [ ] 核心模块重构\n'
    expect(hasTodoContent(longNoteWithTodo)).toBe(true)

    // 4. HTML 任务节点
    expect(hasTodoContent('<li data-type="task_item">任务内容</li>')).toBe(true)
    expect(hasTodoContent('<input type="checkbox" checked />')).toBe(true)

    // 5. 显式标记
    expect(hasTodoContent('TODO: 修复连接池超时')).toBe(true)
    expect(hasTodoContent('# 待办事项清单\n\n今天的工作内容')).toBe(true)

    // 6. 纯笔记不含有待办
    expect(hasTodoContent('# 普通纯笔记\n\n这里只记录学习心得与技术总结，没有任何待办项目。')).toBe(false)
    expect(hasTodoContent('')).toBe(false)
  })

  it('safely handles markdown tables and unsupported tokens without throwing errors', () => {
    const tableMd = '# 表格测试\n\n| 标题 1 | 标题 2 |\n| :--- | :--- |\n| 内容 A | 内容 B |\n| 内容 C | 内容 D |\n\n表格下方正常段落。\n'
    // 验证解析不抛出 "Token type table_open not supported by Markdown parser"
    expect(() => {
      const doc = parseMarkdown(tableMd)
      expect(doc).toBeDefined()
      expect(doc.childCount).toBeGreaterThan(0)
    }).not.toThrow()
  })
})
