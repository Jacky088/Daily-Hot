import { Common } from '../common.ts'

import type { Context } from '@oak/oak'

// 图片代理：豆瓣图片服务有 Referer 防盗链——
// 无 Referer 返回 418、第三方 Referer 返回 403，仅豆瓣站内 Referer 放行。
// 浏览器无法伪造跨域 Referer，公共镜像又不可靠（viki.moe 已 429 限流），
// 故由服务端带豆瓣站内 Referer 拉图后同源透传。
// 白名单仅放行豆瓣图片域，防止被当作开放代理滥用。
// 注意：这里用普通函数而非 RouterMiddleware 泛型签名——
// 窄泛型中间件会让 oak Router 的路径推断产生联合类型，级联出全文件类型错误。

/** 单张图片大小上限：豆瓣海报正常几百 KB，超过这个量级不该被当作图片透传 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const DOUBAN_IMG_HOST = /^img\d*\.doubanio\.com$/

export async function handleImgProxy(ctx: Context) {
  const raw = ctx.request.url.searchParams.get('url') || ''

  // 先解析成 URL 再校验 hostname。直接拿正则去匹配原始字符串的话，
  // 「校验的对象」和「实际请求的对象」是两份数据，两者对转义/归一化的理解
  // 一旦有出入就可能被绕过；解析后校验，两者必然是同一个。
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    ctx.response.status = 400
    ctx.response.body = 'invalid image url'
    return
  }

  if (target.protocol !== 'https:' || !DOUBAN_IMG_HOST.test(target.hostname)) {
    ctx.response.status = 400
    ctx.response.body = 'invalid image host'
    return
  }

  try {
    const upstream = await fetch(target, {
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

    // 只放行图片类型：上游若返回 HTML，原样透传等于把这台服务器当开放代理使
    const type = upstream.headers.get('content-type') || ''
    if (!type.startsWith('image/')) {
      ctx.response.status = 415
      ctx.response.body = 'upstream is not an image'
      return
    }

    // 读完再按实际字节数判定，不依赖上游给的 content-length（它可能缺失或不准）
    const buffer = await upstream.arrayBuffer()
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      ctx.response.status = 413
      ctx.response.body = 'image too large'
      return
    }

    ctx.response.status = 200
    ctx.response.headers.set('Content-Type', type)
    // 海报基本不变更，浏览器长缓存即可，无需服务端再缓存占内存
    ctx.response.headers.set('Cache-Control', 'public, max-age=604800, immutable')
    ctx.response.body = buffer
  } catch {
    ctx.response.status = 504
  }
}
