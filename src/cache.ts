// 通用 TTL 内存缓存：避免高频请求触发上游风控
// - 命中且未过期：直接返回缓存，不打上游
// - 未命中或已过期：请求上游，成功后写入缓存
// - 请求失败：staleTtl 内回退旧数据兜底，避免直接报错
// - force-update：跳过新鲜缓存直接回源，回源失败仍走 stale 兜底
// - 容量上限：避免无限制增长导致内存耗尽（DoS 防护）

import { AsyncLocalStorage } from 'node:async_hooks'

import { isForceUpdate } from './force-update-guard.ts'

const MAX_CACHE_SIZE = 500

const store = new Map<string, { data: unknown; ts: number }>()

// ============ 数据时间追踪 ============
// 每个响应都该回答一个问题：这份数据是什么时候的？
// 前端用它在 Hero 卡显示「更新于」——比「用户打开页面的时间」准确得多，
// 服务端缓存命中时尤其明显（数据可能是几分钟前抓的，而不是「刚刚」）。
// 一个请求内可能多次调用 cached()（如天气同时取 IP 定位与出口 IP），取其最大值：
// 只要响应里有一部分是刚回源的，整份响应的新鲜度就至少到那一刻。
const dataTsStorage = new AsyncLocalStorage<number[]>()

/** 在「数据时间追踪」上下文中执行 fn（由中间件包裹整个请求） */
export function runWithDataTs<T>(fn: () => Promise<T>): Promise<T> {
  return dataTsStorage.run([], fn)
}

/** 记录一次数据时间：命中缓存记缓存条目的 ts，回源记当前时刻 */
function trackDataTs(ts: number) {
  dataTsStorage.getStore()?.push(ts)
}

/**
 * 读取本次请求的数据时间。
 * 返回 null 表示这个接口没走过缓存层（数据即抓即用），前端退回本地时刻即可。
 */
export function getDataTs(): number | null {
  const list = dataTsStorage.getStore()
  return list && list.length ? Math.max(...list) : null
}

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttl?: number; staleTtl?: number } = {},
): Promise<T> {
  const { ttl = 5 * 60 * 1000, staleTtl = 2 * 60 * 60 * 1000 } = opts
  const hit = store.get(key)
  const now = Date.now()

  // 缓存新鲜且未要求强制刷新时直接命中
  if (hit && now - hit.ts < ttl && !isForceUpdate()) {
    trackDataTs(hit.ts)
    return hit.data as T
  }

  try {
    const data = await loader()
    // 容量上限：超出时淘汰最早的条目（近似 LRU）
    if (store.size >= MAX_CACHE_SIZE) {
      const firstKey = store.keys().next().value
      if (firstKey != null) store.delete(firstKey)
    }
    store.set(key, { data, ts: now })
    trackDataTs(now)
    return data
  } catch (e) {
    if (hit && now - hit.ts < staleTtl) {
      trackDataTs(hit.ts)
      return hit.data as T
    }
    throw e
  }
}
