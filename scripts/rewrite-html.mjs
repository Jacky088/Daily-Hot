// 发版前把 index.html 里的 /app.js、/emoji.js、/style.css 引用按
// public/dist/asset-manifest.json 改写成 hash 产物（/dist/app.[hash].js …）。
//
// 为什么是独立脚本而不是构建时直接改源码：
//   - 源码 index.html 保持手写引用（/app.js），本地 dev（node.ts）与预览无需构建；
//   - 只有发往 CDN/Workers/EdgeOne 的分发版才改写，verify-endpoints 扫源码不受影响；
//   - 改写幂等：已是 /dist/ 引用时跳过，可反复执行。
//
// 用法：node scripts/rewrite-html.mjs [input] [output]
//   默认 input=public/index.html，output=public/dist/index.html。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 按 manifest 把 html 里的源码引用替换成 hash 产物引用（幂等，输出统一 LF 行尾） */
export function rewriteHtml(html, manifest) {
  // 行尾归一化：工作区可能是 CRLF（core.autocrlf），产物内容必须与机器无关，
  // 否则 build-frontend --check 的内容比对在 CI（LF）上必挂
  let out = html.replace(/\r\n/g, '\n')
  const swaps = [
    ['/style.css', '/style.css'],
    ['/emoji.js', '/emoji.js'],
    ['/app.js', '/app.js'],
  ]
  for (const [tag, srcName] of swaps) {
    const key = srcName.replace(/^\//, '')
    const hashed = manifest[key]
    if (!hashed) continue
    const from = `"${tag}"`
    const to = `"${'/' + hashed}"`
    if (out.includes(from)) out = out.split(from).join(to)
  }
  return out
}

// 直接执行（node scripts/rewrite-html.mjs）时走 CLI；被 import 时只暴露 rewriteHtml
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = process.cwd()
  const input = process.argv[2] ? join(root, process.argv[2]) : join(root, 'public', 'index.html')
  const output = process.argv[3] ? join(root, process.argv[3]) : join(root, 'public', 'dist', 'index.html')

  const manifestPath = join(root, 'public', 'dist', 'asset-manifest.json')
  if (!existsSync(manifestPath)) {
    console.error('[rewrite-html] 先运行 node scripts/build-frontend.mjs 生成 dist')
    process.exit(1)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const out = rewriteHtml(readFileSync(input, 'utf-8'), manifest)

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, out)
  console.log(`[rewrite-html] ${input} -> ${output}`)
}
