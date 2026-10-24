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
    // 前端确认只用 clipboard 与 fullscreen（grep app.js/index.html/wallpaper.html），
    // 不用的摄像头/麦克风/定位直接禁死，防第三方脚本借页面能力
    ctx.response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    // CSP 先以 Report-Only 观察不拦截：面板是大量内联脚本/样式的单文件前端，
    // 直接 enforce 必炸。这份策略记录「若收紧会拦到什么」，为将来收紧提供依据
    ctx.response.headers.set(
      'Content-Security-Policy-Report-Only',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src * data: blob:; media-src *; font-src 'self' data:; connect-src *; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    )

    // 快速响应 OPTIONS 预检请求
    if (ctx.request.method === 'OPTIONS') {
      ctx.response.status = 204
      return
    }

    await next()
  }
}
