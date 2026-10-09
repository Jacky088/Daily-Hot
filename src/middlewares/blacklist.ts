import { config } from '../config.ts'
import { Common } from '../common.ts'
import { env } from '../runtime-env.ts'
import { serviceIP } from '../modules/ip.module.ts'

import type { Middleware } from '@oak/oak'

// 黑名单 IP 列表，环境变量格式为 JSON 数组字符串。
// 惰性解析：Cloudflare Workers 的 env 由 cf-worker.ts 在收到请求时注入，
// 模块顶层求值可能早于注入时机，放到首次请求再解析才能确保读到值。
// 解析非法时安全降级为空列表，避免整个服务崩溃。
let list: string[] | null = null

function getList(): string[] {
  if (list) return list

  let parsed: string[] = []

  try {
    parsed = env('BLACKLIST_IPS') ? JSON.parse(env('BLACKLIST_IPS')!) : []
  } catch (e) {
    console.warn('[BLACKLIST] 环境变量 BLACKLIST_IPS 解析失败，已降级为空列表:', e)
  }

  list = parsed

  return list
}

export function blacklist(): Middleware {
  return async (ctx, next) => {
    // 必须与限流中间件一致：优先取平台注入或受信任反代 IP，未信任反代时回退到 socket 连接 IP，防范头伪造
    const ip = serviceIP.getClientIP(ctx.request.headers, ctx.request.ip, { forSecurity: true }) || ctx.request.ip
    const ua = ctx.request.headers.get('User-Agent') || '-'
    const url = ctx.request.url
    const blocked = getList()

    Common.debug(`[BLACKLIST] blacklist IP list: ${blocked.join(', ')}`)

    if (ip && blocked.includes(ip)) {
      ctx.response.status = 403
      ctx.response.body = Common.buildJson(
        null,
        403,
        `由于滥用等原因，该 IP (${ip}) 已被禁止，如有疑问请联系 ${config.author}`,
      )

      console.log(`[BLACKLIST] Blocked request from IP: ${ip}, URL: ${url}, UA: ${ua}`)

      return
    }

    await next()
  }
}
