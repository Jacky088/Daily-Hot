import { Common, dayjs } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

const RSS_URL = 'https://lowendtalk.com/discussions/feed.rss'

interface LowEndTalkItem {
  rank: number
  title: string
  link: string
  category: string
  author: string
  description: string
  created: string
  created_at: number
}

class ServiceLowEndTalk {
  handle(): RouterMiddleware<'/lowendtalk'> {
    return async (ctx) => {
      const data = await cached('lowendtalk', () => this.#fetch(), { ttl: 10 * 60 * 1000 })

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `LowEndTalk 热帖\n\n${data
            .map((e) => `${e.rank}. ${e.title} [${e.category}] @${e.author}`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 🖥️ LowEndTalk\n\n${data
            .map(
              (e) =>
                `### ${e.rank}. [${e.title}](${e.link})\n\n\`${e.category}\` · @${e.author} · ${e.created}\n\n---\n`,
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

  async #fetch(): Promise<LowEndTalkItem[]> {
    const response = await fetch(RSS_URL, {
      headers: { 'User-Agent': Common.chromeUA },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`LowEndTalk RSS 请求失败: HTTP ${response.status}`)
    }

    const xml = await response.text()

    // 解析 RSS XML
    const items: LowEndTalkItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1]
      const title = this.#extractCDATA(block, 'title') || this.#extractRaw(block, 'title') || ''
      const link = this.#extractRaw(block, 'link') || ''
      const category = this.#extractCDATA(block, 'category') || this.#extractRaw(block, 'category') || ''
      const author = this.#extractCDATA(block, 'dc:creator') || this.#extractRaw(block, 'dc:creator') || ''
      const description = this.#stripHtml(this.#extractCDATA(block, 'description') || '')
      const pubDate = this.#extractRaw(block, 'pubDate') || ''

      const created_at = pubDate ? Date.parse(pubDate) : Date.now()
      const created = dayjs(created_at).format('YYYY-MM-DD HH:mm:ss')

      items.push({
        rank: items.length + 1,
        title,
        link,
        category,
        author,
        description: description.slice(0, 200),
        created,
        created_at,
      })
    }

    return items
  }

  #extractCDATA(block: string, tag: string): string {
    const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
    return re.exec(block)?.[1]?.trim() || ''
  }

  #extractRaw(block: string, tag: string): string {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')
    return re.exec(block)?.[1]?.trim() || ''
  }

  // 去除 HTML 标签，保留纯文本
  #stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }
}

export const serviceLowEndTalk = new ServiceLowEndTalk()
