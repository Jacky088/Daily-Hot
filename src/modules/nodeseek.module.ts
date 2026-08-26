import { Common, dayjs } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

const RSS_URL = 'https://www.nodeseek.com/rss.xml'

// 分类映射：英文 key → 中文标签
const CATEGORY_MAP: Record<string, string> = {
  tech: '技术',
  daily: '日常',
  trade: '交易',
  info: '资讯',
  review: '评测',
  dev: '开发',
  carpool: '拼车',
  'photo-share': '晒图',
  expose: '曝光',
}

interface NodeSeekItem {
  rank: number
  title: string
  link: string
  category: string
  category_label: string
  author: string
  description: string
  created: string
  created_at: number
}

class ServiceNodeSeek {
  handle(): RouterMiddleware<'/nodeseek'> {
    return async (ctx) => {
      const data = await cached('nodeseek', () => this.#fetch())

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `NodeSeek 热帖\n\n${data
            .map((e) => `${e.rank}. ${e.title} [${e.category_label}] @${e.author}`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 🌐 NodeSeek 热帖\n\n${data
            .map(
              (e) =>
                `### ${e.rank}. [${e.title}](${e.link})\n\n\`${e.category_label}\` · @${e.author} · ${e.created}\n\n${e.description ? `${e.description}\n\n` : ''}---\n`,
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

  async #fetch(): Promise<NodeSeekItem[]> {
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': Common.chromeUA,
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`NodeSeek RSS 请求失败: HTTP ${response.status}`)
    }

    const xml = await response.text()

    // 解析 RSS XML：逐条提取 item
    const items: NodeSeekItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1]
      const title = this.#extractCDATA(block, 'title') || ''
      const link = this.#extractRaw(block, 'link') || ''
      const category = this.#extractCDATA(block, 'category') || ''
      const author = this.#extractCDATA(block, 'dc:creator') || ''
      const description = this.#extractCDATA(block, 'description') || ''
      const pubDate = this.#extractRaw(block, 'pubDate') || ''

      const created_at = pubDate ? Date.parse(pubDate) : Date.now()
      const created = dayjs(created_at).format('YYYY-MM-DD HH:mm:ss')

      items.push({
        rank: items.length + 1,
        title,
        link,
        category,
        category_label: CATEGORY_MAP[category] || category,
        author,
        description,
        created,
        created_at,
      })
    }

    return items
  }

  // 提取 <tag><![CDATA[value]]></tag> 中的 value
  #extractCDATA(block: string, tag: string): string {
    const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
    return re.exec(block)?.[1]?.trim() || ''
  }

  // 提取 <tag>value</tag> 中的 value
  #extractRaw(block: string, tag: string): string {
    const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')
    return re.exec(block)?.[1]?.trim() || ''
  }
}

export const serviceNodeSeek = new ServiceNodeSeek()
