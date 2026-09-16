import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * 平台（CDN / 边缘运行时）直接提供的客户端 IP。
 *
 * 为什么需要它：各平台传递访客 IP 的方式并不统一，且「转发头是否被原样透传」属于
 * 平台策略、可能随版本变化，靠猜头名迟早会失效。腾讯 EdgeOne Makers 的云函数就把
 * 客户端 IP 作为 EventContext 的官方字段（context.clientIp）提供，而不是承诺某个 HTTP 头。
 *
 * 入口文件读到该字段后存进这里，由 src/modules/ip.module.ts 的 getClientIP() 优先取用。
 * 走 AsyncLocalStorage 而不是改写 Request 的请求头，是为了避开重建 Request 时对请求体
 * 的连带影响（POST 接口会受牵连），代价只是多一层上下文传递。
 */

const storage = new AsyncLocalStorage<string>()

/** 在「平台客户端 IP」上下文中执行 fn（由各平台入口包裹整个请求处理） */
export function runWithPlatformIP<T>(ip: string | undefined, fn: () => T): T {
  return storage.run(ip?.trim() || '', fn)
}

/** 读取平台提供的客户端 IP；入口未设置（Cloudflare / Node / Deno 等）时返回空串 */
export function getPlatformIP(): string {
  return storage.getStore() || ''
}
