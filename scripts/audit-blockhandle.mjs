import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import puppeteer from 'puppeteer-core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.join(ROOT, reqPath)
  if (reqPath === '/') filePath = path.join(ROOT, 'packages/editor/dist/index.html')
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase()
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

server.listen(4201, async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
  await page.goto('http://localhost:4201/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  // 悬停在第一个段落上
  const p = await page.$('.ProseMirror p, .ProseMirror h1')
  console.log('找到段落元素:', !!p)
  if (p) {
    const pBox = await p.boundingBox()
    console.log('段落位置:', pBox)
    await page.mouse.move(pBox.x + 30, pBox.y + 10)
    await new Promise(r => setTimeout(r, 200))

    const handle = await page.$('.block-handle')
    const handleBox = await handle.boundingBox()
    const isVisible = await page.evaluate(el => el.classList.contains('block-handle--visible'), handle)
    const handleStyle = await page.evaluate(el => ({
      top: el.style.top,
      left: el.style.left,
      opacity: window.getComputedStyle(el).opacity,
      display: window.getComputedStyle(el).display
    }), handle)

    console.log('手柄可见性:', isVisible, handleStyle)
    console.log('手柄位置:', handleBox)

    // 检查重叠
    const overlap = handleBox.x + handleBox.width - pBox.x
    console.log('手柄与文字的水平重叠像素:', overlap > 0 ? `重叠了 ${overlap}px` : `未重叠 (间距 ${-overlap}px)`)

    // 测试点击手柄唤出菜单
    const dragBtn = await page.$('.block-handle__btn--drag')
    if (dragBtn) {
      await dragBtn.click()
      await new Promise(r => setTimeout(r, 150))
      const menu = await page.$('.menu')
      const menuVisible = menu ? await page.evaluate(m => window.getComputedStyle(m).display !== 'none', menu) : false
      console.log('点击 ⠿ 是否唤出块菜单:', menuVisible)
      if (menu) {
        const menuItems = await page.evaluate(m => Array.from(m.querySelectorAll('.menu__item')).map(i => i.textContent.trim()), menu)
        console.log('块菜单项:', menuItems)
      }
    }

    // 截图保存
    await page.screenshot({ path: path.join(ROOT, 'output/blockhandle-audit.png') })
  }

  await browser.close()
  server.close()
})
