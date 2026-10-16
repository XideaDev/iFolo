import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT_DIR = path.resolve(ROOT, 'output/screenshots')
const ARTIFACT_DIR = '/Users/jenson/.gemini/antigravity/brain/452d9920-a80e-46a9-88ab-858a280b2521/screenshots'

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url.split('?')[0])
  if (req.url === '/') filePath = path.join(ROOT, 'packages/editor/dist/index.html')
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'text/plain'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404); res.end()
  }
})

server.listen(4206, async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] })

  // 1. 抓取原型图 09
  const protoPage = await browser.newPage()
  await protoPage.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 })
  await protoPage.goto('http://localhost:4206/docs/product-analysis.html', { waitUntil: 'networkidle0' })
  const proto09 = await protoPage.$('.ui-cell:nth-child(9) .ui-scr')
  if (proto09) {
    const p1 = path.join(OUT_DIR, '09-blockhandle-prototype.png')
    const p2 = path.join(ARTIFACT_DIR, '09-blockhandle-prototype.png')
    await proto09.screenshot({ path: p1 })
    fs.copyFileSync(p1, p2)
    console.log('✓ 已抓取原型 09 段落指示器画面')
  }
  await protoPage.close()

  // 2. 抓取实际渲染画面 09
  const page = await browser.newPage()
  await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
  await page.goto('http://localhost:4206/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  // 悬停在第二个段落（正文行）并点击 ⠿ 唤出块菜单
  const p = await page.$('.ProseMirror p')
  const pBox = await p.boundingBox()
  await page.mouse.move(pBox.x + 80, pBox.y + 10)
  await new Promise(r => setTimeout(r, 100))

  const dragBtn = await page.$('.block-handle__btn--drag')
  const dragBox = await dragBtn.boundingBox()
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await page.mouse.down()
  await new Promise(r => setTimeout(r, 40))
  await page.mouse.up()
  await new Promise(r => setTimeout(r, 200))

  const appEl = await page.$('#app')
  const actualP1 = path.join(OUT_DIR, '09-blockhandle-actual.png')
  const actualP2 = path.join(ARTIFACT_DIR, '09-blockhandle-actual.png')
  await appEl.screenshot({ path: actualP1 })
  fs.copyFileSync(actualP1, actualP2)
  console.log('✓ 已抓取真实 09 段落指示器与块菜单画面')

  await browser.close()
  server.close()
})
