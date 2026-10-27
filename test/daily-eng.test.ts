// 每日一句契约测试（daily-eng.module）。
// open.iciba.com 对高频访问不友好（会把触怒它的出口直接断连，连 TLS 都不回包），
// 而这张卡 auto:1、每次页面打开都会请求一次——模块必须走 cached()：
// 成功结果 TTL 内不再回源；上游断供时返回 stale 旧句而不是 500。
// 这是这个源的生命线，用测试锁住。
//
// 缓存隔离：cache.ts 的 store 是模块级状态，键为 daily-eng:<date>，
// 各用例用不同的 date 参数拿到独立键，互不依赖声明顺序。跑法：pnpm test

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { app } from '../src/app.ts'
import { resetCircuitBreaker } from '../src/fetch-upstream.ts'

const realFetch = globalThis.fetch
let icibaStatus = 200
let icibaHits = 0

const SAMPLE = {
  content: 'Knowledge is power.',
  note: '知识就是力量。',
  tts: 'https://open.iciba.com/tts',
  picture: '',
  picture2: '',
  dateline: '2026年10月27日',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  resetCircuitBreaker()
  icibaStatus = 200
  icibaHits = 0
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://open.iciba.com/dsapi')) {
      icibaHits += 1
      return Promise.resolve(jsonResponse(SAMPLE, icibaStatus))
    }
    return Promise.resolve(new Response(null, { status: 599 }))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

async function getJson(path: string): Promise<{ status: number; body: { code: number; data: unknown } }> {
  // 与 fragile-sources 相同的类型桥接：Oak 的 fetch 重载签名较宽，实际单参可用
  const fetchApp = app.fetch as (request: Request) => Promise<Response>
  const res = await fetchApp(new Request(`http://localhost:4399${path}`))
  return { status: res.status, body: await res.json() }
}

describe('每日一句契约（daily-eng.module）', () => {
  it('首次请求回源并解析金山词霸响应', async () => {
    const { status, body } = await getJson('/v2/daily-eng?date=2100-01-01')
    assert.equal(status, 200)
    assert.equal(icibaHits, 1)
    assert.equal((body.data as { content: string }).content, 'Knowledge is power.')
    assert.equal((body.data as { note: string }).note, '知识就是力量。')
  })

  it('上游断供：TTL 内命中服务端缓存不发请求，返回旧句而不是 500', async () => {
    await getJson('/v2/daily-eng?date=2100-01-02') // 热缓存
    icibaStatus = 599
    const { status, body } = await getJson('/v2/daily-eng?date=2100-01-02')
    assert.equal(status, 200)
    assert.equal(icibaHits, 1, 'TTL 内不应回源')
    assert.equal((body.data as { content: string }).content, 'Knowledge is power.')
  })

  it('强制刷新遇上游断供：回源失败走 stale 兜底，同样返回旧句', async () => {
    await getJson('/v2/daily-eng?date=2100-01-03') // 热缓存
    icibaStatus = 599
    const { status, body } = await getJson('/v2/daily-eng?date=2100-01-03&force-update=1')
    assert.equal(status, 200)
    assert.ok(icibaHits > 1, 'force-update 必须尝试回源')
    assert.equal((body.data as { content: string }).content, 'Knowledge is power.')
  })
})
