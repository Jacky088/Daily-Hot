// 前端构建：esbuild 压缩 + 内容 hash + 引用改写。
//
// 为什么需要它（替代原来直发 public/*.js 明文 359KB）：
//   - 体积：app.js 大头是中文注释与空白，esbuild 压缩后只剩源码的一小半，
//     gzip 后首屏 JS 几十 KB，低端机解析更快。
//   - 缓存：hash 文件名（app.[hash].js）可给一年 immutable，重复访问 0 字节；
//     index.html 本身保持 no-cache，每次回源拿最新引用，发版即时生效。
//
// 输入输出：
//   - 读 public/{app,emoji}.js + public/style.css（源码），写 public/dist/ 下的
//     hash 产物 + asset-manifest.json（hash 映射表）。
//   - index.html 保持手写源码（/app.js 引用），发版前由 rewrite-html 步骤按
//     manifest 改写成分发版；verify-endpoints 始终扫源码版 app.js，不受影响。
//   - wallpaper.html 是独立内联页，不参与构建。
//
// 用法：node scripts/build-frontend.mjs [--check]
//   --check：只校验 dist 是否新鲜（CI 用），过期则非 0 退出并提示重跑构建。

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { transformSync } from 'esbuild'

import { rewriteHtml } from './rewrite-html.mjs'

const root = process.cwd()
const publicDir = join(root, 'public')
const distDir = join(publicDir, 'dist')

const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')

// 构建输入：保持小而显式，新增入口文件时在这里加一行即可
const ENTRIES = [
  { src: 'app.js', kind: 'js' },
  { src: 'emoji.js', kind: 'js' },
  { src: 'style.css', kind: 'css' },
]

function hash8(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8)
}

/** esbuild 压缩 JS。⚠️ 显式关闭 minifyIdentifiers（标识符改名）：
 * app.js 以经典 <script> 直载，动态生成的 HTML 字符串里有内联 onclick 引用顶层
 * 函数名（如 toggleKeywordFilter / load），这类引用藏在字符串里 esbuild 看不见，
 * 一旦顶层标识符被改名就会静默破坏它们。去注释 + 折叠空白 + 简化语法已经拿走了
 * 本文件绝大部分体积（大头是中文注释），标识符改名省的那点不值得冒这个险。 */
function minifyJs(src) {
  return transformSync(src, {
    loader: 'js',
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    charset: 'utf8',
  }).code
}

/** esbuild 压缩 CSS：语法级压缩，不存在手写正则的「后代伪类空格」「字符串连续空格」脚枪 */
function minifyCss(src) {
  return transformSync(src, { loader: 'css', minify: true, charset: 'utf8' }).code
}

if (!checkOnly) {
  rmSync(distDir, { recursive: true, force: true })
  mkdirSync(distDir, { recursive: true })
}

const manifest = {}
let stale = false
let manifestOnDisk = null

if (checkOnly) {
  const manifestPath = join(distDir, 'asset-manifest.json')
  if (existsSync(manifestPath)) {
    try {
      manifestOnDisk = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch {
      manifestOnDisk = null
    }
  }
}

for (const { src, kind } of ENTRIES) {
  const srcPath = join(publicDir, src)
  if (!existsSync(srcPath)) {
    console.error(`[build-frontend] missing source: ${src}`)
    process.exit(1)
  }
  const raw = readFileSync(srcPath, 'utf-8')
  // 行尾归一化：工作区可能是 CRLF（core.autocrlf=true 的 Windows 检出），CI 是 LF。
  // hash 直接算在内容上，不归一化的话同一份源码在两台机器会产出不同 hash，永远无法收敛
  const normalized = raw.replace(/\r\n/g, '\n')
  const min = kind === 'js' ? minifyJs(normalized) : minifyCss(normalized)
  const dot = src.lastIndexOf('.')
  const base = src.slice(0, dot)
  const ext = src.slice(dot)
  const name = `${base}.${hash8(min)}${ext}`
  manifest[src] = `dist/${name}`

  if (checkOnly) {
    const outPath = join(distDir, name)
    if (!existsSync(outPath) || readFileSync(outPath, 'utf-8') !== min) stale = true
  } else {
    writeFileSync(join(distDir, name), min)
    console.log(`[build-frontend] ${src} -> dist/${name} (${raw.length} -> ${min.length} bytes)`)
  }
}

if (checkOnly) {
  if (!manifestOnDisk) stale = true
  else {
    for (const [k, v] of Object.entries(manifest)) {
      if (manifestOnDisk[k] !== v) stale = true
    }
  }
  // dist/index.html 由 rewrite-html 生成，一并校验新鲜度：
  // 用当前源码 index.html + 刚算出的 manifest 重放改写，内容必须逐字节一致
  const distHtml = join(distDir, 'index.html')
  const srcHtml = join(publicDir, 'index.html')
  if (!existsSync(distHtml) || !existsSync(srcHtml)) stale = true
  else if (readFileSync(distHtml, 'utf-8') !== rewriteHtml(readFileSync(srcHtml, 'utf-8'), manifest)) stale = true
  if (stale) {
    console.error('[build-frontend] dist 已过期：请本地运行 pnpm run build:frontend 后提交产物')
    process.exit(1)
  }
  console.log('[build-frontend] dist is fresh')
} else {
  writeFileSync(join(distDir, 'asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('[build-frontend] manifest written')
}
