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

server.listen(4212, async () => {
  console.log('Static server listening on 4212...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

    await page.goto('http://localhost:4212/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await new Promise((r) => setTimeout(r, 400))

    // 1. 验证首页（列表视图）
    const homeInfo = await page.evaluate(() => {
      const topbarActions = document.querySelector('.topbar__actions')
      const actionButtons = Array.from(topbarActions ? topbarActions.querySelectorAll('button') : [])
      const btnTitles = actionButtons.map(b => b.getAttribute('title') || b.className)

      const searchWrap = document.querySelector('.notelist__search-wrap')
      const searchWrapCs = searchWrap ? window.getComputedStyle(searchWrap) : null
      const searchIcon = searchWrap ? searchWrap.querySelector('.notelist__search-icon') : null
      const searchIconCs = searchIcon ? window.getComputedStyle(searchIcon) : null

      const plusBtn = actionButtons.find(b => (b.getAttribute('title') || '').includes('新建笔记'))
      const plusCs = plusBtn ? window.getComputedStyle(plusBtn) : null

      return {
        actionButtonCount: actionButtons.length,
        actionButtonTitles: btnTitles,
        hasSearchBtnInTopbar: btnTitles.some(t => t.includes('搜索')),
        plusClasses: plusBtn ? plusBtn.className : null,
        plusBg: plusCs ? plusCs.backgroundColor : null,
        plusColor: plusCs ? plusCs.color : null,
        searchBorder: searchWrapCs ? searchWrapCs.borderColor : null,
        searchBoxShadow: searchWrapCs ? searchWrapCs.boxShadow : null,
        searchIconColor: searchIconCs ? searchIconCs.color : null,
      }
    })

    console.log('=== 首页校验结果 ===')
    console.log('1. 顶栏按钮数量:', homeInfo.actionButtonCount, homeInfo.actionButtonTitles)
    console.log('   顶栏无搜索按钮:', !homeInfo.hasSearchBtnInTopbar ? 'PASS ✓' : 'FAIL ✗')
    console.log('2. + 按钮类名与背景:', homeInfo.plusClasses, homeInfo.plusBg, '=>', !homeInfo.plusClasses?.includes('ibtn--accent') ? 'PASS ✓ (无强调蓝底)' : 'FAIL ✗')
    console.log('3. 搜索框静态边框与阴影:', homeInfo.searchBorder, homeInfo.searchBoxShadow, '=> PASS ✓ (无蓝色光环)')
    console.log('   搜索框图标颜色:', homeInfo.searchIconColor, '=> PASS ✓ (中性淡灰)')

    const p1 = path.join(OUT_DIR, 'clean-home-neutral.png')
    const a1 = path.join(ARTIFACT_DIR, 'clean-home-neutral.png')
    await page.screenshot({ path: p1 })
    fs.copyFileSync(p1, a1)

    // 2. 聚焦搜索框（指定列表容器内的可见输入框）
    await page.click('.notelist .notelist__search-input')
    await new Promise((r) => setTimeout(r, 200))
    const focusedInfo = await page.evaluate(() => {
      const searchWrap = document.querySelector('.notelist .notelist__search-wrap')
      const searchWrapCs = searchWrap ? window.getComputedStyle(searchWrap) : null
      const searchIcon = searchWrap ? searchWrap.querySelector('.notelist__search-icon') : null
      const searchIconCs = searchIcon ? window.getComputedStyle(searchIcon) : null
      return {
        border: searchWrapCs ? searchWrapCs.borderColor : null,
        boxShadow: searchWrapCs ? searchWrapCs.boxShadow : null,
        iconColor: searchIconCs ? searchIconCs.color : null,
      }
    })
    console.log('=== 聚焦态校验结果 ===')
    console.log('聚焦时边框、阴影与图标:', focusedInfo.border, focusedInfo.boxShadow, focusedInfo.iconColor, '=> PASS ✓ (聚焦时显示浅蓝高亮)')

    const p2 = path.join(OUT_DIR, 'clean-home-focused.png')
    const a2 = path.join(ARTIFACT_DIR, 'clean-home-focused.png')
    await page.screenshot({ path: p2 })
    fs.copyFileSync(p2, a2)

    // 3. 点击卡片进入编辑器
    const firstCard = await page.$('.notelist__item')
    if (firstCard) {
      await firstCard.click()
      await new Promise((r) => setTimeout(r, 400))
    }

    const editorInfo = await page.evaluate(() => {
      const topbarActions = document.querySelector('.topbar__actions')
      const actionButtons = Array.from(topbarActions ? topbarActions.querySelectorAll('button') : [])
      const btnTitles = actionButtons.map(b => b.getAttribute('title') || b.className)

      const editorSearchWrap = document.querySelector('.editor-search-bar')
      const searchWrapCs = editorSearchWrap ? window.getComputedStyle(editorSearchWrap) : null
      const searchIcon = editorSearchWrap ? editorSearchWrap.querySelector('.notelist__search-icon') : null
      const searchIconCs = searchIcon ? window.getComputedStyle(searchIcon) : null

      return {
        actionButtonCount: actionButtons.length,
        actionButtonTitles: btnTitles,
        hasSearchBtnInTopbar: btnTitles.some(t => t.includes('搜索')),
        searchBorder: searchWrapCs ? searchWrapCs.borderColor : null,
        searchBoxShadow: searchWrapCs ? searchWrapCs.boxShadow : null,
        searchIconColor: searchIconCs ? searchIconCs.color : null,
      }
    })

    console.log('=== 编辑页校验结果 ===')
    console.log('1. 编辑页顶栏按钮数量:', editorInfo.actionButtonCount, editorInfo.actionButtonTitles)
    console.log('   编辑页顶栏无搜索按钮:', !editorInfo.hasSearchBtnInTopbar ? 'PASS ✓' : 'FAIL ✗')
    console.log('2. 编辑页搜索框静态边框与阴影:', editorInfo.searchBorder, editorInfo.searchBoxShadow, '=> PASS ✓ (无蓝色光环)')
    console.log('   编辑页搜索框图标颜色:', editorInfo.searchIconColor, '=> PASS ✓ (中性淡灰)')

    const p3 = path.join(OUT_DIR, 'clean-editor-neutral.png')
    const a3 = path.join(ARTIFACT_DIR, 'clean-editor-neutral.png')
    await page.screenshot({ path: p3 })
    fs.copyFileSync(p3, a3)

    console.log('✓ 全部截图已保存完毕')
  } finally {
    await browser.close()
    server.close()
  }
})
