/**
 * 像素级与样式规范量化比对工具
 *
 * 提取原型中关键元素的 getComputedStyle 与真实渲染 DOM 比较，精确核对：
 *   - 盒模型尺寸 (Width, Height, Padding, Margin, Border)
 *   - 字体与文本 (Font-size, Font-weight, Line-height, Color)
 *   - 背景与圆角 (Background-color, Border-radius, Box-shadow)
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

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0])
  let filePath = path.join(ROOT, reqPath)
  if (reqPath === '/') filePath = path.join(ROOT, 'packages/editor/dist/index.html')

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' })
    fs.createReadStream(filePath).pipe(res)
  } else {
    res.writeHead(404)
    res.end()
  }
})

async function run() {
  await new Promise((r) => server.listen(4198, r))
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  // 1. 测量原型样式
  const protoPage = await browser.newPage()
  await protoPage.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 })
  await protoPage.goto('http://localhost:4198/docs/product-analysis.html', { waitUntil: 'networkidle0' })

  const protoMetrics = await protoPage.evaluate(() => {
    function pick(el) {
      if (!el) return null
      const cs = window.getComputedStyle(el)
      return {
        height: cs.height,
        padding: cs.padding,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        background: cs.backgroundColor,
        borderRadius: cs.borderRadius,
      }
    }
    return {
      topbar: pick(document.querySelector('.ui-top')),
      tab: pick(document.querySelector('.ui-tab.on')),
      tabstrip: pick(document.querySelector('.ui-tabstrip')),
      listRow: pick(document.querySelector('.ui-row')),
      rowTitle: pick(document.querySelector('.ui-rt b')),
      toolbar: pick(document.querySelector('.ui-toolbar')),
      taskStatus: pick(document.querySelector('.ui-st.ip')),
      cmdPanel: pick(document.querySelector('.ui-cmd')),
      findBox: pick(document.querySelector('.ui-find')),
      editorH1: pick(document.querySelector('.ui-h1')),
      editorP: pick(document.querySelector('.ui-p')),
      editorPre: pick(document.querySelector('.ui-code')),
    }
  })
  await protoPage.close()

  // 2. 测量真实应用样式
  const appPage = await browser.newPage()
  await appPage.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })
  await appPage.goto('http://localhost:4198/packages/editor/dist/index.html', { waitUntil: 'networkidle0' })

  const appMetrics = await appPage.evaluate(() => {
    function pick(el) {
      if (!el) return null
      const cs = window.getComputedStyle(el)
      return {
        height: cs.height,
        padding: cs.padding,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        background: cs.backgroundColor,
        borderRadius: cs.borderRadius,
      }
    }
    return {
      topbar: pick(document.querySelector('.topbar')),
      tab: pick(document.querySelector('.tabstrip__tab--active')),
      tabstrip: pick(document.querySelector('.tabstrip')),
      listRow: pick(document.querySelector('.notelist__item')),
      rowTitle: pick(document.querySelector('.notelist__title')),
      toolbar: pick(document.querySelector('.toolbar')),
      taskStatus: pick(document.querySelector('.task-item__status.st-inProgress') || document.querySelector('.task-item__status')),
      cmdPanel: pick(document.querySelector('.cmd-panel')),
      findBox: pick(document.querySelector('.notelist__search-wrap')),
      editorH1: pick(document.querySelector('.ProseMirror h1')),
      editorP: pick(document.querySelector('.ProseMirror p')),
      editorPre: pick(document.querySelector('.ProseMirror pre')),
    }
  })

  await browser.close()
  server.close()

  console.log('=== 视觉规范测量与比对结果 ===')
  console.log(JSON.stringify({ protoMetrics, appMetrics }, null, 2))
}

run().catch(console.error)
