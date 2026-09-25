import type { Middleware } from '@oak/oak'

export function cors(): Middleware {
  return async (ctx, next) => {
    ctx.response.headers.set('Access-Control-Allow-Origin', '*')
    ctx.response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, Referer, User-Agent')
    // 跨域调用方也能读到数据时间头（同源前端不受限，这里为 API 使用者放开）
    ctx.response.headers.set('Access-Control-Expose-Headers', 'X-Data-Updated')
    ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    ctx.response.headers.set('Access-Control-Max-Age', '86400')
    // 基础安全头：API 全部是 JSON/文本，不需要嗅探与被嵌套
    ctx.response.headers.set('X-Content-Type-Options', 'nosniff')
    ctx.response.headers.set('Referrer-Policy', 'no-referrer')
    // 同源前端嵌套不受影响，第三方站点无法把面板 iframe 进去做点击劫持
    ctx.response.headers.set('X-Frame-Options', 'SAMEORIGIN')

    // 快速响应 OPTIONS 预检请求
    if (ctx.request.method === 'OPTIONS') {
      ctx.response.status = 204
      return
    }

    await next()
  }
}
