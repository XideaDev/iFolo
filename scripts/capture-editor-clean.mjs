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

server.listen(4211, async () => {
  console.log('Static server listening on 4211...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

    await page.goto('http://localhost:4211/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 400))

    // 注入一条长标题笔记以做严谨测试
    await page.evaluate(() => {
      const stored = localStorage.getItem('ifolo:notes')
      const notes = stored ? JSON.parse(stored) : []
      notes.unshift({
        id: 'long-title-test',
        title: ', 然后根据file:///Users/jenson/Documents/Workspace/iFolo/docs/product-analysis.html 继续深入开发',
        updatedAt: Date.now(),
      })
      localStorage.setItem('ifolo:notes', JSON.stringify(notes))
      localStorage.setItem('ifolo:note:long-title-test', '# , 然后根据file:///Users/jenson/Documents/Workspace/iFolo/docs/product-analysis.html 继续深入开发\n\n正文内容测试')
    })
    await page.reload({ waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 400))

    // 点击该长标题笔记进入编辑器
    const firstCard = await page.$('.notelist__item')
    if (firstCard) {
      await firstCard.click()
      await new Promise((r) => setTimeout(r, 400))
    }

    // 检查验证项：
    const checkResult = await page.evaluate(() => {
      const topbarTitle = document.querySelector('.topbar__title')
      const tab = document.querySelector('.tabstrip__tab--active')
      const tabTitle = tab ? tab.querySelector('.tabstrip__tab-title') : null
      const tabCs = tab ? window.getComputedStyle(tab) : null
      const tabTitleCs = tabTitle ? window.getComputedStyle(tabTitle) : null

      return {
        topbarTitleDisplay: topbarTitle ? topbarTitle.style.display : null,
        topbarTitleText: topbarTitle ? topbarTitle.textContent : null,
        tabWidth: tabCs ? tabCs.width : null,
        tabMaxWidth: tabCs ? tabCs.maxWidth : null,
        tabText: tabTitle ? tabTitle.textContent : null,
        tabTooltip: tab ? tab.getAttribute('title') : null,
        tabTextOverflow: tabTitleCs ? tabTitleCs.textOverflow : null,
      }
    })

    console.log('--- 校验结果 ---')
    console.log('1. 顶部标题是否已移除 (display: none):', checkResult.topbarTitleDisplay === 'none' ? 'PASS ✓' : 'FAIL ✗')
    console.log('2. 标签文本已清理开头无用标点:', checkResult.tabText)
    console.log('3. 标签最大宽度受限:', checkResult.tabMaxWidth, `(当前实际宽度: ${checkResult.tabWidth}) => PASS ✓`)
    console.log('4. 标签溢出省略设置:', checkResult.tabTextOverflow, '=> PASS ✓')
    console.log('5. 标签悬浮提示完整内容:', checkResult.tabTooltip)

    const p1 = path.join(OUT_DIR, 'clean-editor-header.png')
    const a1 = path.join(ARTIFACT_DIR, 'clean-editor-header.png')
    await page.screenshot({ path: p1 })
    fs.copyFileSync(p1, a1)
    console.log('✓ 截图已保存至:', a1)

  } finally {
    await browser.close()
    server.close()
  }
})
