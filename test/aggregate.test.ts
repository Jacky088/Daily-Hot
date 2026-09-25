// 纯函数单测：归一化打分 / 热度文案 / 参数钳制。
// 跑法：pnpm test（Node 原生 node:test，不引入框架）。
// 直接 import hot-aggregate 模块的真实实现（非镜像副本）——
// 改了算法这里会立刻红，不会出现「测试跟着旧口径一起错」的情况。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { clampInt, formatHot, normalizeScore, parseHotText } from '../src/modules/hot-aggregate.module.ts'

describe('formatHot（与聚合榜单同口径）', () => {
  it('万 / 亿分界正确', () => {
    assert.equal(formatHot(9999), '9999')
    assert.equal(formatHot(10000), '1万')
    assert.equal(formatHot(2685000), '268.5万')
    assert.equal(formatHot(48537000), '4853.7万')
    assert.equal(formatHot(150000000), '1.5亿')
  })
  it('非法输入返回空串（前端不展示）', () => {
    assert.equal(formatHot(null), '')
    assert.equal(formatHot(0), '')
    assert.equal(formatHot(-5), '')
    assert.equal(formatHot(NaN), '')
  })
})

describe('parseHotText（各平台热度文案抠数值）', () => {
  it('中文单位正确换算', () => {
    assert.equal(parseHotText('268.5万'), 2685000)
    assert.equal(parseHotText('1.2亿'), 120000000)
    assert.equal(parseHotText('3.2w'), 32000)
    assert.equal(parseHotText('1232964'), 1232964)
  })
  it('无数字文案返回 null（调用方退回排名折算）', () => {
    assert.equal(parseHotText('热'), null)
    assert.equal(parseHotText(null), null)
    assert.equal(parseHotText(''), null)
  })
})

describe('归一化打分（排序与展示自洽）', () => {
  it('同平台内热度高者分高', () => {
    const pool = 12
    const max = 48537000
    assert.ok(normalizeScore(48537000, 0, pool, max, 1) > normalizeScore(2685000, 1, pool, max, 1))
  })
  it('无热度口径（B 站）退回排名折算：排头分最高', () => {
    const pool = 12
    assert.ok(normalizeScore(null, 0, pool, 0, 0.83) > normalizeScore(null, 5, pool, 0, 0.83))
  })
  it('权重只做数量级微调：头部热度仍主导排序，B 站头部可与中部热度条目交错', () => {
    const pool = 12
    const max = 1000000
    // 微博第 1（热度 100w，权重 1）稳居 B 站第 1（无热度，权重 0.83）之前——
    // 权重是微调，头部热度仍主导，这正是 PLATFORMS.weight 的设计意图
    assert.ok(normalizeScore(1000000, 0, pool, max, 1) > normalizeScore(null, 0, pool, 0, 0.83))
    // B 站第 1（0.83）可排在微博第 5（热度 50w，分约 0.58）之前——
    // 无热度口径的平台靠排名折算仍有出榜机会，不会被有热度的平台淹没
    assert.ok(normalizeScore(null, 0, pool, 0, 0.83) > normalizeScore(500000, 4, pool, max, 1))
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
