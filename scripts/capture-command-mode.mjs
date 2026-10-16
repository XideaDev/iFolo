import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = path.resolve(ROOT, 'output/screenshots')
const ARTIFACT_DIR = '/Users/jenson/.gemini/antigravity/brain/452d9920-a80e-46a9-88ab-858a280b2521/screenshots'

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })
if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true })

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url.split('?')[0])
  if (req.url === '/') filePath = path.join(ROOT, 'packages/editor/dist/index.html')
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const mime = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
    }[ext] || 'text/plain'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404)
    res.end()
  }
})

server.listen(4213, async () => {
  console.log('Static server listening on 4213...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

    await page.goto('http://localhost:4213/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 400))

    // 1. 验证首页顶栏按钮
    const homeTopbar = await page.evaluate(() => {
      const topbarActions = document.querySelector('.topbar__actions')
      const actionButtons = Array.from(topbarActions ? topbarActions.querySelectorAll('button') : [])
      return actionButtons.map(b => b.getAttribute('title') || b.className)
    })
    console.log('=== 首页顶栏按钮 ===', homeTopbar)

    // 2. 在首页搜索框输入 / 触发命令面板
    await page.click('.notelist .notelist__search-input')
    await page.type('.notelist .notelist__search-input', '/')
    await new Promise((r) => setTimeout(r, 200))

    const listCmds = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.notelist .cmd-row'))
      return rows.map(r => r.textContent?.trim())
    })
    console.log('=== 首页搜索栏触发的命令面板列表 ===', listCmds)

    const p1 = path.join(OUT_DIR, 'list-command-mode.png')
    const a1 = path.join(ARTIFACT_DIR, 'list-command-mode.png')
    await page.screenshot({ path: p1 })
    fs.copyFileSync(p1, a1)

    // 3. 点击「新建笔记」命令
    const newNoteRow = await page.evaluateHandle(() => {
      const rows = Array.from(document.querySelectorAll('.notelist .cmd-row'))
      return rows.find(r => r.textContent?.includes('新建笔记'))
    })
    if (newNoteRow && newNoteRow.asElement()) {
      await newNoteRow.asElement().click()
      await new Promise((r) => setTimeout(r, 500))
    }

    // 4. 验证编辑页顶栏按钮
    const editorTopbar = await page.evaluate(() => {
      const topbarActions = document.querySelector('.topbar__actions')
      const actionButtons = Array.from(topbarActions ? topbarActions.querySelectorAll('button') : [])
      return actionButtons.map(b => b.getAttribute('title') || b.className)
    })
    console.log('=== 编辑页顶栏按钮 ===', editorTopbar)

    // 5. 在编辑页搜索框输入 / 触发命令面板
    await page.click('.editor-search-bar .notelist__search-input')
    await page.type('.editor-search-bar .notelist__search-input', '/')
    await new Promise((r) => setTimeout(r, 200))

    const editorCmds = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.editor-search-commands .cmd-row'))
      return rows.map(r => r.textContent?.trim())
    })
    console.log('=== 编辑页搜索栏触发的命令面板列表 ===', editorCmds)

    const p2 = path.join(OUT_DIR, 'editor-command-mode.png')
    const a2 = path.join(ARTIFACT_DIR, 'editor-command-mode.png')
    await page.screenshot({ path: p2 })
    fs.copyFileSync(p2, a2)

    console.log('✓ 截图捕获成功')
  } finally {
    await browser.close()
    server.close()
  }
})
