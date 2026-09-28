// cached() 缓存语义单测：TTL 命中、cacheIf 拦截、stale 兜底、force-update 绕过。
// 跑法：pnpm test。cache.ts 是全项目的稳定性地基——「瞬时故障被固化进缓存」
// 「force-update 被高频滥用」这类回归都在这里拦住。
// 注意：store 是模块级状态，各用例用唯一缓存键隔离，互不污染。

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { cached } from '../src/cache.ts'
import { runWithForceUpdate } from '../src/force-update-guard.ts'

// 让「时间流逝」可控：cached 内部用 Date.now() 判定 TTL，这里 mock 掉 Date，
// 用 tick 推进时间，不真实等待
function withMockedClock(fn: () => Promise<void>) {
  return async () => {
    const t = mock.timers
    t.enable({ apis: ['Date'] })
    try {
      await fn()
    } finally {
      t.reset()
    }
  }
}

describe('cached（TTL 内存缓存）', () => {
  it(
    'TTL 内命中缓存，不回源',
    withMockedClock(async () => {
      let calls = 0
      const loader = async () => ++calls
      const key = 'test:cached:hit'

      assert.equal(await cached(key, loader, { ttl: 60_000 }), 1)
      assert.equal(await cached(key, loader, { ttl: 60_000 }), 1)
      assert.equal(calls, 1)
    }),
  )

  it(
    'TTL 过期后重新回源',
    withMockedClock(async () => {
      let calls = 0
      const loader = async () => ++calls
      const key = 'test:cached:expire'

      assert.equal(await cached(key, loader, { ttl: 60_000 }), 1)
      mock.timers.tick(61_000)
      assert.equal(await cached(key, loader, { ttl: 60_000 }), 2)
    }),
  )

  it('cacheIf 返回 false 的结果不入缓存（瞬时故障不被固化）', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      // 首次模拟「解析失败返回空榜」
      return calls === 1 ? [] : [1, 2, 3]
    }
    const key = 'test:cached:cacheif'
    const opts = { ttl: 60_000, cacheIf: (d: number[]) => d.length > 0 }

    assert.deepEqual(await cached(key, loader, opts), [])
    // 空结果没入缓存：第二次仍回源，拿到正常数据
    assert.deepEqual(await cached(key, loader, opts), [1, 2, 3])
    // 正常结果已入缓存：第三次直接命中
    assert.deepEqual(await cached(key, loader, opts), [1, 2, 3])
    assert.equal(calls, 2)
  })

  it(
    '回源失败时走 stale 兜底（staleTtl 内返回旧数据）',
    withMockedClock(async () => {
      let calls = 0
      const loader = async () => {
        calls += 1
        if (calls > 1) throw new Error('upstream down')
        return 'fresh'
      }
      const key = 'test:cached:stale'
      const opts = { ttl: 60_000, staleTtl: 600_000 }

      assert.equal(await cached(key, loader, opts), 'fresh')
      // TTL 过期但仍在 staleTtl 内，且上游挂了：返回旧值而不是抛错
      mock.timers.tick(120_000)
      assert.equal(await cached(key, loader, opts), 'fresh')
      assert.equal(calls, 2)
    }),
  )

  it('无缓存可用时失败照常抛错', async () => {
    await assert.rejects(
      cached('test:cached:fail', async () => {
        throw new Error('upstream down')
      }),
      /upstream down/,
    )
  })

  it('force-update 绕过新鲜缓存直接回源', async () => {
    let calls = 0
    const loader = async () => `v${++calls}`
    const key = 'test:cached:force'

    // 正常请求：命中缓存
    assert.equal(await cached(key, loader, { ttl: 60_000 }), 'v1')
    // force-update 上下文：跳过新鲜缓存重新回源
    assert.equal(await runWithForceUpdate(true, () => cached(key, loader, { ttl: 60_000 })), 'v2')
    // 后续正常请求命中的是 force 回源后的新缓存
    assert.equal(await cached(key, loader, { ttl: 60_000 }), 'v2')
    assert.equal(calls, 2)
  })
})
