import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceReddit {
  handle(): RouterMiddleware<'/reddit'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `Reddit 热帖 (r/all)\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}\n   r/${e.subreddit} · ${e.author} · ${e.link}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# Reddit 热帖 (r/all)\n\n${data
            .slice(0, 25)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.link})\n\nr/${e.subreddit} · ${e.author}\n\n---\n`,
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

  async #fetch(): Promise<RedditItem[]> {
    const url = 'https://www.reddit.com/r/all/hot.rss'

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'cloudflare:daily-hot:0.1.0 (by /u/dailyhot)',
        Accept: 'application/atom+xml',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch reddit: HTTP ${response.status}`)
    }

    const xml = await response.text()
    return this.#parse(xml)
  }

  #parse(xml: string): RedditItem[] {
    const items: RedditItem[] = []
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g
    let m: RegExpExecArray | null
    let rank = 1

    while ((m = entryRe.exec(xml)) !== null) {
      const e = m[1]
      const title = (e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.trim() || ''
      const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || ''
      const subreddit = (e.match(/<category term="([^"]+)"/) || [])[1] || ''
      const authorRaw = (e.match(/<name>([\s\S]*?)<\/name>/) || [])[1]?.trim() || ''
      const author = authorRaw.replace(/^\/u\//, '')

      // 从 content 或 media:thumbnail 提取缩略图
      let thumbnail = (e.match(/media:thumbnail[^>]*url="([^"]+)"/) || [])[1] || ''
      if (!thumbnail) {
        const ct = (e.match(/<content type="html">([\s\S]*?)<\/content>/) || [])[1] || ''
        const unescaped = ct
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;amp;/g, '&')
          .replace(/&amp;/g, '&')
        thumbnail = (unescaped.match(/<img src="([^"]+)"/) || [])[1] || ''
      }

      if (title && link) {
        items.push({ rank: rank++, title, link, subreddit, author, thumbnail })
      }
    }

    return items
  }
}

interface RedditItem {
  rank: number
  title: string
  link: string
  subreddit: string
  author: string
  thumbnail: string
}

export const serviceReddit = new ServiceReddit()
