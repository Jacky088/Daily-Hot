// force-update 最小间隔防护：同一接口对同一调用方 60 秒内只允许绕过缓存一次
// 防止攻击者通过 ?force-update=1 高频绕过缓存，放大对上游 API 的请求压力

import { AsyncLocalStorage } from 'node:async_hooks'
import { serviceIP } from './modules/ip.module.ts'

// 只声明用到的字段，避免与 Oak 的 RouterContext 泛型签名耦合
interface RequestLike {
  url: URL
  ip?: string
  headers: Headers
}

const MIN_INTERVAL_MS = 60 * 1000 // 同一 key 60 秒内仅允许一次强制刷新
const TRACK_TTL_MS = 5 * 60 * 1000 // 5 分钟无访问后清理记录

interface Track {
  lastForce: number
  lastSeen: number
}

const tracker = new Map<string, Track>()
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  for (const [k, t] of tracker) {
    if (now - t.lastSeen > TRACK_TTL_MS) tracker.delete(k)
  }
  lastCleanup = now
}

/**
 * 判断是否允许本次 force-update。
 * @param key 标识维度，通常为 接口路径 + 客户端 IP
 * @returns true 允许强制刷新；false 表示 60 秒内已用过，需走缓存
 */
export function allowForceUpdate(key: string): boolean {
  cleanup()
  const now = Date.now()
  const t = tracker.get(key)
  if (!t) {
    tracker.set(key, { lastForce: now, lastSeen: now })
    return true
  }
  t.lastSeen = now
  if (now - t.lastForce >= MIN_INTERVAL_MS) {
    t.lastForce = now
    return true
  }
  return false
}

/** 生成 force-update 跟踪 key */
export function forceUpdateKey(path: string, ip: string): string {
  return `${path}@${ip}`
}

/**
 * 通过 AsyncLocalStorage 把「本次请求是否允许强制刷新」透传给下游。
 * 这样 src/cache.ts 的 cached() 无需每个调用点显式传参即可支持 force-update，
 * 各模块也不必重复写「解析 query + 取客户端 IP + 调 allowForceUpdate」这三行。
 * Node / Bun / Deno / Cloudflare Workers（nodejs_compat）均支持 AsyncLocalStorage。
 */
const forceStorage = new AsyncLocalStorage<boolean>()

/**
 * 解析本次请求的 force-update 意图，并执行最小间隔防护。
 * 带 ?force-update=1（任意值）且未触发 60 秒限流时返回 true。
 */
export function resolveForceUpdate(request: RequestLike): boolean {
  if (!request.url.searchParams.has('force-update')) return false

  const ip = serviceIP.getClientIP(request.headers) || request.ip || 'unknown'

  return allowForceUpdate(forceUpdateKey(request.url.pathname, ip))
}

/** 在 force-update 上下文中执行 fn，使其内部调用 isForceUpdate() 能读到本次请求的标志 */
export function runWithForceUpdate<T>(force: boolean, fn: () => Promise<T>): Promise<T> {
  return forceStorage.run(force, fn)
}

/**
 * 供缓存层读取：本次请求是否要求绕过缓存回源。
 * 在 ALS 上下文之外（如定时预热、脚本调用）始终返回 false，即默认走正常缓存。
 */
export function isForceUpdate(): boolean {
  return forceStorage.getStore() === true
}
