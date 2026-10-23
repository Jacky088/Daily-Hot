import { Common, renderByEncoding } from '../../common.ts'
import { config } from '../../config.ts'
import { cached } from '../../cache.ts'
import { fetchUpstream } from '../../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

/**
 * TMDB 流媒体榜单：discover 接口按「观看平台」过滤 + 全球热度降序，
 * 是国外流媒体榜的唯一数据源（原 SIMKL 社区活跃度信号太弱、排序基本是噪声，已整体移除；
 * 未配置 TMDB_API_KEY 时接口返回 503 配置提示，不再有兜底数据）。
 *
 * 平台过滤用的是 TMDB 的 watch provider 体系：with_watch_providers=<id> +
 * watch_region=US，返回的是该平台在美区的热门内容。provider id 为官方固定值。
 */

const tmdbApi = 'https://api.themoviedb.org/3'
const tmdbImage = 'https://image.tmdb.org/t/p/w185'

// 允许的榜单类型，防注入白名单
const types: Record<string, string> = { tv: 'tv', movies: 'movies', anime: 'anime' }
const typeLabels: Record<string, string> = { tv: '剧集', movies: '电影', anime: '动画' }

// 前端下拉里的平台名（小写化后作 key）→ watch provider id（均为美区固定值；
// id 与官方 /watch/providers/tv 列表核对，2026-10 有效）。裸「HBO」「Apple TV」
// 与 HBO Max / Apple TV+ 是同一 provider，故不再单列
const PROVIDERS: Record<string, number> = {
  netflix: 8,
  'disney+': 337,
  'hbo max': 1899,
  hbo: 1899, // 旧称呼兼容（如外部直接拼参）
  'prime video': 9,
  'apple tv+': 350,
  'apple tv': 350, // 同上，兼容旧参数
  hulu: 15,
  'paramount+': 531,
  peacock: 386,
  starz: 43,
  'amc+': 534,
  'mgm+': 2739,
  crunchyroll: 283,
}

// provider id → 徽标展示名（与前端下拉文案保持一致）
const PROVIDER_LABELS: Record<number, string> = {
  8: 'Netflix',
  337: 'Disney+',
  1899: 'HBO Max',
  9: 'Prime Video',
  350: 'Apple TV+',
  15: 'Hulu',
  531: 'Paramount+',
  386: 'Peacock',
  43: 'Starz',
  534: 'AMC+',
  2739: 'MGM+',
  283: 'Crunchyroll',
}

export interface StreamingItem {
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

interface TmdbResult {
  id: number
  title?: string
  name?: string
  vote_average?: number
  vote_count?: number
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  overview?: string
}

/**
 * 拉取一份流媒体热门榜。t 取值：tv / movies / anime；
 * network 传平台名（Netflix / HBO Max / Disney+ ...），不传则为全平台热度榜。
 * any 错误直接向上抛，由 serviceStreaming 统一转为 502 响应。
 */
export async function fetchTmdbList(t: string, network?: string | null): Promise<StreamingItem[]> {
  const key = config.tmdbApiKey
  if (!key) throw new Error('TMDB_API_KEY 未配置')

  const providerId = network ? PROVIDERS[network.trim().toLowerCase()] : undefined
  if (network && !providerId) throw new Error(`TMDB 暂不支持该平台过滤: ${network}`)

  // anime 取日本动画剧集（动画类型 + 日语原声的组合过滤，覆盖主流番剧）；
  // tv / movies 走常规 discover
  const isMovie = t === 'movies'
  const path = isMovie ? '/discover/movie' : '/discover/tv'
  const params = new URLSearchParams({
    api_key: key,
    language: 'zh-CN',
    sort_by: 'popularity.desc',
    page: '1',
  })
  if (t === 'anime') {
    params.set('with_genres', '16')
    params.set('with_original_language', 'ja')
  }
  if (providerId) {
    params.set('with_watch_providers', String(providerId))
    params.set('watch_region', 'US')
  }

  const response = await fetchUpstream(`${tmdbApi}${path}?${params}`, { timeoutMs: 8000 })
  if (!response.ok) {
    throw new Error(`Failed to fetch tmdb-discover: HTTP ${response.status}`)
  }

  const data = (await response.json()) as { results?: TmdbResult[] }
  const results = Array.isArray(data?.results) ? data.results : []

  return results.slice(0, 30).map((e, idx) => ({
    rank: idx + 1,
    title: e.title || e.name || '',
    rating: e.vote_average ? Math.round(e.vote_average * 10) / 10 : null,
    votes: e.vote_count || null,
    watched: null,
    plan_to_watch: null,
    release_date: e.release_date || e.first_air_date || '',
    network: providerId ? PROVIDER_LABELS[providerId] || '' : '',
    poster: e.poster_path ? `${tmdbImage}${e.poster_path}` : '',
    link: `https://www.themoviedb.org/${isMovie ? 'movie' : 'tv'}/${e.id}`,
    overview: (e.overview || '').slice(0, 120),
  }))
}

// 未配置 key 时的提示文案（text/markdown/json 三种编码共用一份事实描述）
const KEY_HINT =
  '国外流媒体榜数据源为 TMDB，需在服务端配置环境变量 TMDB_API_KEY（在 themoviedb.org 免费注册即可获取），配置后重启服务生效'

class ServiceStreaming {
  /**
   * 国外流媒体榜路由。路由名沿用历史的 /simkl-trending（外部用户已在用，
   * 换路径会破坏兼容）；network 过滤是查询参数，进缓存键。
   * 未配置 TMDB_API_KEY 时返回 503 + 配置提示，前端识别后直接渲染提示卡片。
   */
  handle(): RouterMiddleware<'/simkl-trending'> {
    return async (ctx) => {
      const type = (await Common.getParam('type', ctx.request)) || 'tv'
      const network = await Common.getParam('network', ctx.request)
      const t = types[type] || 'tv'
      const label = typeLabels[t] || t

      if (!config.tmdbApiKey) {
        renderByEncoding(ctx, {
          text: () => KEY_HINT,
          markdown: () => `# 🍿 流媒体${label}榜未启用\n\n${KEY_HINT}`,
          json: () => Common.buildJson(null, 503, KEY_HINT),
        })
        return
      }

      try {
        const list = await cached(`tmdb:trending:${t}:${network || 'all'}`, () => fetchTmdbList(t, network), {
          ttl: 30 * 60 * 1000,
          cacheIf: (l) => l.length > 0,
        })

        renderByEncoding(ctx, {
          text: () =>
            `TMDB ${label} 热门${network ? ` · ${network}` : ''}\n\n${list
              .map((e) => `${e.rank}. ${e.title}${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` [${e.network}]` : ''}`)
              .join('\n')}`,
          markdown: () =>
            `# 🍿 TMDB 热门${label}${network ? ` · ${network}` : ''}\n\n${list
              .map(
                (e) =>
                  `${e.rank}. [${e.title}](${e.link})${e.rating ? ` ⭐${e.rating}` : ''}${e.network ? ` — ${e.network}` : ''}`,
              )
              .join('\n')}`,
          json: () => Common.buildJson(list),
        })
      } catch (err) {
        const msg = `TMDB 数据获取失败：${err instanceof Error ? err.message : err}`
        renderByEncoding(ctx, {
          text: () => msg,
          markdown: () => `# 🍿 流媒体${label}榜获取失败\n\n${msg}`,
          json: () => Common.buildJson(null, 502, msg),
        })
      }
    }
  }
}

export const serviceStreaming = new ServiceStreaming()
