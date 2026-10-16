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
  if (req.url === '/' || req.url.includes('settings-preview')) filePath = path.join(ROOT, 'output/settings-preview.html')
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

server.listen(4215, async () => {
  console.log('Static server listening on 4215...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 680, height: 860, deviceScaleFactor: 2 })

    await page.goto('http://localhost:4215/output/settings-preview.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 400))

    // 1. 截图方案 A
    const frameEl = await page.$('#deviceFrame')
    const pA = path.join(OUT_DIR, 'settings-scheme-a.png')
    const aA = path.join(ARTIFACT_DIR, 'settings-scheme-a.png')
    if (frameEl) {
      await frameEl.screenshot({ path: pA })
      fs.copyFileSync(pA, aA)
    }

    // 2. 切换到方案 B 并截图
    await page.evaluate(() => switchScheme('B'))
    await new Promise((r) => setTimeout(r, 300))
    const pB = path.join(OUT_DIR, 'settings-scheme-b.png')
    const aB = path.join(ARTIFACT_DIR, 'settings-scheme-b.png')
    if (frameEl) {
      await frameEl.screenshot({ path: pB })
      fs.copyFileSync(pB, aB)
    }

    // 3. 切换到方案 C 并截图
    await page.evaluate(() => switchScheme('C'))
    await new Promise((r) => setTimeout(r, 300))
    const pC = path.join(OUT_DIR, 'settings-scheme-c.png')
    const aC = path.join(ARTIFACT_DIR, 'settings-scheme-c.png')
    if (frameEl) {
      await frameEl.screenshot({ path: pC })
      fs.copyFileSync(pC, aC)
    }

    console.log('✓ 3 款方案截图已全部输出完毕')
  } finally {
    await browser.close()
    server.close()
  }
})
