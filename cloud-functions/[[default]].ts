import { app } from '../src/app.ts'

// EdgeOne Makers Cloud Functions（Node.js 运行时）入口。
// 官方约定：cloud-functions/[[default]].ts 作为根级 catch-all（[[default]] 匹配多级路径），
// Handler 模式导出 onRequest(context) 并返回 Response；静态资源由平台优先托管。
// 业务逻辑完全复用 src/app.ts（Oak 应用），与 Docker / Cloudflare Worker 共享同一份代码。
export default function onRequest(context: { request: Request }): Promise<Response> {
  return (app.fetch as (request: Request) => Promise<Response>)(context.request)
}
