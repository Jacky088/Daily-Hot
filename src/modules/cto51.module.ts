import { load } from 'cheerio'
import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

// 51CTO 博客排行榜：官方无开放接口，抓 blog.51cto.com/ranking/{day|week} 解析。
// 页面是 UTF-8（这点很关键——同为中文技术社区，52pojie 全站 GBK，Cloudflare Workers
// 的 TextDecoder 只支持 UTF-8，那类站点在 Worker 上需要额外的码表才能解码）
const CTO51_RANK_URL = 'https://blog.51cto.com/ranking'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

// 只有 day / week 有榜；month 实测 404
const TYPE_MAP: Record<string, string> = {
  day: '日榜',
  week: '周榜',
}

class ServiceCTO51 {
  handle(): RouterMiddleware<'/51cto'> {
    return async (ctx) => {
      const type = ctx.request.url.searchParams.get('type') || 'day'

      if (!TYPE_MAP[type]) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, `暂不支持 ${type} 榜单，可选值：${Object.keys(TYPE_MAP).join('、')}`)
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await cached(`51cto-${type}`, () => this.#fetch(type))).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `51CTO 博客${TYPE_MAP[type]}\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title}\n   ${e.author}${e.hot ? ` · 热度 ${e.hot}` : ''}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 51CTO 博客${TYPE_MAP[type]}\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n**${e.author}**${e.hot ? ` | 🔥 ${e.hot}` : ''}\n\n---\n`,
            )
            .join('\n')}`
          break
        }

        case 'json':
        default: {
          ctx.response.body = Common.buildJson(data)
          break
        }
      }
    }
  }

  // 取榜单页 HTML。
  // ⚠️ 上游 blog.51cto.com 挂在腾讯 EdgeOne 后面，带 WAF：
  //   ① Accept 必须带 */*——带 text/html（哪怕连同 xhtml/xml）会被判成爬虫，
  //      返回 29KB 的 JS 挑战空壳页（HTTP 仍是 200，页面里没有榜单）；
  //   ② Cloudflare Workers 的出口同样会被判定为爬虫并拿到挑战页：这一层是出口信誉 /
  //      TLS 指纹级别的判定，改请求头未必能绕过。所以这里补全一套浏览器指纹头，
  //      失败再带 cache-buster 重试一次（重新走边缘判定，有概率直接放行），
  //      两次都拿到挑战页就明确报出来，便于一眼看出是「被风控」而不是「页面改版」
  async #fetchHtml(type: string): Promise<string> {
    const reasons: string[] = []

    for (let attempt = 1; attempt <= 2; attempt++) {
      // 第二次带时间戳：避免反复命中同一个已被标记的边缘缓存
      const url = `${CTO51_RANK_URL}/${type}${attempt > 1 ? `?_=${Date.now()}` : ''}`

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': Common.chromeUA,
            Accept: '*/*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            Referer: 'https://blog.51cto.com/',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
          },
          signal: AbortSignal.timeout(12000),
        })

        if (!response.ok) {
          reasons.push(`HTTP ${response.status}`)
          continue
        }

        const html = await response.text()

        // 挑战空壳页的特征：篇幅只有几十 KB，且没有榜单容器
        if (!html.includes('ranking-list')) {
          reasons.push(`第 ${attempt} 次拿到 WAF 挑战页（${html.length} 字节）`)
          continue
        }

        return html
      } catch (e) {
        reasons.push(`第 ${attempt} 次请求失败：${(e as Error).message}`)
      }
    }

    throw new Error(`Failed to fetch 51cto ranking: ${reasons.join(' | ')}`)
  }

  async #fetch(type: string): Promise<CTO51Item[]> {
    // ⚠️ Accept 必须是 */*：带上 text/html（哪怕连同 xhtml/xml）会被站点的 WAF 判定为爬虫，
    // 返回 29KB 的 JS 挑战空壳页（HTTP 仍是 200，页面里没有榜单），实测只有 */* 能拿到真页面
    const $ = load(await this.#fetchHtml(type))
    const items: CTO51Item[] = []

    // 榜单结构：ul.ranking-list > li.follow-item
    //   序号 span.ranking-num / 标题 strong.tit > a / 作者 a.username / 热度 .hotnum
    $('ul.ranking-list li.follow-item').each((_, el) => {
      const anchor = $(el).find('strong.tit a').first()
      const link = anchor.attr('href') || ''
      const title = (anchor.attr('title') || anchor.text() || '').trim()

      if (!title || !link) return

      const hot = Number(($(el).find('.follow-right .hotnum').first().text() || '').replace(/[^\d]/g, '')) || 0

      items.push({
        rank: Number($(el).find('.ranking-num').first().text().trim()) || items.length + 1,
        id: link.split('/').pop() || String(items.length + 1),
        title,
        link,
        author: $(el).find('a.username').first().text().trim(),
        hot,
        hot_value_desc: hot ? `热度 ${hot}` : '',
      })
    })

    // 一条都没解析出来 = 页面结构变了，报错让缓存层回退旧数据，而不是把空列表当成“正常”
    if (!items.length) {
      throw new Error('Failed to parse 51cto ranking: page structure may have changed')
    }

    return items
  }
}

interface CTO51Item {
  rank: number
  id: string
  title: string
  link: string
  author: string
  hot: number
  hot_value_desc: string
}

export const serviceCTO51 = new ServiceCTO51()
