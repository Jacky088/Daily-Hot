// force-update 最小间隔防护：同一接口对同一调用方 60 秒内只允许绕过缓存一次
// 防止攻击者通过 ?force-update=1 高频绕过缓存，放大对上游 API 的请求压力

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
