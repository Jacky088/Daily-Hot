// force-update 防滥用单测：60 秒最小间隔、按「路径 + IP」隔离。
// 跑法：pnpm test。这是「?force-update=1 高频绕过缓存放大上游压力」的唯一防线。
// 注意：tracker 是模块级状态，各用例用不同的 key 组合隔离。

import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

import { allowForceUpdate, resolveForceUpdate } from '../src/force-update-guard.ts'

function withMockedClock(fn: () => void) {
  return () => {
    const t = mock.timers
    t.enable({ apis: ['Date'] })
    try {
      fn()
    } finally {
      t.reset()
    }
  }
}

describe('allowForceUpdate（60 秒最小间隔）', () => {
  it(
    '首次放行，间隔内拒绝，60 秒后再次放行',
    withMockedClock(() => {
      const key = 'test/guard-1@1.2.3.4'
      assert.equal(allowForceUpdate(key), true)
      assert.equal(allowForceUpdate(key), false)
      // 间隔是 60 秒：59 秒后仍拒绝，61 秒后放行
      mock.timers.tick(59_000)
      assert.equal(allowForceUpdate(key), false)
      mock.timers.tick(2_000)
      assert.equal(allowForceUpdate(key), true)
    }),
  )

  it(
    '不同路径 / 不同 IP 互不影响',
    withMockedClock(() => {
      assert.equal(allowForceUpdate('test/isolation-a@1.2.3.4'), true)
      assert.equal(allowForceUpdate('test/isolation-b@1.2.3.4'), true)
      assert.equal(allowForceUpdate('test/isolation-a@5.6.7.8'), true)
    }),
  )
})

describe('resolveForceUpdate（请求级判定）', () => {
  const makeRequest = (url: string) => ({
    url: new URL(url, 'http://localhost:4399'),
    ip: '9.9.9.9',
    headers: new Headers(),
  })

  it('无 force-update 参数直接跳过（不消耗间隔额度）', () => {
    assert.equal(resolveForceUpdate(makeRequest('/v2/weibo')), false)
    assert.equal(resolveForceUpdate(makeRequest('/v2/weibo?force-update=0')), true)
  })

  it(
    '同路径同 IP 60 秒内只放行一次',
    withMockedClock(() => {
      const first = makeRequest('/v2/zhihu?force-update=1')
      const second = makeRequest('/v2/zhihu?force-update=1')
      assert.equal(resolveForceUpdate(first), true)
      assert.equal(resolveForceUpdate(second), false)
    }),
  )
})
