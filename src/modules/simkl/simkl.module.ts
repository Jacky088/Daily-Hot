import { Common } from '../../common.ts'

import type { RouterMiddleware } from '@oak/oak'

const simklApi = 'https://api.simkl.com'
const simklPoster = 'https://simkl.in/posters'

// 允许的榜单类型，防注入白名单
const types: Record<string, string> = { tv: 'tv', movies: 'movies', anime: 'anime' }

class ServiceSimkl {
  handle(): RouterMiddleware<'/simkl-trending'> {
    return async (ctx) => {
      const type = (await Common.getParam('type', ctx.request)) || 'tv'
      const network = await Common.getParam('network', ctx.request)
      const t = types[type] || 'tv'

      const response = await fetch(`${simklApi}/${t}/trending`, {
        headers: { 'User-Agent': Common.chromeUA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch simkl-trending: HTTP ${response.status}`)
      }

      const raw = (await response.json()) as SimklTrendingItem[]
      let items = Array.isArray(raw) ? raw : []

      // 按播出平台过滤（TV 有 network 字段，如 Netflix / HBO / Disney+），大小写不敏感包含匹配
      if (network) {
        const kw = network.toLowerCase()
        items = items.filter((e) => String(e.network || '').toLowerCase().includes(kw))
      }

      const list: SimklItem[] = items.slice(0, 30).map((e, idx) => ({
        rank: idx + 1,
        title: e.title || '',
        rating: e.ratings?.simkl?.rating ?? null,
        votes: e.ratings?.simkl?.votes ?? null,
        watched: e.watched ?? null,
        plan_to_watch: e.plan_to_watch ?? null,
        release_date: e.release_date || '',
        network: e.network || '',
        poster: e.poster ? `${simklPoster}/${e.poster}_m.jpg` : '',
        link: e.url ? `https://simkl.com${e.url}` : '',
        overview: (e.overview || '').slice(0, 120),
      }))

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `SIMKL ${t} 热门${network ? ` · ${network}` : ''}\n\n${list
            .map((e) => `${e.rank}. ${e.title}${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` [${e.network}]` : ''}`)
            .join('\n')}`
          break

        case 'markdown': {
          ctx.response.body = `# 🍿 SIMKL 热门${t === 'tv' ? '剧集' : t === 'anime' ? '动画' : '电影'}${network ? ` · ${network}` : ''}\n\n${list
            .map((e) => `${e.rank}. [${e.title}](${e.link})${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` — ${e.network}` : ''}`)
            .join('\n')}`
          break
        }

        case 'json':
        default:
          ctx.response.body = Common.buildJson(list)
          break
      }
    }
  }
}

export const serviceSimkl = new ServiceSimkl()

interface SimklTrendingItem {
  title: string
  url: string
  poster: string
  release_date?: string
  rank?: number
  watched?: number
  plan_to_watch?: number
  network?: string
  overview?: string
  ratings?: {
    simkl?: { rating?: number; votes?: number }
  }
}

interface SimklItem {
  rank: number
  title: string
  rating: number | null
  votes: number | null
  watched: number | null
  plan_to_watch: number | null
  release_date: string
  network: string
  poster: string
  link: string
  overview: string
}
