// 将 public/ 前端静态资源拷贝到 .edgeone/assets/，供 EdgeOne Makers 平台托管。
//
// 必需性（实测确认）：edgeone makers build 本身不会把 public/ 拷进构建产物，
// 干净构建后 .edgeone/assets 下只会生成 .edgeone-assets-config.json。
// 缺少本步骤会导致部署后前端页面全部 404（云函数 /v2/* 不受影响，仍可正常访问）。
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
