import { Common } from '../common.ts'
import { load } from 'cheerio'

import type { RouterMiddleware } from '@oak/oak'

// 国际媒体头条 RSS 源（官方、免 key）
// 注：Google News RSS 在本地可访问，但 Cloudflare Workers 出口 IP 被 Google 高频拦截
// （实测失败率 ~75%），线上默认使用其他源，google 保留为备选。
const sources: Record<string, { name: string; url: string }> = {
  google: { name: 'Google News 头条', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en' },
  bbc: { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  cnn: { name: 'CNN News', url: 'http://rss.cnn.com/rss/edition_world.rss' },
  aljazeera: { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  guardian: { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss' },
  npr: { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml' },
}

class ServiceWorldNews {
  handle(): RouterMiddleware<'/world-news'> {
    return async (ctx) => {
      const source = (await Common.getParam('source', ctx.request)) || 'google'
      const conf = sources[source]
      if (!conf) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, `不支持的数据源：${source}，可选 ${Object.keys(sources).join(' / ')}`)
        return
      }

      const response = await fetch(conf.url, {
        headers: { 'User-Agent': Common.chromeUA, Accept: 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch world-news[${source}]: HTTP ${response.status}`)
      }

      const $ = load(await response.text(), { xmlMode: true })
      const list: WorldNewsItem[] = []

      $('item').each((_, el) => {
        if (list.length >= 30) return false
        const $el = $(el)
        const title = ($el.find('title').text() || '').trim()
        let link = ($el.find('link').text() || '').trim()
        // RSS 2.0 里 link 可能是 CDATA/纯文本，google news 的链接在 guid 之外也可能带 amp 参数，仅做基础校验
        if (!link.startsWith('http')) link = $el.find('guid').text().trim()
        if (!title) return
        list.push({
          rank: list.length + 1,
          title,
          link,
          pubDate: ($el.find('pubDate').text() || '').trim(),
          source: conf.name,
        })
      })

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `${conf.name} 头条\n\n${list.map((e) => `${e.rank}. ${e.title}`).join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 🌍 ${conf.name}\n\n${list.map((e) => `${e.rank}. [${e.title}](${e.link})`).join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(list)
          break
      }
    }
  }
}

export const serviceWorldNews = new ServiceWorldNews()

interface WorldNewsItem {
  rank: number
  title: string
  link: string
  pubDate: string
  source: string
}
