// Vercel 入口适配层契约测试（api/server.ts）。
// 平台的 req/res 桥接逻辑（URL 重组、/api 前缀剥离、响应头透传、响应流回灌）
// 不依赖 Vercel 环境：用结构兼容的 mock 直接驱动 handler，走真实 Oak 应用
// 验证桥接正确性，与 fragile-sources.test.ts 的 stub 风格一致。
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

import handler from '../api/server.ts'

type MockRes = PassThrough & {
  statusCode: number
  setHeader: (k: string, v: string) => void
  store: { status: number; headers: Map<string, string>; body: string; ended: Promise<void> }
}

function mockReq(method: string, url: string, headers: Record<string, string> = {}): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  Object.assign(req, { method, url, headers })
  return req
}

function mockRes(): MockRes {
  const store = {
    status: 0,
    headers: new Map<string, string>(),
    body: '',
    ended: null as unknown as Promise<void>,
  }
  const res = new PassThrough() as MockRes
  res.statusCode = 0
  res.setHeader = (k, v) => store.headers.set(k.toLowerCase(), String(v))
  const chunks: Buffer[] = []
  res.on('data', (c: Buffer) => chunks.push(c))
  store.ended = new Promise<void>((resolve) => res.on('end', resolve)).then(() => {
    store.status = res.statusCode
    store.body = Buffer.concat(chunks).toString('utf-8')
  })
  res.store = store
  return res
}

describe('Vercel 适配层桥接（api/server）', () => {
  it('GET /health 走通 Node req/res → Web Request → Oak → 回灌响应', async () => {
    const res = mockRes()
    await handler(mockReq('GET', '/health', { host: 'daily-hot.vercel.app' }), res as unknown as ServerResponse)
    await res.store.ended
    assert.equal(res.store.status, 200)
    assert.equal(res.store.body, 'ok')
  })

  it('重写透传进来的 /api 前缀被剥离，原始路径语义不变', async () => {
    const res = mockRes()
    await handler(mockReq('GET', '/api/health', { host: 'daily-hot.vercel.app' }), res as unknown as ServerResponse)
    await res.store.ended
    assert.equal(res.store.status, 200)
    assert.equal(res.store.body, 'ok')
  })

  it('x-forwarded-for 首段被取为客户端 IP 上下文，静态文件经桥接正常回源', async () => {
    // /manifest.json 由 static-assets 中间件从 public/ 直出，覆盖「非 API 路径
    // 也可能被重写进函数」的兜底链路
    const res = mockRes()
    await handler(
      mockReq('GET', '/manifest.json', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      res as unknown as ServerResponse,
    )
    await res.store.ended
    assert.equal(res.store.status, 200)
    assert.ok(res.store.headers.get('content-type')?.includes('application/json'))
  })
})
