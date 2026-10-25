// Vercel 部署的函数打包步骤（vercel.json buildCommand 调用）。
// 产物命名为 .ts 而非 .js 是刻意的：@vercel/node 对 .js 入口只做原样收录，
// 入口会嵌在 .func/api/[[...path]].js 而不是规范要求的根级 index.js，函数无法启动；
// .ts 入口会走标准编译流程，产出根级 index.js（内容是无类型纯 JS，转译即恒等）。
// 为什么用脚本而不是在 buildCommand 里内联 esbuild 命令：
//   产物文件名含 [[...path]] 方括号，部分 shell（Windows cmd）会把它连同
//   引号一起传给 esbuild，导致 mkdir 语法错误——JS API 传参不经过 shell；
//   另外顺带把 dist 版首页复制为 public/index.html（等价原来的 cp 步骤），
//   让根路径在 Vercel 上也走 hash 产物入口（与 Workers/Docker 行为一致）。
import { copyFileSync } from 'node:fs'

import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['vercel-api.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'api/[[...path]].ts',
  banner: { js: '// @ts-nocheck' },
  logLevel: 'error',
})

copyFileSync('public/dist/index.html', 'public/index.html')
console.log('[build-vercel] api/[[...path]].ts 打包完成，dist 首页已同步为根入口')
