import { defineConfig } from 'vite'

// WKWebView 通过 file:// 加载产物，所以所有资源路径必须是相对的。
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 面板内嵌在 App 里，不需要为老浏览器降级
    target: 'safari18',
    // 单文件产物便于外壳直接加载
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // 必须是 IIFE + 内联动态导入。
        // WKWebView 从 file:// 加载时，ES module（<script type="module">）会被
        // CORS 拦掉 —— 表现为面板白屏、控制台报错。经典脚本没有这个问题。
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
