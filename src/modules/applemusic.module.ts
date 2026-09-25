import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { fetchUpstream } from '../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

// Apple Music 热门歌曲（Most-Played）。
// 官方「Marketing Tools RSS」是公开免密钥的 JSON 源，正好覆盖各地区热门榜，
// 不需要 Apple Developer 的 developer token（那是 Web API 才要的）：
//   https://rss.marketingtools.apple.com/api/v2/{地区}/music/most-played/{数量}/songs.json
const APPLE_FEED = 'https://rss.marketingtools.apple.com/api/v2'
// 该 feed 只提供 10 / 25 / 50 / 100 这几档，统一按 25 取再本地截断
const FEED_SIZE = 25
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 25

const REGION_MAP: Record<string, string> = {
  cn: '中国',
  us: '美国',
  jp: '日本',
  kr: '韩国',
  hk: '香港',
  tw: '台湾',
  gb: '英国',
}

class ServiceAppleMusic {
  handle(): RouterMiddleware<'/apple-music'> {
    return async (ctx) => {
      const region = (ctx.request.url.searchParams.get('region') || 'cn').toLowerCase()

      if (!REGION_MAP[region]) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(
          null,
          400,
          `暂不支持 ${region} 地区，可选值：${Object.keys(REGION_MAP).join('、')}`,
        )
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await cached(`apple-music-${region}`, () => this.#fetch(region))).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `Apple Music 热门歌曲（${REGION_MAP[region]}）\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title} - ${e.artist}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# Apple Music 热门歌曲 - ${REGION_MAP[region]}\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}**${e.artist}**${e.genre ? ` · ${e.genre}` : ''}\n\n---\n`,
            )
            .join('\n')}`
          break
        }

        case 'json':
        default: {
          ctx.response.body = Common.buildJson(data)
          break
        }
      }
    }
  }

  async #fetch(region: string): Promise<AppleMusicItem[]> {
    // fetchUpstream 自带 UA + 超时重试，这里只补 Accept 头
    const response = await fetchUpstream(`${APPLE_FEED}/${region}/music/most-played/${FEED_SIZE}/songs.json`, {
      headers: { Accept: 'application/json' },
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch apple music chart: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { feed?: { results?: AppleMusicRawItem[] } }
    const results = body.feed?.results || []

    const items = results
      .map((item, idx): AppleMusicItem => {
        // 类型数组是从泛到细排列的（音乐 → 国际流行），取最后一个更像「曲风」
        const genres = item.genres || []
        const genre = genres.length ? genres[genres.length - 1]?.name || '' : ''

        return {
          rank: idx + 1,
          id: item.id || '',
          title: (item.name || '').trim(),
          artist: (item.artistName || '').trim(),
          genre,
          meta: [(item.artistName || '').trim(), genre].filter(Boolean).join(' · '),
          link: item.url || '',
          // 封面默认是 100×100，换成 300×300 更清楚（同一套 mzstatic 缩略图规则）
          cover: (item.artworkUrl100 || '').replace(/100x100bb/, '300x300bb'),
          release_date: item.releaseDate || '',
        }
      })
      .filter((e) => e.title && e.link)

    if (!items.length) {
      throw new Error('Failed to parse apple music chart: empty results')
    }

    return items
  }
}

interface AppleMusicRawItem {
  id?: string
  name?: string
  artistName?: string
  url?: string
  artworkUrl100?: string
  releaseDate?: string
  genres?: { name?: string }[]
}

export interface AppleMusicItem {
  rank: number
  id: string
  title: string
  artist: string
  genre: string
  meta: string
  link: string
  cover: string
  release_date: string
}

export const serviceAppleMusic = new ServiceAppleMusic()
