import { Common } from './common.ts'

/**
 * 上游抓取统一入口：超时 + 1 次重试 + 默认 UA。
 *
 * 为什么需要它：各模块之前都是裸 fetch，上游一 hang 就拖住整条请求
 *（聚合页最坏要等 12s 单源超时）。这里默认 8s 超时、失败自动重试一次；
 * 返回值就是标准 Response，调用方无需改解析逻辑。
 */

export interface FetchUpstreamOptions extends RequestInit {
  /** 超时毫秒，默认 8000 */
  timeoutMs?: number
  /** 失败重试次数（不含首次），默认 1 */
  retry?: number
}

function timeoutSignal(ms: number, outer?: AbortSignal | null) {
  const ctrl = new AbortController()
  const onOuterAbort = () => ctrl.abort(outer!.reason)
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason)
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new Error('upstream timeout')), ms)
  try {
    // Node 下避免这个计时器拖住进程退出；Workers 下无此 API 则跳过
    ;(timer as unknown as { unref?: () => void }).unref?.()
  } catch {}
  return {
    signal: ctrl.signal,
    /** fetch 落定（拿到响应头或抛错）后调用：清定时器、摘掉 outer 监听，
     * 避免高 QPS 下每请求滞留一个 8s 定时器。注意超时语义随之收敛为
     * 「到响应头」：响应体阶段不再被本定时器掐断（与优化前的裸 fetch 一致；
     * 聚合榜另有 withTimeout 兜底单源总时长）。 */
    dispose: () => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuterAbort)
    },
  }
}

export async function fetchUpstream(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<Response> {
  const { timeoutMs = 8000, retry = 1, headers, ...rest } = opts
  const mergedHeaders = new Headers(headers)
  if (!mergedHeaders.has('User-Agent')) mergedHeaders.set('User-Agent', Common.chromeUA)

  let lastError: unknown = null
  for (let attempt = 0; attempt <= retry; attempt++) {
    const { signal, dispose } = timeoutSignal(timeoutMs, opts.signal as AbortSignal | null | undefined)
    try {
      const res = await fetch(url, { ...rest, headers: mergedHeaders, signal })
      dispose()
      // 5xx 视为可重试（上游抖动常见），4xx 直接返回由调用方判定
      if (res.status >= 500 && attempt < retry) {
        await res.arrayBuffer().catch(() => null)
        lastError = new Error(`upstream HTTP ${res.status}`)
        continue
      }
      return res
    } catch (e) {
      dispose()
      lastError = e
      if (attempt < retry) continue
      throw e
    }
  }
  throw lastError
}

/** 抓取并按 JSON 解析（带超时重试），失败抛错由 cached 层走 stale 兜底 */
export async function fetchUpstreamJson<T = unknown>(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<T> {
  const res = await fetchUpstream(url, opts)
  if (!res.ok) throw new Error(`upstream HTTP ${res.status} for ${new URL(url).hostname}`)
  return (await res.json()) as T
}

/** 抓取并按文本解析（抓页类模块用） */
export async function fetchUpstreamText(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<string> {
  const res = await fetchUpstream(url, opts)
  if (!res.ok) throw new Error(`upstream HTTP ${res.status} for ${new URL(url).hostname}`)
  return await res.text()
}
