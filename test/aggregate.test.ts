// 缓存键收敛与聚合参数单测补充。
// 跑法：pnpm test（Node 原生 node:test，不引入框架）。
// 直接 import hot-aggregate 模块的真实实现（非镜像副本）——
// 改了算法这里会立刻红，不会出现「测试跟着旧口径一起错」的情况。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { clampInt, isCommonAggregateArgs, estimatePlatformHot } from '../src/modules/hot-aggregate.module.ts'

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

describe('estimatePlatformHot（无官方热度平台估算算法）', () => {
  it('严格满足高低排序单调递减（Rank 1 > Rank 2 > ... > Rank 30）', () => {
    let last = Infinity
    for (let rank = 1; rank <= 30; rank++) {
      const hot = estimatePlatformHot(rank, 30, 0.83, `Title item #${rank}`)
      assert.ok(hot < last, `Rank ${rank} (${hot}) 应该小于前一名 (${last})`)
      last = hot
    }
  })

  it('榜首与榜尾热度在合理梯队且不全为一个数字', () => {
    const r1 = estimatePlatformHot(1, 30, 0.83, '特斯拉Roadster真会飞')
    const r10 = estimatePlatformHot(10, 30, 0.83, '罗永浩回应吐槽大会')
    const r30 = estimatePlatformHot(30, 30, 0.83, '年度必看纪录片盘点')

    // 榜首约为 700万 ~ 1000万 体量
    assert.ok(r1 >= 7_000_000 && r1 <= 11_000_000, `榜首热度 ${r1} 需在千万级合理区间`)
    // 榜中与榜尾阶梯式衰减
    assert.ok(r10 >= 2_000_000 && r10 <= 5_000_000, `第10名热度 ${r10} 需平滑衰减`)
    assert.ok(r30 >= 300_000 && r30 <= 1_800_000, `第30名热度 ${r30} 需在合理长尾区间`)

    // 数值各不相同
    assert.notEqual(r1, r10)
    assert.notEqual(r10, r30)
  })

  it('同一标题与排名计算结果具备确定性与自洽性', () => {
    const a = estimatePlatformHot(3, 30, 0.83, '鬼畜者联盟')
    const b = estimatePlatformHot(3, 30, 0.83, '鬼畜者联盟')
    assert.equal(a, b)
  })
})
