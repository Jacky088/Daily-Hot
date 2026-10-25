import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'

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

  // 重写后 req.url 保留原始路径（/v2/...）；为兼容个别把目标路径透传进来的情形，
  // /api 前缀在这里剥掉再交给路由。
  const path = (req.url || '/').replace(/^\/api(?=\/|$)/, '')
  const url = `${proto}://${host || 'localhost'}${path || '/'}`

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v)
  }

  // 本项目接口全为 GET/HEAD；带体请求统一收进内存再桥接（体量小，无流式必要）
  const hasBody = !['GET', 'HEAD'].includes(req.method || 'GET')
  const body = hasBody ? await readBody(req) : undefined

  const response = await runWithPlatformIP(clientIp, () =>
    (app.fetch as (request: Request) => Promise<Response>)(new Request(url, { method: req.method, headers, body })),
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

/** 把 Node 请求体读成字符串（Oak 侧的 JSON / 文本解析都基于字符串） */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}
