import { serviceIP } from '../modules/ip.module.ts'
import { Common } from '../common.ts'

import type { Middleware } from '@oak/oak'

// 令牌桶限流：允许短时突发，同时限制持续速率
// - 容量 capacity：桶最多存 60 个令牌
// - 补充速率 refillRate：每 500ms 补 1 个令牌（即每分钟 120 个的持续速率上限）
//
// 作用域：仅统计 /v2 API。首页静态资源（html/js/css/sw）由浏览器与 CDN 缓存，
// 若一并计入令牌，「打开一次页面」就会消耗掉大半突发额度，反而误伤正常用户。
//
// 局限：计数存放在实例内存中，仅对 Node / Bun / Deno / Docker 这类长驻单进程部署完全有效。
// Cloudflare Workers 为多 isolate 分布式运行，各实例独立计数且随冷启动清零，
// 只能起到单实例兜底作用，无法作为全局配额。需要强一致限流请改用 Durable Objects / KV。

const CAPACITY = 60 // 突发上限
const REFILL_INTERVAL_MS = 500 // 每 500ms 补 1 个令牌
const BUCKET_TTL_MS = 5 * 60 * 1000 // 空桶 5 分钟后清理，避免长期累积

interface Bucket {
  tokens: number
  lastRefill: number
  lastSeen: number
}

const buckets = new Map<string, Bucket>()

// 定期清理长时间未访问的桶，避免内存无限增长
function cleanupBuckets() {
  const now = Date.now()
  for (const [ip, b] of buckets) {
    if (now - b.lastSeen > BUCKET_TTL_MS) buckets.delete(ip)
  }
}
// 每分钟清理一次（惰性触发，无需定时器依赖）
let lastCleanup = Date.now()

export function rateLimit(): Middleware {
  return async (ctx, next) => {
    // 非 API 请求直接放行，不消耗令牌
    if (!ctx.request.url.pathname.startsWith('/v2')) {
      await next()
      return
    }

    const now = Date.now()
    if (now - lastCleanup > 60_000) {
      cleanupBuckets()
      lastCleanup = now
    }

    // 优先使用真实客户端 IP（cf-connecting-ip）；取不到则回退到 oak 的连接 IP
    const ip = serviceIP.getClientIP(ctx.request.headers) || ctx.request.ip || 'unknown'

    let bucket = buckets.get(ip)
    if (!bucket) {
      bucket = { tokens: CAPACITY, lastRefill: now, lastSeen: now }
      buckets.set(ip, bucket)
    }
    bucket.lastSeen = now

    // 按时间差补充令牌
    const elapsed = now - bucket.lastRefill
    const refill = Math.floor(elapsed / REFILL_INTERVAL_MS)
    if (refill > 0) {
      bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill)
      bucket.lastRefill = bucket.lastRefill + refill * REFILL_INTERVAL_MS
    }

    // 消耗一个令牌
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      await next()
      return
    }

    // 限流命中：返回 429 + Retry-After
    const retryAfterSec = Math.ceil((REFILL_INTERVAL_MS - (now - bucket.lastRefill)) / 1000) || 1
    ctx.response.status = 429
    ctx.response.headers.set('Retry-After', String(retryAfterSec))
    ctx.response.body = Common.buildJson(null, 429, '请求过于频繁，请稍后再试')
  }
}
