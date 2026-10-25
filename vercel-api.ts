import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { text as readStreamText } from 'node:stream/consumers'

import { app } from './src/app.ts'
import { runWithPlatformIP } from './src/platform-ip.ts'

// Vercel Serverless Functions（Node.js 运行时）入口。
// vercel.json 把 /v2/*、/img、/health、/endpoints 重写到本函数，静态资源由
// 平台 CDN 直接托管 public/ 目录；业务逻辑完全复用 src/app.ts（Oak 应用），
// 与 Docker / Cloudflare Worker / EdgeOne 共享同一份代码。
//
// @vercel/node 传给 handler 的就是 node:http 的 req/res（这里用结构类型收窄，
// 不引入平台 SDK，与 cloud-functions/[[default]].ts 的做法一致）。
// Oak 全链路跑在 Web 标准对象上，所以入口负责一次 Node ↔ Web 的双向桥接。
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 客户端真实 IP：Vercel 在边缘覆写 x-forwarded-for 为实际访客 IP（客户端伪造的
  // 值不会透传），与 EdgeOne 的 context.clientIp 同级可靠。它经 AsyncLocalStorage
  // 传给 getClientIP()，供 /v2/ip 与天气定位等按访客 IP 取数的接口使用。
  const clientIp = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim()
  const proto = String(req.headers['x-forwarded-proto'] || 'https')
    .split(',')[0]
    .trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim()

  // Vercel 对 catch-all 函数只生成单段匹配路由（^/api/([^/]+)$），多段重写目标
  // （如 /api/v2/hot/aggregate）会落进 404 兜底——所以 rewrites 把原始业务路径放进
  // __path 查询参数、目的地固定为单段 /api/__vh，这里优先取 __path 还原真实路径，
  // 其余查询参数（如 force-update=1）原样透传；__path 缺省时回退为直接剥离 /api 前缀。
  const incoming = new URL(req.url || '/', `${proto}://${host || 'localhost'}`)
  const query = incoming.searchParams
  const __path = query.get('__path')
  let target: URL
  if (__path && __path.startsWith('/')) {
    target = new URL(__path, incoming.origin)
    query.delete('__path')
    for (const [key, value] of query) target.searchParams.append(key, value)
  } else {
    // 兼容直接打到函数自身路径的调用：/api 前缀在这里剥掉再交给路由
    target = new URL(incoming.pathname.replace(/^\/api(?=\/|$)/, '') || '/', incoming.origin)
    for (const [key, value] of query) target.searchParams.append(key, value)
  }

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v)
  }

  // 本项目接口全为 GET/HEAD；带体请求统一收进内存再桥接（体量小，无流式必要）
  const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET')
  const body = hasBody ? await readStreamText(req) : undefined

  const response = await runWithPlatformIP(clientIp, () =>
    (app.fetch as (request: Request) => Promise<Response>)(new Request(target, { method: req.method, headers, body })),
  )

  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))

  if (!response.body) {
    res.end()
    return
  }
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
      .on('error', reject)
      .pipe(res)
      .on('finish', () => resolve())
      .on('error', reject)
  })
}
