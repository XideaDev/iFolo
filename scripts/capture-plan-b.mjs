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

server.listen(4207, async () => {
  console.log('Static server listening on 4207...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
    await page.goto('http://localhost:4207/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 300))

    // 1. 抓取首页主面板（纯粹卡片流，绝无 Tab 栏）
    const p1 = path.join(OUT_DIR, 'planb-01-home-list.png')
    const a1 = path.join(ARTIFACT_DIR, 'planb-01-home-list.png')
    await page.screenshot({ path: p1 })
    fs.copyFileSync(p1, a1)
    console.log('✓ 1. 已抓取首页主面板（无 Tab 栏卡片流）')

    // 2. 点击进入单篇笔记，抓取编辑器页面（展示 Tab 栏与无限横滑）
    const firstCard = await page.$('.notelist__item')
    if (firstCard) {
      await firstCard.click()
      await new Promise((r) => setTimeout(r, 400))
    }
    const p2 = path.join(OUT_DIR, 'planb-02-editor-tabstrip.png')
    const a2 = path.join(ARTIFACT_DIR, 'planb-02-editor-tabstrip.png')
    await page.screenshot({ path: p2 })
    fs.copyFileSync(p2, a2)
    console.log('✓ 2. 已抓取单篇编辑器页面（含横滑 Tab 栏与工具栏）')

    // 3. 在编辑器页面点击顶栏 🔍 图标，唤起当前文档搜索条
    await page.evaluate(() => {
      const btn = document.querySelector('.topbar__actions button')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 200))

    // 在搜索框中输入关键词进行文档内搜索
    await page.evaluate(() => {
      const input = document.querySelector('.editor-search-bar__input')
      if (input) {
        input.value = 'iFolo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await new Promise((r) => setTimeout(r, 300))

    const p3 = path.join(OUT_DIR, 'planb-03-editor-search.png')
    const a3 = path.join(ARTIFACT_DIR, 'planb-03-editor-search.png')
    await page.screenshot({ path: p3 })
    fs.copyFileSync(p3, a3)
    console.log('✓ 3. 已抓取编辑器页面内搜索交互（高亮+计数+搜全部按钮）')

    // 4. 点击「🌐 搜全部 ⌥⏎」按钮，测试切回首页主面板全库检索
    await page.evaluate(() => {
      const pill = document.querySelector('.editor-search-bar__pill')
      if (pill) pill.click()
    })
    await new Promise((r) => setTimeout(r, 400))

    const p4 = path.join(OUT_DIR, 'planb-04-global-search.png')
    const a4 = path.join(ARTIFACT_DIR, 'planb-04-global-search.png')
    await page.screenshot({ path: p4 })
    fs.copyFileSync(p4, a4)
    console.log('✓ 4. 已抓取从编辑器一键切回首页全局搜索交互')

  } catch (err) {
    console.error('抓取失败:', err)
  } finally {
    await browser.close()
    server.close()
    process.exit(0)
  }
})
