// 校验前端面板注册的接口路径与后端路由表是否一致。
//
// 前端 public/app.js 的 EPS 列表是手工维护的，容易与 src/router.ts 漂移：
//   - 面板中引用了后端未注册的路径 → 用户点击即 404（阻断性错误，脚本以非 0 退出）
//   - 后端已注册但面板未接入      → 接口存在却无人使用（提示，不阻断）
//
// 用法：pnpm run verify:endpoints

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROUTER_FILE = join(ROOT, 'src', 'router.ts')
const FRONTEND_FILE = join(ROOT, 'public', 'app.js')
const API_PREFIX = '/v2'

/** 把路由路径转成匹配正则，后端动态段（:id）视为任意非空片段 */
function toMatcher(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/:[^/]+/g, '[^/]+')}$`)
}

/** 提取后端 appRouter 上注册的路由，跳过被注释掉的待定路由 */
function parseBackendRoutes(source: string): string[] {
  const routes: string[] = []
  const pattern = /appRouter\.(?:get|all|post)\(\s*'([^']+)'/g

  for (const line of source.split(/\r?\n/)) {
    if (line.trimStart().startsWith('//')) continue
    for (const match of line.matchAll(pattern)) {
      routes.push(API_PREFIX + match[1])
    }
  }

  return routes
}

/** 提取前端 EPS 中引用的路径（去掉 query 部分），跳过被注释掉的条目 */
function parseFrontendPaths(source: string): string[] {
  const paths = new Set<string>()
  const pattern = /path\s*:\s*'([^']+)'/g

  for (const line of source.split(/\r?\n/)) {
    if (line.trimStart().startsWith('//')) continue
    for (const match of line.matchAll(pattern)) {
      const raw = match[1]
      if (raw.startsWith(API_PREFIX)) paths.add(raw.split('?')[0])
    }
  }

  return [...paths]
}

const backend = parseBackendRoutes(await readFile(ROUTER_FILE, 'utf-8'))
const frontend = parseFrontendPaths(await readFile(FRONTEND_FILE, 'utf-8'))

const orphans = frontend.filter((path) => !backend.some((route) => toMatcher(route).test(path)))
const unused = backend.filter((route) => !frontend.some((path) => toMatcher(route).test(path)))

console.log(`后端注册 ${backend.length} 个路由，前端引用 ${frontend.length} 个路径`)

if (unused.length) {
  console.warn(`\n[warn] 以下 ${unused.length} 个接口已注册但未接入面板（非错误）：`)
  for (const route of unused) console.warn(`  - ${route}`)
}

if (orphans.length) {
  console.error(`\n[error] 以下 ${orphans.length} 个路径被前端引用但后端未注册（访问会 404）：`)
  for (const path of orphans) console.error(`  - ${path}`)
  process.exit(1)
}

console.log('\n[ok] 前端引用的接口路径均已在后端注册')
