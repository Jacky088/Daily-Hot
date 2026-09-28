import { Common } from '../../common.ts'
import { cached } from '../../cache.ts'
import { fetchUpstream } from '../../fetch-upstream.ts'

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

      // 全量榜单按类型缓存（network 过滤是纯内存操作，留在缓存外按请求执行）：
      // anime 榜单回源要 1 次列表请求 + 最多 30 次并发详情请求，不缓存代价太大
      const list: SimklItem[] = await cached(`simkl:trending:${t}`, () => this.#fetchList(t), {
        ttl: 5 * 60 * 1000,
        cacheIf: (list) => list.length > 0,
      })

      // 按播出平台过滤（TV 有 network 字段，如 Netflix / HBO / Disney+），大小写不敏感包含匹配
      const filtered = network ? list.filter((e) => e.network.toLowerCase().includes(network.toLowerCase())) : list

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `SIMKL ${t} 热门${network ? ` · ${network}` : ''}\n\n${filtered
            .map((e) => `${e.rank}. ${e.title}${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` [${e.network}]` : ''}`)
            .join('\n')}`
          break

        case 'markdown': {
          ctx.response.body = `# 🍿 SIMKL 热门${t === 'tv' ? '剧集' : t === 'anime' ? '动画' : '电影'}${network ? ` · ${network}` : ''}\n\n${filtered
            .map(
              (e) =>
                `${e.rank}. [${e.title}](${e.link})${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` — ${e.network}` : ''}`,
            )
            .join('\n')}`
          break
        }

        case 'json':
        default:
          ctx.response.body = Common.buildJson(filtered)
          break
      }
    }
  }

  // fetchUpstream 自带 UA + 8s 超时 + 1 次重试；Accept 头保留
  async #fetchList(t: string): Promise<SimklItem[]> {
    const response = await fetchUpstream(`${simklApi}/${t}/trending`, {
      headers: { Accept: 'application/json' },
      timeoutMs: 8000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch simkl-trending: HTTP ${response.status}`)
    }

    const raw = (await response.json()) as SimklTrendingItem[]
    const items = Array.isArray(raw) ? raw : []

    const sliced = items.slice(0, 30)
    // anime trending 不带 title 和 url（只有 simkl_id），并发拉详情补齐；TV/电影自带字段零开销
    const enriched = await Promise.all(
      sliced.map(async (e) => {
        if (e.title && e.url) return e
        const id = e.ids?.simkl_id
        if (!id) return e
        try {
          // 补齐标题的详情请求：单个 6s 超时不重试，失败回退原条目
          const res = await fetchUpstream(`${simklApi}/anime/${id}`, {
            headers: { Accept: 'application/json' },
            timeoutMs: 6000,
            retry: 0,
          })
          if (!res.ok) return e
          const d = (await res.json()) as SimklDetail
          return {
            ...e,
            title: e.title || d.title || `#${id}`,
            url: e.url || (d.ids?.slug ? `/anime/${id}/${d.ids.slug}` : e.url),
          }
        } catch {
          return e
        }
      }),
    )

    return enriched.map((e, idx) => ({
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
  ids?: { simkl_id?: number }
  ratings?: {
    simkl?: { rating?: number; votes?: number }
  }
}

// 详情端点响应（仅取补齐标题/链接所需字段）
interface SimklDetail {
  title?: string
  ids?: { slug?: string }
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
