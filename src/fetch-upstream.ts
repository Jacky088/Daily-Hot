import { Common } from './common.ts'

/**
 * 上游抓取统一入口：超时 + 1 次重试 + 默认 UA。
 *
 * 为什么需要它：各模块之前都是裸 fetch，上游一 hang 就拖住整条请求
 *（聚合页最坏要等 12s 单源超时）。这里默认 8s 超时、失败自动重试一次；
 * 返回值就是标准 Response，调用方无需改解析逻辑。
 */

export class CircuitBreakerError extends Error {
  readonly host: string
  constructor(host: string) {
    super(`上游服务暂时不可用，已触发熔断保护: ${host}`)
    this.name = 'CircuitBreakerError'
    this.host = host
  }
}

interface CircuitState {
  failures: number
  nextAttempt: number
  isOpen: boolean
}

const circuitMap = new Map<string, CircuitState>()
const FAILURE_THRESHOLD = 5 // 连续 5 次超时或 5xx 失败触发熔断
const COOLDOWN_MS = 30_000 // 熔断冷却 30 秒

export function resetCircuitBreaker(): void {
  circuitMap.clear()
}

export interface FetchUpstreamOptions extends RequestInit {
  /** 超时毫秒，默认 8000 */
  timeoutMs?: number
  /** 失败重试次数（不含首次），默认 1 */
  retry?: number
  /** 是否跳过熔断器检查 */
  ignoreCircuitBreaker?: boolean
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

function getHost(url: string | URL): string {
  try {
    return (typeof url === 'string' ? new URL(url) : url).hostname
  } catch {
    return ''
  }
}

export async function fetchUpstream(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<Response> {
  const { timeoutMs = 8000, retry = 1, headers, ignoreCircuitBreaker = false, ...rest } = opts
  const host = getHost(url)

  if (!ignoreCircuitBreaker && host) {
    const state = circuitMap.get(host)
    if (state && state.isOpen) {
      if (Date.now() < state.nextAttempt) {
        throw new CircuitBreakerError(host)
      }
      // 冷却时间已过，放行本次单请求探测 (Half-Open)
    }
  }

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
      if (res.status < 500 && host && circuitMap.has(host)) {
        circuitMap.delete(host)
      }
      return res
    } catch (e) {
      dispose()
      lastError = e
      if (attempt < retry) continue
      break
    }
  }

  if (host) {
    const now = Date.now()
    const state = circuitMap.get(host) || { failures: 0, nextAttempt: 0, isOpen: false }
    state.failures += 1
    if (state.failures >= FAILURE_THRESHOLD) {
      state.isOpen = true
      state.nextAttempt = now + COOLDOWN_MS
    }
    circuitMap.set(host, state)
  }

  throw lastError
}

/** 抓取并按 JSON 解析（带超时重试），失败抛错由 cached 层走 stale 兜底 */
export async function fetchUpstreamJson<T = unknown>(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<T> {
  const res = await fetchUpstream(url, opts)
  if (!res.ok) throw new Error(`upstream HTTP ${res.status} for ${new URL(url).hostname}`)
  return JSON.parse(await readBodyLimited(res)) as T
}

/** 抓取并按文本解析（抓页类模块用） */
export async function fetchUpstreamText(url: string | URL, opts: FetchUpstreamOptions = {}): Promise<string> {
  const res = await fetchUpstream(url, opts)
  if (!res.ok) throw new Error(`upstream HTTP ${res.status} for ${new URL(url).hostname}`)
  return readBodyLimited(res)
}

/**
 * 响应体统一上限：热榜 JSON / 抓页 HTML 正常在几十 KB 量级，超出 10MB 的响应
 * 只可能是异常（上游被劫持、循环重定向页等），整包 res.text()/json() 会让
 * 内存跟着响应体走，这里流式读取并在超限时掐断。
 */
const MAX_BODY_BYTES = 10 * 1024 * 1024

async function readBodyLimited(res: Response, limit = MAX_BODY_BYTES): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (total < limit) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    // 达到上限时取消剩余流，及时释放连接；正常读完时 cancel 是无害的
    await reader.cancel().catch(() => {})
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder('utf-8').decode(merged)
}
