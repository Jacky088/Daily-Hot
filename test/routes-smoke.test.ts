// HTTP 级冒烟测试：直接驱动 Oak 的 app.handle()，不开端口、不访问上游。
// 目的是给「中间件链 + 路由表 + encoding 分发」这层长期无覆盖的骨架补上回归网：
// 这些地方出问题表现为整站 404 / 全接口换行错乱，而单元测试完全看不见。
//
// 注意：限流用例会耗尽测试 IP 的令牌桶，因此固定放在文件最后。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { app } from '../src/app.ts'
import { appRouter } from '../src/router.ts'

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await app.handle(new Request(`http://localhost${path}`, init))
  assert.ok(response, `${path} 应当产生响应`)
  return response
}

describe('路由表完整性', () => {
  it('注册路径唯一、全部带 /v2 前缀、数量不回退', () => {
    // Router 的迭代器产出 Route 对象（含 path / methods）
    const entries: string[] = []
    for (const [route] of appRouter.entries()) {
      entries.push(`${route.methods.toSorted().join(',')} ${route.path}`)
    }

    assert.ok(entries.length >= 100, `路由数量异常，当前 ${entries.length}`)
    assert.equal(new Set(entries).size, entries.length, '存在重复注册的路由')

    for (const entry of entries) {
      assert.match(entry, /^[A-Z,]+ \/v2\//, `路由缺少 /v2 前缀: ${entry}`)
    }
  })
})

describe('基础路由', () => {
  it('GET /health 返回 ok', async () => {
    const response = await request('/health')
    assert.equal(response.status, 200)
    assert.equal((await response.text()).trim(), 'ok')
  })

  it('GET /endpoints 返回非空路径清单', async () => {
    const response = await request('/endpoints')
    assert.equal(response.status, 200)

    const paths = (await response.json()) as string[]
    assert.ok(Array.isArray(paths) && paths.length > 0)
    assert.ok(paths.every((p) => p.startsWith('/v2/')))
  })

  it('未注册路径回落 404 JSON 而非空响应', async () => {
    const response = await request('/v2/definitely-not-a-route')
    assert.equal(response.status, 404)

    const body = (await response.json()) as { code: number }
    assert.equal(body.code, 404)
  })

  it('首页可访问（dist 入口或 JSON 兜底都不应 5xx）', async () => {
    const response = await request('/')
    assert.equal(response.status, 200)
  })
})

describe('中间件链', () => {
  it('OPTIONS 预检返回 204 且带 CORS / 安全头', async () => {
    const response = await request('/v2/duanzi', { method: 'OPTIONS' })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
  })
})

describe('encoding 分发（renderByEncoding 端到端）', () => {
  it('默认返回 JSON 包装结构', async () => {
    const response = await request('/v2/duanzi')
    assert.equal(response.status, 200)

    const body = (await response.json()) as { code: number; data: { duanzi: string } }
    assert.equal(body.code, 200)
    assert.equal(typeof body.data.duanzi, 'string')
    assert.ok(body.data.duanzi.length > 0)
  })

  it('?encoding=text 返回纯文本', async () => {
    const response = await request('/v2/duanzi?encoding=text')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /text\/plain/)

    const text = (await response.text()).trim()
    assert.ok(text.length > 0)
    assert.ok(!text.startsWith('{'), 'text 分支不应输出 JSON')
  })

  it('?encoding=markdown 返回 Markdown 标题', async () => {
    const response = await request('/v2/duanzi?encoding=markdown')
    assert.equal(response.status, 200)

    const text = await response.text()
    assert.ok(text.startsWith('# 😄 段子'), `markdown 分支输出异常: ${text.slice(0, 40)}`)
  })

  it('未知 encoding 回落 JSON，不返回空响应', async () => {
    const response = await request('/v2/duanzi?encoding=yaml')
    assert.equal(response.status, 200)

    const body = (await response.json()) as { code: number }
    assert.equal(body.code, 200)
  })
})

describe('参数校验', () => {
  it('非法 id 返回 400 而不是 500', async () => {
    const response = await request('/v2/duanzi?id=abc')
    assert.equal(response.status, 400)

    const body = (await response.json()) as { code: number }
    assert.equal(body.code, 400)
  })
})

describe('令牌桶限流', () => {
  it('持续请求超出容量后返回 429 并带 Retry-After', async () => {
    let limited: Response | undefined

    for (let i = 0; i < 200 && !limited; i++) {
      const response = await request('/v2/duanzi')
      if (response.status === 429) limited = response
    }

    assert.ok(limited, '持续请求未触发限流')
    assert.ok(Number(limited.headers.get('retry-after')) >= 1)
  })
})
