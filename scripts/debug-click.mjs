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

server.listen(4203, async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

  page.on('console', msg => console.log('浏览器控制台:', msg.text()))

  await page.goto('http://localhost:4203/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  // 检查在浏览器中直接触发 beginDrag / click
  const result = await page.evaluate(async () => {
    const p = document.querySelector('.ProseMirror p, .ProseMirror h1')
    const pRect = p.getBoundingClientRect()
    // 触发 mousemove
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: pRect.left + 50, clientY: pRect.top + 10 }))
    const handle = document.querySelector('.block-handle')
    const visible = handle.classList.contains('block-handle--visible')

    const dragBtn = document.querySelector('.block-handle__btn--drag')
    // 派发 mousedown 和 mouseup
    dragBtn.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: pRect.top + 10, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 10, clientY: pRect.top + 10, bubbles: true }))

    const menu = document.querySelector('.menu')
    return {
      visible,
      hasMenu: !!menu,
      menuDisplay: menu ? window.getComputedStyle(menu).display : null,
      menuItems: menu ? Array.from(menu.querySelectorAll('.menu__item')).map(el => el.textContent.trim()) : []
    }
  })

  console.log('测试结果:', result)

  await browser.close()
  server.close()
})
