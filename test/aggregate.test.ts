// 缓存键收敛与聚合参数单测补充。
// 跑法：pnpm test（Node 原生 node:test，不引入框架）。
// 直接 import hot-aggregate 模块的真实实现（非镜像副本）——
// 改了算法这里会立刻红，不会出现「测试跟着旧口径一起错」的情况。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { clampInt, isCommonAggregateArgs } from '../src/modules/hot-aggregate.module.ts'

describe('isCommonAggregateArgs（聚合接口缓存键收敛）', () => {
  it('前端固定参数（limit=20&per=3&全源）命中缓存键', () => {
    assert.equal(isCommonAggregateArgs(20, 3, []), true)
  })
  it('无参 API 默认参数（limit=30&per=3&全源）命中缓存键', () => {
    assert.equal(isCommonAggregateArgs(30, 3, []), true)
  })
  it('指定来源（sources）不缓存，避免键爆炸', () => {
    assert.equal(isCommonAggregateArgs(30, 3, ['weibo']), false)
    assert.equal(isCommonAggregateArgs(20, 3, ['weibo', 'zhihu']), false)
  })
  it('非常规 limit / per 不缓存', () => {
    assert.equal(isCommonAggregateArgs(25, 3, []), false)
    assert.equal(isCommonAggregateArgs(50, 3, []), false)
    assert.equal(isCommonAggregateArgs(30, 4, []), false)
    assert.equal(isCommonAggregateArgs(30, 1, []), false)
  })
})

describe('clampInt（聚合接口参数钳制）', () => {
  it('非法输入回退默认值', () => {
    assert.equal(clampInt(null, 30, 1, 100), 30)
    assert.equal(clampInt('abc', 30, 1, 100), 30)
  })
  it('越界钳制到 min/max', () => {
    assert.equal(clampInt('999', 30, 1, 100), 100)
    assert.equal(clampInt('0', 3, 1, 20), 1)
  })
})
