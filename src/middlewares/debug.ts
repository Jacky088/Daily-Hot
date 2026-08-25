import { serviceIP } from '../modules/ip.module.ts'

import type { Middleware } from '@oak/oak'

// 日志中需要脱敏的查询参数名（小写匹配）
const SENSITIVE_PARAMS = ['password', 'secret', 'token', 'text', 'content', 'url', 'domain']

function redactUrl(href: string): string {
  try {
    const u = new URL(href)
    const sp = u.searchParams
    for (const key of [...sp.keys()]) {
      if (SENSITIVE_PARAMS.includes(key.toLowerCase())) {
        sp.set(key, '[REDACTED]')
      }
    }
    return u.toString()
  } catch {
    return href.split('?')[0]
  }
}

export function debug(): Middleware {
  return async (ctx, next) => {
    const ua = ctx.request.headers?.get('user-agent') || ''
    const referrer = ctx.request.headers?.get('referer') || ''
    const ip = serviceIP.getClientIP(ctx.request.headers) || ctx.request.ip || '-'
    const url = redactUrl(ctx.request.url.href || '')
    const method = ctx.request.method || ''
    const date = new Date().toLocaleString('zh-CN')

    console.log(`[${date}] [${ip}] ${method.toUpperCase()} ${url} (${ua || '未知 UA'})`)

    if (referrer) console.log(`[${date}] [${ip}] Referrer: ${referrer}`)

    await next()
  }
}
