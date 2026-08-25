import type { Middleware } from '@oak/oak'

export function cors(): Middleware {
  return async (ctx, next) => {
    ctx.response.headers.set('Access-Control-Allow-Origin', '*')
    ctx.response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, Referer, User-Agent')
    ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    ctx.response.headers.set('Access-Control-Max-Age', '86400')

    // 快速响应 OPTIONS 预检请求
    if (ctx.request.method === 'OPTIONS') {
      ctx.response.status = 204
      return
    }

    await next()
  }
}
