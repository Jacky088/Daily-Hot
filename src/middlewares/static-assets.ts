import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'

import type { Middleware } from '@oak/oak'

// 安全获取 public 目录路径（兼容 Node / Bun / Deno / Workers）
let publicDir = ''
try {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  // src/middlewares/ → ../../ = 项目根目录
  publicDir = join(moduleDir, '..', '..', 'public')
  if (!existsSync(publicDir)) publicDir = ''
} catch {
  // Workers 等环境无 import.meta.url 或 fs，静默跳过
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/**
 * 为非 Worker 运行时（Node / Bun / Deno）提供 public/ 目录的静态资源服务。
 * Cloudflare Workers 通过 wrangler.toml [assets] 配置处理静态文件，不走此中间件。
 */
export function staticAssets(): Middleware {
  // public 目录不存在时（如 Worker 环境无 fs），静默跳过
  if (!publicDir || !existsSync(publicDir)) {
    return async (_ctx, next) => { await next() }
  }

  return async (ctx, next) => {
    const path = ctx.request.url.pathname

    // 只处理 GET 和 HEAD 请求
    if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
      await next()
      return
    }

    // API 路由和功能路由交给后续处理
    if (path.startsWith('/v2') || path === '/health' || path === '/endpoints') {
      await next()
      return
    }

    // 根路径 → index.html
    const filePath = path === '/' ? join(publicDir, 'index.html') : resolve(publicDir, path)

    // 防止路径穿越：规范化后必须仍在 publicDir 内（含分隔符，避免前缀误判）
    const safeRoot = resolve(publicDir) + sep
    const safeFile = filePath + sep
    if (!safeFile.startsWith(safeRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      await next()
      return
    }

    try {
      const content = await readFile(filePath)
      const ext = filePath.slice(filePath.lastIndexOf('.'))
      ctx.response.headers.set('Content-Type', MIME[ext] || 'application/octet-stream')
      ctx.response.body = content
    } catch {
      // 文件不存在，交给后续路由
      await next()
    }
  }
}
