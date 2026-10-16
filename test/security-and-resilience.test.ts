import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { serviceIP } from '../src/modules/ip.module.ts'
import { fetchUpstream, resetCircuitBreaker, CircuitBreakerError } from '../src/fetch-upstream.ts'

describe('IP 安全策略与代理信任（getClientIP）', () => {
  it('未配置 TRUST_PROXY 时，安全决策拒绝使用伪造的 X-Forwarded-For', () => {
    const headers = new Headers({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
    })
    const socketIP = '203.0.113.195'

    // 普通展示场景：返回转发头中的公网 IP
    const displayIP = serviceIP.getClientIP(headers, socketIP, { forSecurity: false })
    assert.equal(displayIP, '1.2.3.4')

    // 安全决策场景（限流、黑名单、强制刷新）：未信任代理时优先使用底层真实 socket IP
    const securityIP = serviceIP.getClientIP(headers, socketIP, { forSecurity: true })
    assert.equal(securityIP, '203.0.113.195')
  })

  it('未提供转发头时，安全决策正确回退到 socket IP', () => {
    const headers = new Headers()
    const socketIP = '198.51.100.22'
    const ip = serviceIP.getClientIP(headers, socketIP, { forSecurity: true })
    assert.equal(ip, '198.51.100.22')
  })
})

describe('上游服务熔断器（Circuit Breaker）', () => {
  it('连续 5 次失败后触发熔断快速失败，并在冷却后进入探测', async () => {
    resetCircuitBreaker()
    const t = mock.timers
    t.enable({ apis: ['Date'] })

    try {
      const mockHost = 'failing-upstream.test'
      const mockUrl = `https://${mockHost}/api/data`

      // 模拟上游 fetch 一直失败
      let attemptCount = 0
      const originalFetch = globalThis.fetch
      globalThis.fetch = mock.fn(async () => {
        attemptCount++
        throw new Error('connection refused')
      }) as unknown as typeof fetch

      try {
        // 连续触发 5 次失败（每次含 1 次重试）
        for (let i = 0; i < 5; i++) {
          await assert.rejects(
            async () => {
              await fetchUpstream(mockUrl, { retry: 0, timeoutMs: 100 })
            },
            { message: 'connection refused' },
          )
        }

        // 第 6 次请求应直接被熔断器阻断，抛出 CircuitBreakerError，不再发出真实 fetch
        const callsBefore = attemptCount
        await assert.rejects(
          async () => {
            await fetchUpstream(mockUrl, { retry: 0, timeoutMs: 100 })
          },
          (err: any) => {
            return err instanceof CircuitBreakerError || err.name === 'CircuitBreakerError'
          },
        )
        assert.equal(attemptCount, callsBefore, '熔断期间不应产生真实网络请求')

        // 推进时间 31 秒（超过 30 秒冷却）
        mock.timers.tick(31_000)

        // 冷却后应允许单次请求进行试探 (Half-Open)
        await assert.rejects(
          async () => {
            await fetchUpstream(mockUrl, { retry: 0, timeoutMs: 100 })
          },
          { message: 'connection refused' },
        )
        assert.equal(attemptCount, callsBefore + 1, '冷却后应允许 1 次试探请求')
      } finally {
        globalThis.fetch = originalFetch
        resetCircuitBreaker()
      }
    } finally {
      t.reset()
    }
  })
})

describe('SSRF 安全防护（ServiceOG）', () => {
  it('严格拦截内网、回环、本地和云厂商元数据地址', async () => {
    const { serviceOG } = await import('../src/modules/og.module.ts')
    const handler = serviceOG.handle()

    const blockedTargets = [
      'http://127.0.0.1:80',
      'http://localhost',
      'http://169.254.169.254',
      'http://192.168.1.1',
      'http://10.0.0.1',
      'http://[::ffff:127.0.0.1]',
      'http://127.0.0.1.nip.io',
    ]

    for (const target of blockedTargets) {
      const ctx: any = {
        request: {
          url: new URL(`http://localhost:4399/v2/og?url=${encodeURIComponent(target)}`),
        },
        response: { status: 200, body: null },
        state: { encoding: 'json' },
      }

      await handler(ctx, async () => {})
      assert.equal(ctx.response.status, 400)
      assert.match(ctx.response.body.message, /禁止访问/)
    }
  })
})

describe('Hash 模块安全性与解压限制', async () => {
  const { serviceHash } = await import('../src/modules/hash.module.ts')

  it('正常压缩串正确解压', () => {
    const text = 'Hello, world! 这是一个测试'
    const encoded = serviceHash.gzipEncode(text)
    const decoded = serviceHash.gzipDecode(encoded)
    assert.equal(decoded, text)
  })

  it('超大解压炸弹被安全拦截，不崩溃退出', async () => {
    const { gzipSync } = await import('node:zlib')
    // 构造压缩比极高的零字节数据包（解压体积 > 1MB）
    const hugeZeros = Buffer.alloc(2 * 1024 * 1024, 0)
    const bombHex = gzipSync(hugeZeros).toString('hex')
    // gzipDecode 遇到超过 1MB 解压上限时安全捕获并返回空串
    const res = serviceHash.gzipDecode(bombHex)
    assert.equal(res, '', '解压炸弹应被截断/拦截并返回空串')
  })
})

describe('Password 模块 CSPRNG 随机性与洗牌', async () => {
  const { servicePassword } = await import('../src/modules/password/password.module.ts')

  it('生成的随机密码符合长度和字符集要求', async () => {
    const ctx: any = {
      request: {
        url: new URL(
          'http://localhost:4399/v2/password?length=24&numbers=true&symbols=true&lowercase=true&uppercase=true',
        ),
      },
      response: { status: 200, body: null },
      state: { encoding: 'json' },
    }
    await servicePassword.handle()(ctx, async () => {})
    assert.equal(ctx.response.status, 200)
    const data = typeof ctx.response.body === 'string' ? JSON.parse(ctx.response.body) : ctx.response.body
    assert.equal(data.data.password.length, 24)
    assert.match(data.data.password, /[a-z]/)
    assert.match(data.data.password, /[A-Z]/)
    assert.match(data.data.password, /\d/)
  })
})
