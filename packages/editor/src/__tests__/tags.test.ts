import { describe, it, expect } from 'vitest'
import { extractTags, isMcpRelated } from '../storage'

describe('Tags extraction & Automatic MCP Tagging', () => {
  it('extracts double-hash tags (#tag#)', () => {
    const text = '今天的工作记录 #工作汇报# 已经同步给团队。'
    const tags = extractTags(text)
    expect(tags).toContain('工作汇报')
  })

  it('extracts single-hash tags (#tag)', () => {
    const text = '这是普通笔记 #待办事项 稍后处理。'
    const tags = extractTags(text)
    expect(tags).toContain('待办事项')
  })

  it('extracts multiple tags with deduplication', () => {
    const text = '项目规划 #架构# 以及 #前端# 优化，再次强调 #架构#'
    const tags = extractTags(text)
    expect(tags).toEqual(['架构', '前端'])
  })

  it('does not confuse Markdown headings with tags', () => {
    const text = '# 一级大标题\n\n## 二级分类标题\n\n### 三级小结\n\n正文中的 #真实标签#'
    const tags = extractTags(text)
    expect(tags).toEqual(['真实标签'])
    expect(tags).not.toContain('一级大标题')
    expect(tags).not.toContain('二级分类标题')
  })

  it('automatically adds mcp tag for mcp-related notes', () => {
    const text1 = '# Cursor 配置指南\n\n如何通过 Stdio 连接本地 MCP Server 服务'
    expect(isMcpRelated(text1)).toBe(true)
    const tags1 = extractTags(text1)
    expect(tags1).toContain('mcp')

    const text2 = '详细解读 Model Context Protocol 协议规范'
    expect(isMcpRelated(text2)).toBe(true)
    const tags2 = extractTags(text2)
    expect(tags2).toContain('mcp')

    const text3 = '执行 /Applications/iFolo.app/Contents/MacOS/iFolo --mcp'
    expect(isMcpRelated(text3)).toBe(true)
    const tags3 = extractTags(text3)
    expect(tags3).toContain('mcp')
  })

  it('deduplicates mcp tag when note already has #mcp# tag', () => {
    const text = '#mcp# 已经写了标签的 MCP 笔记'
    const tags = extractTags(text)
    const mcpTags = tags.filter((t) => t.toLowerCase() === 'mcp')
    expect(mcpTags.length).toBe(1)
  })

  it('does not add mcp tag to unrelated notes', () => {
    const text = '# 随手记\n\n今天去超市买了苹果和香蕉，晚上准备做饭。'
    expect(isMcpRelated(text)).toBe(false)
    const tags = extractTags(text)
    expect(tags).not.toContain('mcp')
  })
})
