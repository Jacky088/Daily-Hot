// renderByEncoding 语义单测：三分支映射 + 惰性求值。
// 惰性求值是这个封装的隐性契约——各模块的 text / markdown 分支里都是整段
// 字符串拼接与数组 map，若某天被改成「三个分支都先算一遍再挑」，接口输出不变
// 但每次请求会多付两倍的渲染开销，靠这组用例拦住。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { renderByEncoding, type EncodingContext } from '../src/common.ts'

function createContext(encoding?: string): EncodingContext {
  return { state: { encoding }, response: { body: undefined } }
}

describe('renderByEncoding', () => {
  it('encoding=text 只走 text 分支', () => {
    const ctx = createContext('text')
    renderByEncoding(ctx, { text: () => 'T', markdown: () => 'M', json: () => 'J' })
    assert.equal(ctx.response.body, 'T')
  })

  it('encoding=markdown 只走 markdown 分支', () => {
    const ctx = createContext('markdown')
    renderByEncoding(ctx, { text: () => 'T', markdown: () => 'M', json: () => 'J' })
    assert.equal(ctx.response.body, 'M')
  })

  it('未指定或未知 encoding 走 json 分支', () => {
    for (const encoding of [undefined, '', 'json', 'yaml', 'TEXT']) {
      const ctx = createContext(encoding)
      renderByEncoding(ctx, { text: () => 'T', markdown: () => 'M', json: () => 'J' })
      assert.equal(ctx.response.body, 'J', `encoding=${String(encoding)} 应回落 json`)
    }
  })

  it('未命中的分支不会被求值', () => {
    const called: string[] = []
    const renderers = {
      text: () => {
        called.push('text')
        return 'T'
      },
      markdown: () => {
        called.push('markdown')
        return 'M'
      },
      json: () => {
        called.push('json')
        return 'J'
      },
    }

    renderByEncoding(createContext('markdown'), renderers)
    assert.deepEqual(called, ['markdown'])
  })

  it('分支内抛错原样抛给调用方（不被吞掉）', () => {
    const ctx = createContext('text')
    assert.throws(
      () =>
        renderByEncoding(ctx, {
          text: () => {
            throw new Error('render failed')
          },
          markdown: () => 'M',
          json: () => 'J',
        }),
      /render failed/,
    )
  })
})
