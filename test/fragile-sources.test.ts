// 易碎数据源契约测试：微博 / 小红书。
// 这两个源的共性是「上游随时会变」——微博轮换游客 Cookie、小红书过期 shield 令牌。
// git 历史里它们的修复占比远高于其他模块。
//
// 做法：stub 全局 fetch 按 URL 回放上游响应样本，走真实的 Oak 应用（app.fetch）
// 验证「抓取 → 解析 → 出榜」整条链路。价值在于上游改版时能立刻区分是
// 「抓取挂了」（打不到 / 返回异常结构）还是「解析挂了」（样本还在但字段变了），
// 且测试不依赖网络波动，CI 里结果稳定。
//
// 缓存隔离：cache.ts 的 store 是模块级状态且键固定（'weibo'、'rednote:hot'…），
// 本文件内所有用例按「声明顺序」共享它，因此：
//   - 依赖「缓存为空」语义的用例必须排在同键用例之前（如小红书的失败用例）；
//   - 需要绕过已热缓存、且自身必然成功的用例带 ?force-update=1（如微博兜底用例；
//     失败用例不能用——force-update 回源失败会走 stale 兜底，返回的恰是旧榜）。
// 跑法：pnpm test

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { app } from '../src/app.ts'

// ============ fetch stub：按 URL 路由到样本响应 ============

const realFetch = globalThis.fetch
const requested: string[] = []
let route: (url: string, init?: RequestInit) => Response = () => new Response(null, { status: 599 })

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  requested.length = 0
  route = () => new Response(null, { status: 599 })
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    requested.push(url)
    return Promise.resolve(route(url, init))
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

async function getJson(
  path: string,
): Promise<{ status: number; body: { code: number; message: string; data: unknown } }> {
  // 与 cloud-functions/[[default]].ts 相同的类型桥接：Oak 的 fetch 重载签名较宽，实际单参可用
  const fetchApp = app.fetch as (request: Request) => Promise<Response>
  const res = await fetchApp(new Request(`http://localhost:4399${path}`))
  return { status: res.status, body: await res.json() }
}

describe('微博热搜契约（weibo.module）', () => {
  it('解析 card_group：过滤推广位、解析热度、拼接搜索链接，并注入 Cookie 凭据', async () => {
    let cookieHeader = ''
    route = (url, init) => {
      assert.ok(url.startsWith('https://m.weibo.cn/api/container/getIndex'), `请求了错误的上游: ${url}`)
      cookieHeader = new Headers(init?.headers).get('Cookie') || ''
      return jsonResponse({
        data: {
          cards: [
            {
              card_group: [
                { pic: 'https://wx1.sinaimg.cn/img_search_1.png', desc: '话题甲', desc_extr: 123456 },
                // 推广位：pic 不带 img_search_N，必须被过滤
                { pic: 'https://wx1.sinaimg.cn/ad_banner.png', desc: '推广位', desc_extr: 999 },
                { pic: 'https://wx2.sinaimg.cn/img_search_2.png', desc: '话题 乙', desc_extr: '456789' },
              ],
            },
          ],
        },
      })
    }

    const { status, body } = await getJson('/v2/weibo')
    assert.equal(status, 200)
    assert.equal(body.code, 200)

    const list = body.data as Array<{ title: string; hot_value: number; link: string }>
    assert.equal(list.length, 2, '推广位应被过滤')
    assert.equal(list[0].title, '话题甲')
    assert.equal(list[0].hot_value, 123456)
    assert.equal(list[1].title, '话题 乙')
    assert.equal(list[1].hot_value, 456789, '字符串热度应被解析成数值')
    assert.equal(list[1].link, `https://s.weibo.com/weibo?q=${encodeURIComponent('话题 乙')}`)

    // 凭据契约：请求必须带 Cookie（游客 Cookie 失效是这个源最常见的故障形态）
    assert.ok(cookieHeader.includes('SUB='), '请求应携带微博游客 Cookie（SUB 字段）')
  })

  it('主源为空时回落 uapis 备用源，hot_value 归一为数值并附展示文案', async () => {
    route = (url) => {
      if (url.startsWith('https://m.weibo.cn/')) {
        // 主源「成功但空榜」（被风控时的典型表现）：应触发兜底而不是出空榜
        return jsonResponse({ data: { cards: [{ card_group: [] }] } })
      }
      assert.ok(url.startsWith('https://uapis.cn/api/v1/misc/hotboard'), `应回落到 uapis: ${url}`)
      return jsonResponse({
        list: [{ title: '备用话题', url: 'https://s.weibo.com/weibo?q=x', hot_value: '789', extra: null }],
      })
    }

    // 前一个用例已把 'weibo' 键喂热：force-update 绕过新鲜缓存重新回源（本用例必然成功，
    // 不会踩到 force-update 的 stale 兜底语义）
    const { status, body } = await getJson('/v2/weibo?force-update=1')
    assert.equal(status, 200)
    const list = body.data as Array<{ title: string; hot_value: number; hot_value_desc: string }>
    assert.equal(list.length, 1)
    assert.equal(list[0].title, '备用话题')
    assert.equal(list[0].hot_value, 789)
    assert.equal(list[0].hot_value_desc, '789')
  })
})

describe('小红书热搜契约（rednote.module）', () => {
  it('上游 success=false 时不泄露内部信息，统一返回通用 500 文案', async () => {
    route = () => jsonResponse({ success: false, msg: '账号风控中', code: -100 })

    // 本用例必须排在成功用例之前：缓存为空时解析抛错才会真正冒泡成 500；
    // 若缓存已有旧榜，cached 的 stale 兜底会返回旧数据而不是抛错
    const { status, body } = await getJson('/v2/rednote')
    assert.equal(status, 500)
    assert.equal(body.code, 500)
    assert.equal(body.message, '服务器内部错误，请稍后重试')
    assert.ok(!JSON.stringify(body).includes('风控'), '上游错误细节不得回显给调用方')
  })

  it('解析 items：按序编 rank、缺省图标回退空串、链接对关键词做 URL 编码', async () => {
    route = (url) => {
      assert.ok(url.startsWith('https://edith.xiaohongshu.com/api/sns/v1/search/hot_list'), `错误上游: ${url}`)
      return jsonResponse({
        success: true,
        msg: 'success',
        code: 0,
        data: {
          items: [
            { title: '口红色号', score: '234.5万', word_type: '热', icon: 'https://ci.xiaohongshu.com/x.png' },
            { title: '咖啡 & 拉花', score: '100', word_type: '新' },
          ],
        },
      })
    }

    const { status, body } = await getJson('/v2/rednote')
    assert.equal(status, 200)
    const list = body.data as Array<{
      rank: number
      title: string
      score: string
      work_type_icon: string
      link: string
    }>
    assert.equal(list.length, 2)
    assert.equal(list[0].rank, 1)
    assert.equal(list[0].work_type_icon, 'https://ci.xiaohongshu.com/x.png')
    assert.equal(list[1].rank, 2)
    assert.equal(list[1].work_type_icon, '', '无图标条目应回退空串而不是 undefined')
    assert.ok(list[1].link.includes(encodeURIComponent('咖啡 & 拉花')), '关键词必须 URL 编码')
  })
})
