/**
 * 运行时环境变量统一读取。
 *
 * 背景：代码里之前直读 process.env，但在 Cloudflare Workers 下
 * 真正的变量在 fetch(request, env) 的第二个参数里，process.env 读不到
 *（有 nodejs_compat 时能读到一部分，但不可靠）。各入口负责把 env 灌进来，
 * 业务代码一律走这里的 env()，不再直读 process。
 *   - cf-worker.ts：setRuntimeEnv(env)
 *   - Node / Bun / Deno：无需灌，自动回退到 process.env
 */

let runtimeEnv: Record<string, string | undefined> = {}

/** 由各运行时入口在启动 / 接到请求时调用 */
export function setRuntimeEnv(env: Record<string, string | undefined>): void {
  runtimeEnv = env || {}
}

/** 读 Worker env（已注入时优先），取不到返回 undefined */
export function getEnv(name: string): string | undefined {
  const v = runtimeEnv[name]
  return typeof v === 'string' && v ? v : undefined
}

/**
 * 统一的环境变量读取：Worker env 优先，Node / Bun / Deno 回退 process.env。
 * 不直写 process 是为了在没有 process 的边缘运行时下也不抛错。
 */
export function env(name: string): string | undefined {
  const fromRuntime = getEnv(name)
  if (fromRuntime !== undefined) return fromRuntime
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return nodeEnv?.[name]
}
