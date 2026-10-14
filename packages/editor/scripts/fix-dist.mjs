import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const htmlPath = join(dist, 'index.html')
const html = readFileSync(htmlPath, 'utf8')

// Vite 的 HTML 变换固定把 script 提到 <head> 并输出 type="module"。
// 两个问题必须一起修，否则面板白屏：
//   1. ES module 在 WKWebView 的 file:// 下会被 CORS 拦掉 → 改成经典脚本
//   2. 提到 <head> 且没有 defer 的经典脚本会在 #app 存在之前执行
//      → document.getElementById('app') 返回 null → root.append 抛 TypeError
// 所以这里同时写上 defer。
const fixed = html.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/,
    '<script defer src="$1"></script>',
)

if (fixed === html) {
    console.error('fix-dist: 没有找到需要改写的 script 标签')
    process.exit(1)
}

writeFileSync(htmlPath, fixed)
console.log('fix-dist: dist/index.html 已改写为经典脚本引用')
