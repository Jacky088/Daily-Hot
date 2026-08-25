import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class Service36Kr {
  handle(): RouterMiddleware<'/36kr'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `36氪热榜\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}\n   ${e.author} · 阅读 ${e.hot} · ${e.link}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 36氪热榜\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}**${e.author}** | 👁 ${e.hot} | 👍 ${e.praise}\n\n---\n`,
            )
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<Kr36Item[]> {
    const url = 'http://gateway.36kr.com/api/mis/nav/home/nav/rank/hot'

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        partner_id: 'wap',
        param: { siteId: 1, platformId: 2 },
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch 36kr hot list: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { code: number; data: { hotRankList: Kr36RawItem[] } }
    const list = body?.data?.hotRankList || []

    return list.map((item, idx) => {
      const t = item.templateMaterial
      return {
        rank: idx + 1,
        id: item.itemId,
        title: t?.widgetTitle || '',
        cover: t?.widgetImage || '',
        author: t?.authorName || '',
        link: `https://www.36kr.com/p/${item.itemId}`,
        hot: t?.statRead || 0,
        hot_desc: this.#formatNum(t?.statRead || 0),
        praise: t?.statPraise || 0,
        publish_time: t?.publishTime || 0,
      }
    })
  }

  #formatNum(n: number): string {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
    return String(n)
  }
}

interface Kr36RawItem {
  itemId: number
  templateMaterial: {
    widgetTitle: string
    widgetImage: string
    authorName: string
    statRead: number
    statPraise: number
    publishTime: number
  }
}

interface Kr36Item {
  rank: number
  id: number
  title: string
  cover: string
  author: string
  link: string
  hot: number
  hot_desc: string
  praise: number
  publish_time: number
}

export const service36Kr = new Service36Kr()
