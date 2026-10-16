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
    const ext = path.extname(filePath).toLowerCase()
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[ext] || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

server.listen(4202, async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
  await page.goto('http://localhost:4202/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  // 找第二个待办项
  const taskItems = await page.$$('.task-item')
  console.log('待办项总数:', taskItems.length)
  if (taskItems.length >= 2) {
    const secondTask = taskItems[1]
    const box = await secondTask.boundingBox()
    console.log('第二个待办项位置:', box)
    await page.mouse.move(box.x + 30, box.y + 10)
    await new Promise(r => setTimeout(r, 80))

    const handle = await page.$('.block-handle')
    const handleBox = await handle.boundingBox()
    console.log('手柄位置 (Y轴):', handleBox ? handleBox.y : '未显示')
    console.log('手柄是否对齐在第二个待办项:', handleBox && Math.abs(handleBox.y - box.y) < 10)
  }

  await browser.close()
  server.close()
})
