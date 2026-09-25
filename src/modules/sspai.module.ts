import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { fetchUpstream } from '../fetch-upstream.ts'
import { withUapisFallback } from './uapis.module.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceSspai {
  handle(): RouterMiddleware<'/sspai'> {
    return async (ctx) => {
      // 主源失效时退回 uapis 备用源
      const data = await cached('sspai', () => withUapisFallback('sspai', () => this.#fetch()), { ttl: 10 * 60 * 1000 })

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `少数派热榜\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}\n   ${e.author} · 赞 ${e.hot} · ${e.link}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 少数派热榜\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}**${e.author}** | 👍 ${e.hot} | 💬 ${e.comments}\n\n---\n`,
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

  async #fetch(): Promise<SspaiItem[]> {
    const url = `https://sspai.com/api/v1/article/tag/page/get?limit=20&tag=${encodeURIComponent('热门文章')}`

    // Referer 必带；fetchUpstream 自带 UA + 10s 超时 + 1 次重试
    const response = await fetchUpstream(url, {
      headers: {
        Referer: 'https://sspai.com/',
        Accept: 'application/json',
      },
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch sspai: HTTP ${response.status}`)
    }

    const apiData = (await response.json()) as SspaiResponse

    if (apiData.error !== 0 || !Array.isArray(apiData.data)) {
      throw new Error(`少数派接口返回异常：${apiData.message || '未知错误'}（error: ${apiData.error}）`)
    }

    return apiData.data.map((v, idx) => ({
      rank: idx + 1,
      title: v.title,
      desc: v.summary,
      cover: v.banner ? `https://cdn.sspai.com/${v.banner.replace(/^\//, '')}` : '',
      author: v.author?.nickname || '',
      hot: v.like_count,
      comments: v.comment_count ?? 0,
      timestamp: v.released_time,
      link: `https://sspai.com/post/${v.id}`,
    }))
  }
}

interface SspaiItem {
  rank: number
  title: string
  desc: string
  cover: string
  author: string
  hot: number
  comments: number
  timestamp: number
  link: string
}

interface SspaiRawItem {
  id: number
  title: string
  summary: string
  banner: string
  author: { nickname: string }
  released_time: number
  like_count: number
  comment_count?: number
}

interface SspaiResponse {
  error: number
  message?: string
  data: SspaiRawItem[]
}

export const serviceSspai = new ServiceSspai()
