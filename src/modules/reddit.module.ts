import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceReddit {
  // 缓存成功结果：Reddit 对未认证请求限流严格（约 1 分钟窗口仅 2~3 次，429 后需等待约 1 分钟）
  #cache: { data: RedditItem[]; ts: number } | null = null

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
    const FRESH_TTL = 5 * 60 * 1000 // 5 分钟内直接返回缓存，不打上游
    const STALE_TTL = 60 * 60 * 1000 // 上游限流/失败时，1 小时内的旧数据兜底

    if (this.#cache && Date.now() - this.#cache.ts < FRESH_TTL) {
      return this.#cache.data
    }

    let lastError: unknown = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://www.reddit.com/r/all/hot.rss', {
          headers: {
            'User-Agent': 'cloudflare:daily-hot:0.1.0 (by /u/dailyhot)',
            Accept: 'application/atom+xml',
          },
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const xml = await response.text()
          const data = this.#parse(xml)
          this.#cache = { data, ts: Date.now() }
          return data
        }

        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'))
          const delay =
            Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 5
              ? retryAfter * 1000
              : 2000 * (attempt + 1)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }

        throw new Error(`Failed to fetch reddit: HTTP ${response.status}`)
      } catch (e) {
        lastError = e
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
      }
    }

    // 重试耗尽：旧数据兜底（比直接报错体验好）
    if (this.#cache && Date.now() - this.#cache.ts < STALE_TTL) {
      return this.#cache.data
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to fetch reddit')
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
