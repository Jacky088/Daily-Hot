import { Common, dayjs } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

const API_URL = 'https://www.v2ex.com/api/topics/hot.json'

interface V2exItem {
  rank: number
  title: string
  link: string
  author: string
  node: string
  replies: number
  created: string
  created_at: number
}

class ServiceV2ex {
  handle(): RouterMiddleware<'/v2ex'> {
    return async (ctx) => {
      const data = await cached('v2ex', () => this.#fetch())

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `V2EX 热帖\n\n${data
            .map((e) => `${e.rank}. ${e.title} [${e.node}] ${e.replies} 回复 @${e.author}`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 💻 V2EX 热帖\n\n${data
            .map(
              (e) =>
                `### ${e.rank}. [${e.title}](${e.link})\n\n\`${e.node}\` · 💬 ${e.replies} 回复 · @${e.author} · ${e.created}\n\n---\n`,
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

  async #fetch(): Promise<V2exItem[]> {
    const response = await fetch(API_URL, {
      headers: { 'User-Agent': Common.chromeUA },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`V2EX API 请求失败: HTTP ${response.status}`)
    }

    const topics = (await response.json()) as V2exTopic[]

    return topics.map((t, i) => ({
      rank: i + 1,
      title: t.title || '',
      link: `https://www.v2ex.com/t/${t.id}`,
      author: t.member?.username || '',
      node: t.node?.title || '',
      replies: t.replies || 0,
      created: dayjs((t.last_modified || t.created) * 1000).format('YYYY-MM-DD HH:mm:ss'),
      created_at: (t.last_modified || t.created) * 1000,
    }))
  }
}

export const serviceV2ex = new ServiceV2ex()

interface V2exTopic {
  id: number
  title: string
  replies: number
  last_modified: number
  created: number
  last_touched: number
  member: {
    id: number
    username: string
  }
  node: {
    id: number
    name: string
    title: string
  }
}
