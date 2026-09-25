// 前端构建：esbuild 压缩 + 内容 hash + 引用改写。
//
// 为什么需要它（替代原来直发 public/*.js 明文 359KB）：
//   - 体积：app.js + style.css 压缩后约减半，gzip 后首屏 JS 35~45KB，低端机解析更快。
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

/** 极简 minify：只做安全的空白折叠，不碰注释与代码语义。
 * 注意：不能做「整行 // 注释删除」——URL（https://…）与正则（/^https?:\/\//）
 * 里都含有 //，按行删注释会把代码切断。真正的压缩等引入 esbuild 后再做，
 * 当前收益主要来自 hash 长缓存（重复访问 0 字节），而非字节数本身。 */
function minifyJs(src) {
  return (
    src
      // 折叠连续空行（含多余缩进空行）
      .replace(/[ \t]*\r?\n[ \t\r\n]*\r?\n+/g, '\n')
      .trim() + '\n'
  )
}

/** 极简 CSS 压缩。⚠️ 非通用安全，对源码有两条硬约束（新增 CSS 时注意）：
 *  1. 不写「后代 + 伪类」选择器里的空格（.a :hover 会被折叠成 .a:hover，语义改变）；
 *     需要 `.a :hover` 语义时写成 `.a *:hover` 可绕开折叠。
 *  2. content 等字符串值里不要有连续空格（\s+ → ' ' 会改写字符串内容）。 */
function minifyCss(src) {
  return (
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,>+~])\s*/g, '$1')
      .trim() + '\n'
  )
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
