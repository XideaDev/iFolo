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

server.listen(4208, async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
    await page.goto('http://localhost:4208/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 200))

    // 先点击进入编辑器
    const firstCard = await page.$('.notelist__item')
    if (firstCard) await firstCard.click()
    await new Promise((r) => setTimeout(r, 300))

    // 连续点击 ＋ 新建多个标签，验证无限标签横滑
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((idx) => {
        const addBtn = document.querySelector('.tabstrip__tab--add')
        if (addBtn) addBtn.click()
      }, i)
      await new Promise((r) => setTimeout(r, 150))
      // 输入标题
      await page.keyboard.type(`需求调研文档 #${i}`)
      await new Promise((r) => setTimeout(r, 100))
    }

    await new Promise((r) => setTimeout(r, 400))
    const p5 = path.join(OUT_DIR, 'planb-05-infinite-tabs.png')
    const a5 = path.join(ARTIFACT_DIR, 'planb-05-infinite-tabs.png')
    await page.screenshot({ path: p5 })
    fs.copyFileSync(p5, a5)
    console.log('✓ 5. 已抓取多标签无限平滑横向滚动画面')

  } catch (err) {
    console.error('抓取失败:', err)
  } finally {
    await browser.close()
    server.close()
    process.exit(0)
  }
})
