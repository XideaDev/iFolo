/**
 * iFolo 自动化像素级抓屏与对比脚本
 *
 * 1. 启动轻量静态服务托管原型 HTML 与已构建的前端应用
 * 2. 使用本地 Google Chrome (Retina 2x scale) 模拟无头环境
 * 3. 分别针对 4 个核心界面抓取原型画面与真实渲染画面
 * 4. 保存截图至 output/screenshots 目录，并生成对比报告
 */

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = path.resolve(ROOT, 'output/screenshots')
const ARTIFACT_DIR = '/Users/jenson/.gemini/antigravity/brain/452d9920-a80e-46a9-88ab-858a280b2521/screenshots'
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

async function saveScreenshot(el, filename) {
  const p1 = path.join(OUT_DIR, filename)
  const p2 = path.join(ARTIFACT_DIR, filename)
  await el.screenshot({ path: p1 })
  fs.copyFileSync(p1, p2)
}

// 1. 本地轻量静态服务器
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.join(ROOT, reqPath)
  if (reqPath === '/') {
    filePath = path.join(ROOT, 'packages/editor/dist/index.html')
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

async function startServer() {
  return new Promise((resolve) => {
    server.listen(4199, () => {
      console.log('静态服务已启动: http://localhost:4199')
      resolve()
    })
  })
}

// 2. 原型测试笔记数据
const PROTOTYPE_NOTES = {
  'note-1': `# Launch plan #work #v1.0

Move token refresh out of \`AppDelegate\` — it races the keychain unlock on cold start.

\`\`\`swift
// 改成串行队列，避免冷启动竞态
private let queue = DispatchQueue(label: "auth.refresh")

func refresh() async throws -> Token {
  try await keychain.unlock()
  return try await api.refresh(token)
}
\`\`\`

- [inProgress] Write the migration note
- [inReview] Test checkout end to end
- [todo] Backport to 1.1
- [backlog] Spike the conflict UI
- [done] Gate refresh behind keychain unlock
`,
  'note-2': `# 数据库连接池 #work #待跟进

pgbouncer 的 transaction 模式在长事务下会占用连接，上次说的那个数据库连接池的问题，超时改为 30s。
`,
  'note-3': `# Weekly review #个人

Ship the export fix, then look at the sync conflicts and the DB timeouts.
`,
  'note-4': `# 客户会议纪要 · Acme #client #meeting

Scope, timeline, who owns what and delivery schedule.
`,
  'note-5': `# Lisbon #个人

The Sintra train leaves at 8:40; buy the ticket in advance.
`,
}

async function run() {
  await startServer()

  console.log('启动 Chrome 截图引擎...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
    ],
  })

  const page = await browser.newPage()
  await page.setViewport({
    width: 432,
    height: 760,
    deviceScaleFactor: 2,
  })

  // -------------------------------------------------------------
  // 第一部分：抓取原型图 (docs/product-analysis.html 中的各 screen)
  // -------------------------------------------------------------
  console.log('加载原型文档并抓取原型参考画面...')
  const protoPage = await browser.newPage()
  await protoPage.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 })
  await protoPage.goto('http://localhost:4199/docs/product-analysis.html', { waitUntil: 'networkidle0' })

  // 抓取原型 01 主面板
  const proto01 = await protoPage.$('.ui-cell:nth-child(1) .ui-scr')
  if (proto01) {
    await saveScreenshot(proto01, '01-list-prototype.png')
    console.log('✓ 抓取原型 01 主面板')
  }

  // 抓取原型 02 编辑器
  const proto02 = await protoPage.$('.ui-cell:nth-child(2) .ui-scr')
  if (proto02) {
    await saveScreenshot(proto02, '02-editor-prototype.png')
    console.log('✓ 抓取原型 02 编辑器')
  }

  // 抓取原型 03 语义检索
  const proto03 = await protoPage.$('.ui-cell:nth-child(3) .ui-scr')
  if (proto03) {
    await saveScreenshot(proto03, '03-search-prototype.png')
    console.log('✓ 抓取原型 03 语义检索')
  }

  // 抓取原型 04 命令面板
  const proto04 = await protoPage.$('.ui-cell:nth-child(4) .ui-scr')
  if (proto04) {
    await saveScreenshot(proto04, '04-cmd-prototype.png')
    console.log('✓ 抓取原型 04 命令面板')
  }

  await protoPage.close()

  // -------------------------------------------------------------
  // 第二部分：加载 iFolo 真实 Web 应用并抓取实际运行画面
  // -------------------------------------------------------------
  console.log('加载真实应用 packages/editor/dist 并初始化原型数据...')

  // 先进入空白页把 localStorage 准备好
  await page.goto('http://localhost:4199/packages/editor/dist/index.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate((notes) => {
    localStorage.setItem('ifolo.notes', JSON.stringify(notes))
    localStorage.setItem('ifolo.active', 'note-1')
    localStorage.setItem('ifolo.panelWidth', '432')
  }, PROTOTYPE_NOTES)

  // 重新加载以挂载真实数据
  await page.reload({ waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 400))

  const appEl = await page.$('#app')

  // 1. 抓取真实页面 01 主面板列表 (默认启动页)
  console.log('抓取真实 01 主面板列表画面 (默认首页)...')
  await saveScreenshot(appEl, '01-list-actual.png')

  // 2. 抓取真实页面 02 编辑器 (点击卡片进入 Launch plan)
  console.log('点击第一篇笔记切入真实 02 编辑器画面...')
  await page.click('.notelist__item:first-child')
  await new Promise((r) => setTimeout(r, 200))
  await saveScreenshot(appEl, '02-editor-actual.png')

  // 3. 抓取真实页面 03 语义检索 (从编辑器按 ⌘F 或点搜索展开)
  console.log('切回主面板并展开 03 语义检索画面...')
  await page.evaluate(() => window.__ifoloSearch())
  await new Promise((r) => setTimeout(r, 100))
  await page.type('.notelist__search-input', '上次说的那个数据库连接池的问题')
  await new Promise((r) => setTimeout(r, 400)) // 等待语义检索防抖完成
  await saveScreenshot(appEl, '03-search-actual.png')

  // 4. 抓取真实页面 04 命令面板 ⌘K
  console.log('唤起并抓取真实 04 命令面板画面...')
  await page.evaluate(() => {
    window.__ifoloCommandPalette()
  })
  await new Promise((r) => setTimeout(r, 200))
  await page.type('.cmd-input', 'sync')
  await new Promise((r) => setTimeout(r, 200))
  await saveScreenshot(appEl, '04-cmd-actual.png')

  console.log('全部截图已就绪，保存在:', OUT_DIR)

  await browser.close()
  server.close()
  console.log('完成！')
}

run().catch((err) => {
  console.error('抓屏脚本失败:', err)
  process.exit(1)
})
