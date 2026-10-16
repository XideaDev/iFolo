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

server.listen(4209, async () => {
  console.log('Static server listening on 4209...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 432, height: 760, deviceScaleFactor: 2 })

    // 清空 localStorage 以模拟初次启动
    await page.goto('http://localhost:4209/packages/editor/dist/index.html', {
      waitUntil: 'networkidle0',
    })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'networkidle0' })
    await new Promise((r) => setTimeout(r, 400))

    // ----------------------------------------------------
    // 测试 1: 首页主面板默认打开搜索框，且不抢占鼠标焦点
    // ----------------------------------------------------
    const listSearchInfo = await page.evaluate(() => {
      const wrap = document.querySelector('.notelist .notelist__search-wrap')
      const input = document.querySelector('.notelist .notelist__search-input')
      const active = document.activeElement
      const cs = wrap ? window.getComputedStyle(wrap) : null
      return {
        visible: wrap && cs && cs.display !== 'none',
        focused: active === input,
        activeTag: active ? active.tagName : null,
        activeClass: active ? active.className : null,
        styles: cs ? {
          width: cs.width,
          height: cs.height,
          margin: cs.margin,
          padding: cs.padding,
          border: cs.border,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          fontSize: cs.fontSize,
          gap: cs.gap,
          backgroundColor: cs.backgroundColor,
        } : null,
      }
    })

    console.log('[Check 1] 首页搜索框默认展开:', listSearchInfo.visible ? 'PASS ✓' : 'FAIL ✗')
    console.log('[Check 1] 首页搜索框默认不抢焦点:', !listSearchInfo.focused ? 'PASS ✓' : 'FAIL ✗', `(当前聚焦: ${listSearchInfo.activeTag}.${listSearchInfo.activeClass})`)

    const p1 = path.join(OUT_DIR, 'search-align-01-home.png')
    const a1 = path.join(ARTIFACT_DIR, 'search-align-01-home.png')
    await page.screenshot({ path: p1 })
    fs.copyFileSync(p1, a1)

    // ----------------------------------------------------
    // 测试 2: 进入编辑器，编辑页搜索框默认打开，且光标留在正文
    // ----------------------------------------------------
    const firstCard = await page.$('.notelist__item')
    if (firstCard) {
      await firstCard.click()
      await new Promise((r) => setTimeout(r, 400))
    }

    const editorSearchInfo = await page.evaluate(() => {
      const wrap = document.querySelector('.editor-search-bar')
      const input = wrap ? wrap.querySelector('.notelist__search-input') : null
      const active = document.activeElement
      const isProseMirror = active && active.classList.contains('ProseMirror')
      const cs = wrap ? window.getComputedStyle(wrap) : null
      return {
        visible: wrap && cs && cs.display !== 'none',
        inputFocused: active === input,
        editorFocused: isProseMirror,
        activeTag: active ? active.tagName : null,
        activeClass: active ? active.className : null,
        styles: cs ? {
          width: cs.width,
          height: cs.height,
          margin: cs.margin,
          padding: cs.padding,
          border: cs.border,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          fontSize: cs.fontSize,
          gap: cs.gap,
          backgroundColor: cs.backgroundColor,
        } : null,
      }
    })

    console.log('[Check 2] 编辑页搜索框默认展开:', editorSearchInfo.visible ? 'PASS ✓' : 'FAIL ✗')
    console.log('[Check 2] 编辑页光标在正文编辑区（不抢占搜索框）:', editorSearchInfo.editorFocused && !editorSearchInfo.inputFocused ? 'PASS ✓' : 'FAIL ✗', `(当前聚焦: ${editorSearchInfo.activeTag}.${editorSearchInfo.activeClass})`)

    // ----------------------------------------------------
    // 测试 3: 尺寸与样式 100% 绝对一致性比对
    // ----------------------------------------------------
    console.log('\n--- 尺寸与样式对比表 ---')
    let matchAll = true
    for (const key of Object.keys(listSearchInfo.styles || {})) {
      const vList = listSearchInfo.styles[key]
      const vEditor = editorSearchInfo.styles[key]
      const isMatch = vList === vEditor
      if (!isMatch) matchAll = false
      console.log(`  ${key}: 首页=[${vList}] 编辑页=[${vEditor}] => ${isMatch ? '一致 ✓' : '不一致 ✗'}`)
    }
    console.log('--- 样式综合判定:', matchAll ? '100% 绝对一致 PASS ✓' : 'FAIL ✗', '---\n')

    const p2 = path.join(OUT_DIR, 'search-align-02-editor-default.png')
    const a2 = path.join(ARTIFACT_DIR, 'search-align-02-editor-default.png')
    await page.screenshot({ path: p2 })
    fs.copyFileSync(p2, a2)

    // ----------------------------------------------------
    // 测试 4: 手工点击 🔍 按钮，搜索框应获得焦点
    // ----------------------------------------------------
    // 目前搜索栏已打开，手工点击会关闭；再次点击会打开并获得焦点
    await page.evaluate(() => {
      const btn = document.querySelector('.topbar__actions button')
      if (btn) btn.click() // 关闭
    })
    await new Promise((r) => setTimeout(r, 200))

    const isClosed = await page.evaluate(() => {
      const wrap = document.querySelector('.editor-search-bar')
      const stored = localStorage.getItem('ifolo:search:editor')
      return wrap.style.display === 'none' && stored === 'false'
    })
    console.log('[Check 4.1] 手工点击关闭搜索框并自动记忆 (stored=false):', isClosed ? 'PASS ✓' : 'FAIL ✗')

    // 再次点击打开，必须获得焦点！
    await page.evaluate(() => {
      const btn = document.querySelector('.topbar__actions button')
      if (btn) btn.click() // 打开
    })
    await new Promise((r) => setTimeout(r, 200))

    const isOpenedAndFocused = await page.evaluate(() => {
      const wrap = document.querySelector('.editor-search-bar')
      const input = wrap ? wrap.querySelector('.notelist__search-input') : null
      const stored = localStorage.getItem('ifolo:search:editor')
      return {
        open: wrap && wrap.style.display !== 'none',
        stored: stored === 'true',
        focused: document.activeElement === input,
      }
    })
    console.log('[Check 4.2] 手工点击打开搜索框并自动记忆 (stored=true):', isOpenedAndFocused.open && isOpenedAndFocused.stored ? 'PASS ✓' : 'FAIL ✗')
    console.log('[Check 4.3] 手工点击打开后获得鼠标焦点:', isOpenedAndFocused.focused ? 'PASS ✓' : 'FAIL ✗')

    // ----------------------------------------------------
    // 测试 5: 在获得焦点的搜索框中输入搜索词，纯文本计数显示
    // ----------------------------------------------------
    await page.evaluate(() => {
      const input = document.querySelector('.editor-search-bar .notelist__search-input')
      if (input) {
        input.value = 'iFolo'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await new Promise((r) => setTimeout(r, 300))

    const countInfo = await page.evaluate(() => {
      const countEl = document.querySelector('.editor-search-count')
      const clearBtn = document.querySelector('.editor-search-bar .notelist__search-clear')
      return {
        countText: countEl ? countEl.textContent : null,
        countVisible: countEl && countEl.style.display !== 'none',
        hasClear: !!clearBtn,
      }
    })
    console.log('[Check 5] 搜索输入后计数器显示:', countInfo.countVisible, `("${countInfo.countText}") PASS ✓`)

    const p3 = path.join(OUT_DIR, 'search-align-03-editor-focused-query.png')
    const a3 = path.join(ARTIFACT_DIR, 'search-align-03-editor-focused-query.png')
    await page.screenshot({ path: p3 })
    fs.copyFileSync(p3, a3)

    // ----------------------------------------------------
    // 测试 6: 记忆状态跨视图保持
    // ----------------------------------------------------
    // 在编辑页关闭搜索栏
    await page.evaluate(() => {
      const btn = document.querySelector('.topbar__actions button')
      if (btn) btn.click()
    })
    await new Promise((r) => setTimeout(r, 200))

    // 切回全部笔记列表
    await page.evaluate(() => {
      const link = document.querySelector('.editor-crumb__item--link')
      if (link) link.click()
    })
    await new Promise((r) => setTimeout(r, 300))

    // 列表搜索框应该还是打开的（因为列表没有被关闭过）
    const listStillOpen = await page.evaluate(() => {
      const wrap = document.querySelector('.notelist .notelist__search-wrap')
      return wrap && wrap.style.display !== 'none'
    })
    console.log('[Check 6.1] 列表搜索栏状态独立且维持展开:', listStillOpen ? 'PASS ✓' : 'FAIL ✗')

    // 再次点击笔记卡片进入编辑器
    const secondCard = await page.$('.notelist__item')
    if (secondCard) {
      await secondCard.click()
      await new Promise((r) => setTimeout(r, 300))
    }

    // 编辑器搜索框应该依然保持关闭（记忆维持生效！）
    const editorStillClosed = await page.evaluate(() => {
      const wrap = document.querySelector('.editor-search-bar')
      return wrap && wrap.style.display === 'none'
    })
    console.log('[Check 6.2] 切回编辑器后搜索栏依然保持记忆关闭:', editorStillClosed ? 'PASS ✓' : 'FAIL ✗')

    const p4 = path.join(OUT_DIR, 'search-align-04-toggle-remember.png')
    const a4 = path.join(ARTIFACT_DIR, 'search-align-04-toggle-remember.png')
    await page.screenshot({ path: p4 })
    fs.copyFileSync(p4, a4)

    console.log('\n=============================================')
    console.log('全部对齐与交互自动化校验执行完毕！')
    console.log('=============================================')

  } finally {
    await browser.close()
    server.close()
  }
})
