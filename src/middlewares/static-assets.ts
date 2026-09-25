import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'

import { env } from '../runtime-env.ts'
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
 *
 * 缓存策略（对应 public/sw.js 的 Network-First，互补不冲突）：
 *   - `/` 入口：生产优先返回 dist/ 构建版 index.html（引用 hash 产物），
 *     DEV=1 或 dist 缺失时回退源码版；两种入口本身都是 no-cache（每次回源拿最新引用）
 *   - app.js / style.css / emoji.js（源码直发，本地 dev 用）：no-cache
 *   - /dist/*（构建产物，内容 hash 命名）：immutable 一年，重复访问 0 字节
 *   - logos / emoji / 图标：public, max-age=1y, immutable（内容寻址，几乎不变）
 *   - manifest / apple-touch-icon：public, max-age=1d
 * 200 响应带 ETag（文件 mtime+size），If-None-Match 命中时返回 304 空体省带宽。
 */
export function staticAssets(): Middleware {
  // public 目录不存在时（如 Worker 环境无 fs），静默跳过
  if (!publicDir || !existsSync(publicDir)) {
    return async (_ctx, next) => {
      await next()
    }
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

    // 根路径：生产优先用 dist 构建版（引用 hash 产物，压缩 + immutable 长缓存）；
    // dev（node.ts --watch）用源码版，改前端源码刷新即生效，无需每次重建 dist
    let filePath: string
    if (path === '/') {
      const distHtml = join(publicDir, 'dist', 'index.html')
      filePath = !env('DEV') && existsSync(distHtml) ? distHtml : join(publicDir, 'index.html')
    } else {
      // 其余用 join 拼接（resolve 会把 / 开头视为绝对路径导致 404）
      filePath = join(publicDir, path)
    }

    // 防止路径穿越：解析后必须仍在 publicDir 内；一次 statSync 同时完成存在性与文件判定
    const safeRoot = resolve(publicDir) + sep
    const safeFile = resolve(filePath) + sep
    let st: ReturnType<typeof statSync> | null = null
    try {
      st = statSync(filePath)
    } catch {
      st = null
    }
    if (!safeFile.startsWith(safeRoot) || !st?.isFile()) {
      await next()
      return
    }

    try {
      // 轻量 ETag：mtime + size；条件请求命中（If-None-Match）直接 304 空体，
      // 浏览器用本地副本，省掉重复回源的传输体积
      const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`
      ctx.response.headers.set('ETag', etag)
      if (ctx.request.headers.get('if-none-match') === etag) {
        ctx.response.status = 304
        ctx.response.body = null
        return
      }

      const content = await readFile(filePath)
      const ext = filePath.slice(filePath.lastIndexOf('.'))
      ctx.response.headers.set('Content-Type', MIME[ext] || 'application/octet-stream')
      // 分级缓存：入口与无 hash 的 JS/CSS 每次回源（发版即时生效），
      // 不可变图标资源长缓存（SW 侧已做 SWR，这里再给浏览器一年 immutable）
      ctx.response.headers.set('Cache-Control', cacheControlFor(path))
      ctx.response.body = content
    } catch {
      // 文件不存在，交给后续路由
      await next()
    }
  }
}

/** 按路径/扩展名给出 Cache-Control（见文件头注释的策略） */
function cacheControlFor(path: string): string {
  if (path === '/' || path === '/index.html' || path === '/wallpaper.html') return 'no-cache'
  if (path.startsWith('/logos/') || path.startsWith('/emoji/')) return 'public, max-age=31536000, immutable'
  if (path === '/manifest.json' || path === '/apple-touch-icon.png') return 'public, max-age=86400'
  // 构建产物（/dist/app.[hash].js）：文件名即内容寻址，hash 变化即新文件，
  // 给一年 immutable，重复访问 0 字节；index.html 保持 no-cache，
  // 每次回源拿最新引用，发版即时生效（见 scripts/build-frontend.mjs）
  if (path.startsWith('/dist/')) return 'public, max-age=31536000, immutable'
  // 开发服务器每次都回源：无缓存头时浏览器启发式缓存会拿到过期 JS/CSS，
  // 表现为改了代码页面不更新。生产走 CF Workers assets（自带协商缓存）不受影响。
  return 'no-cache'
}
