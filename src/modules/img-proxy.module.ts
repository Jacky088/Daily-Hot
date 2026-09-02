import { Common } from '../common.ts'

import type { Context } from '@oak/oak'

// 图片代理：豆瓣图片服务有 Referer 防盗链——
// 无 Referer 返回 418、第三方 Referer 返回 403，仅豆瓣站内 Referer 放行。
// 浏览器无法伪造跨域 Referer，公共镜像又不可靠（viki.moe 已 429 限流），
// 故由服务端带豆瓣站内 Referer 拉图后同源透传。
// 白名单仅放行豆瓣图片域，防止被当作开放代理滥用。
// 注意：这里用普通函数而非 RouterMiddleware 泛型签名——
// 窄泛型中间件会让 oak Router 的路径推断产生联合类型，级联出全文件类型错误。

export async function handleImgProxy(ctx: Context) {
  const raw = ctx.request.url.searchParams.get('url') || ''
  if (!/^https:\/\/img\d*\.doubanio\.com\//.test(raw)) {
    ctx.response.status = 400
    ctx.response.body = 'invalid image host'
    return
  }
  try {
    const upstream = await fetch(raw, {
      headers: {
        'User-Agent': Common.chromeUA,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        // 伪装豆瓣站内请求以通过防盗链
        Referer: 'https://movie.douban.com/',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!upstream.ok) {
      ctx.response.status = 404
      return
    }
    ctx.response.status = 200
    ctx.response.headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
    // 海报基本不变更，浏览器长缓存即可，无需服务端再缓存占内存
    ctx.response.headers.set('Cache-Control', 'public, max-age=604800, immutable')
    ctx.response.body = await upstream.arrayBuffer()
  } catch {
    ctx.response.status = 504
  }
}
