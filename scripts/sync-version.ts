// 发版时同步版本号：single source of truth。
//
// 背景：前端 public/app.js 的 CACHE_VERSION 与 public/sw.js 的 CACHE_NAME
// 之前靠人手递增，漏改一次老用户就卡旧代码半小时。现在：
//   1. bumpp 发版改 version 后，执行 `pnpm run sync:version`
//   2. 本脚本把 version 写进 app.js（CACHE_VERSION）与 sw.js（CACHE_NAME）
// 可选 --sw-only：只同步 sw（日常小改不动缓存键时用）
//
// 用法：node ./scripts/sync-version.ts [--sw-only]

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP_JS = join(ROOT, 'public', 'app.js')
const SW_JS = join(ROOT, 'public', 'sw.js')

const swOnly = process.argv.includes('--sw-only')
const version = (pkg as { version: string }).version

// app.js：const CACHE_VERSION = 'v18'; → const CACHE_VERSION = 'v1.16.0';
if (!swOnly) {
  const appJs = await readFile(APP_JS, 'utf-8')
  const next = appJs.replace(/const CACHE_VERSION = '[^']*';/, `const CACHE_VERSION = 'v${version}';`)
  if (next === appJs) throw new Error('CACHE_VERSION 未找到，同步失败')
  await writeFile(APP_JS, next)
  console.log(`app.js CACHE_VERSION → v${version}`)
}

// sw.js：const CACHE_NAME = 'daily-hot-v52'; → const CACHE_NAME = 'daily-hot-v1.16.0';
{
  const swJs = await readFile(SW_JS, 'utf-8')
  const next = swJs.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'daily-hot-v${version}';`)
  if (next === swJs) throw new Error('CACHE_NAME 未找到，同步失败')
  await writeFile(SW_JS, next)
  console.log(`sw.js CACHE_NAME → daily-hot-v${version}`)
}
