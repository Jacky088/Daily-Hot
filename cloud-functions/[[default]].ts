import { app } from '../src/app.ts'
import { runWithPlatformIP } from '../src/platform-ip.ts'

// EdgeOne Makers Cloud Functions（Node.js 运行时）入口。
// 官方约定：cloud-functions/[[default]].ts 作为根级 catch-all（[[default]] 匹配多级路径），
// Handler 模式导出 onRequest(context) 并返回 Response；静态资源由平台优先托管。
// 业务逻辑完全复用 src/app.ts（Oak 应用），与 Docker / Cloudflare Worker 共享同一份代码。
//
// context.clientIp 是 EdgeOne 官方提供的客户端真实 IP 字段，比转发头可靠：
// 平台并不保证把 X-Forwarded-For 这类头原样透传给函数，但该字段是平台承诺的。
// 它经 AsyncLocalStorage 传给 getClientIP()，供 /v2/ip 与天气定位等按访客 IP 取数的接口使用。
export default function onRequest(context: { request: Request; clientIp?: string }): Promise<Response> {
  return runWithPlatformIP(context.clientIp, () =>
    (app.fetch as (request: Request) => Promise<Response>)(context.request),
  )
}
