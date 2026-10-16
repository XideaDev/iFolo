import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.join(ROOT, reqPath)
  if (reqPath === '/') filePath = path.join(ROOT, 'packages/editor/dist/index.html')
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(filePath)] || 'text/plain'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404); res.end()
  }
})

server.listen(4204, async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

  page.on('console', msg => console.log('浏览器控制台:', msg.text()))
  page.on('pageerror', err => console.log('页面错误:', err))

  await page.goto('http://localhost:4204/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  const p = await page.$('.ProseMirror p, .ProseMirror h1')
  const pBox = await p.boundingBox()
  // 悬停段落
  await page.mouse.move(pBox.x + 50, pBox.y + 10)
  await new Promise(r => setTimeout(r, 100))

  const dragBtn = await page.$('.block-handle__btn--drag')
  const dragBox = await dragBtn.boundingBox()
  console.log('dragBtn bounding box:', dragBox)

  // 模拟真实鼠标点击
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
  await page.mouse.down()
  await new Promise(r => setTimeout(r, 50))
  await page.mouse.up()
  await new Promise(r => setTimeout(r, 150))

  const menu = await page.$('.menu')
  console.log('是否找到 .menu 节点:', !!menu)
  if (menu) {
    const html = await page.evaluate(m => m.outerHTML, menu)
    console.log('menu outerHTML:', html)
  } else {
    const bodyHtml = await page.evaluate(() => document.body.innerHTML)
    console.log('是否有 handle-layer:', bodyHtml.includes('block-handle-layer'))
  }

  await browser.close()
  server.close()
})
