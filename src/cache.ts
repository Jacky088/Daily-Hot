// 通用 TTL 内存缓存：避免高频请求触发上游风控
// - 命中且未过期：直接返回缓存，不打上游
// - 未命中或已过期：请求上游，成功后写入缓存
// - 请求失败：staleTtl 内回退旧数据兜底，避免直接报错

const store = new Map<string, { data: unknown; ts: number }>()

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  opts: { ttl?: number; staleTtl?: number } = {},
): Promise<T> {
  const { ttl = 5 * 60 * 1000, staleTtl = 2 * 60 * 60 * 1000 } = opts
  const hit = store.get(key)
  const now = Date.now()

  if (hit && now - hit.ts < ttl) {
    return hit.data as T
  }

  try {
    const data = await loader()
    store.set(key, { data, ts: now })
    return data
  } catch (e) {
    if (hit && now - hit.ts < staleTtl) {
      return hit.data as T
    }
    throw e
  }
}
