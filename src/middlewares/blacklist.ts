import { config } from '../config.ts'
import { Common } from '../common.ts'
import { serviceIP } from '../modules/ip.module.ts'

import type { Middleware } from '@oak/oak'

// 黑名单 IP 列表，环境变量格式为 JSON 数组字符串。
// 惰性解析：Cloudflare Workers 的 process.env 由 nodejs_compat 在运行时注入，
// 模块顶层求值可能早于注入时机，放到首次请求再解析才能确保读到值。
// 解析非法时安全降级为空列表，避免整个服务崩溃。
let list: string[] | null = null

function getList(): string[] {
  if (list) return list

  let parsed: string[] = []

  try {
    parsed = process.env.BLACKLIST_IPS ? JSON.parse(process.env.BLACKLIST_IPS) : []
  } catch (e) {
    console.warn('[BLACKLIST] 环境变量 BLACKLIST_IPS 解析失败，已降级为空列表:', e)
  }

  list = parsed

  return list
}

export function blacklist(): Middleware {
  return async (ctx, next) => {
    // 必须与限流中间件一致：优先取 cf-connecting-ip（Cloudflare 平台设置，客户端无法伪造）。
    // 仅用 ctx.request.ip 在 Workers 上恒为空（fetch 处理器没有真实 socket），会导致黑名单失效。
    const ip = serviceIP.getClientIP(ctx.request.headers) || ctx.request.ip
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
