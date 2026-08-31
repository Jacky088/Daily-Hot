// 将 public/ 前端静态资源拷贝到 .edgeone/assets/，供 EdgeOne Makers 平台托管。
//
// 背景：edgeone makers build 的 StaticAssetsBuilder 在 outputDirectory 位于仓库根目录内时，
// 会把 .edgeone 自身当成源递归拷贝到 .edgeone/assets，导致静态资源丢失、页面 404。
// 这里显式把 public/ 拷进 .edgeone/assets，避免依赖该有 bug 的默认拷贝逻辑。
import { cpSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const src = join(root, 'public')
const dest = join(root, '.edgeone', 'assets')

mkdirSync(dest, { recursive: true })

if (existsSync(src)) {
  cpSync(src, dest, { recursive: true })
  console.log(`[copy-assets] copied ${src} -> ${dest}`)
} else {
  console.warn(`[copy-assets] source not found: ${src}`)
}
