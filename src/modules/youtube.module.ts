import { Common, dayjs, TZ_SHANGHAI } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

// YouTube 热榜（固定取「游戏」栏目）。
// 官方 Data API v3 的 chart=mostPopular 需要 API Key（免费但有配额、要注册），
// 所以这里走社区免密钥实例：Invidious / Piped 的 trending 接口，多实例串行兜底。
//
// 两个实测结论决定了下面的写法：
//   1. 默认 trending 栏目返回的几乎全是直播（US 14/14、JP 15/15，播放量从几百到 41 万），
//      当榜单看没意义；而 Invidious 的 type=gaming 栏目数据干净（48 条正常视频，
//      时长/播放量齐全）—— 故固定请求游戏栏目。
//   2. Piped 的 /trending 不支持 type 参数，只能拿到那份直播榜单，所以对 Piped 的结果
//      按「时长 < 0 即直播」过滤掉；滤完为空则视为该实例不可用，继续试下一个。
//
// ⚠️ 时间字段两边都不可信（Piped 的 uploaded 对直播是 0；Invidious 的 publishedText 跟随
// 实例语言、published 等于响应时刻），所以时间一律从时间戳自己算，取不到就不显示。
const INVIDIOUS_INSTANCES = ['invidious.f5.si', 'inv.nadeko.net', 'invidious.nerdvpn.de']
const PIPED_INSTANCES = ['pipedapi.ducks.party', 'pipedapi.kavin.rocks']

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 30
// 单实例超时压到 6s：多个实例串行尝试，万一全挂也不至于把请求拖到几十秒
const INSTANCE_TIMEOUT_MS = 6000
// Invidious 的 trending 支持栏目参数，gaming 是实测唯一数据干净的栏目
const TRENDING_TYPE = 'gaming'

const REGION_MAP: Record<string, string> = {
  US: '美国',
  HK: '香港',
  TW: '台湾',
  JP: '日本',
  KR: '韩国',
  GB: '英国',
}

class ServiceYoutube {
  handle(): RouterMiddleware<'/youtube'> {
    return async (ctx) => {
      const region = (ctx.request.url.searchParams.get('region') || 'US').toUpperCase()

      if (!REGION_MAP[region]) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, `暂不支持 ${region} 地区，可选值：${Object.keys(REGION_MAP).join('、')}`)
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await cached(`youtube-${region}`, () => this.#fetch(region))).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `YouTube 游戏热榜（${REGION_MAP[region]}）\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title}\n   ${e.meta}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# YouTube 游戏热榜 - ${REGION_MAP[region]}\n\n${data
            .map((e, idx) => `### ${idx + 1}. [${e.title}](${e.link})\n\n${e.meta}\n\n---\n`)
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

  async #fetch(region: string): Promise<YoutubeItem[]> {
    const errors: string[] = []

    // Invidious 放在前面：只有它支持栏目参数，能拿到游戏榜
    for (const host of INVIDIOUS_INSTANCES) {
      try {
        const res = await fetch(`https://${host}/api/v1/trending?region=${region}&type=${TRENDING_TYPE}`, {
          headers: { 'User-Agent': Common.chromeUA, Accept: 'application/json' },
          signal: AbortSignal.timeout(INSTANCE_TIMEOUT_MS),
        })
        if (!res.ok) {
          errors.push(`${host}: HTTP ${res.status}`)
          continue
        }

        const list = (await res.json()) as InvidiousVideo[]
        if (Array.isArray(list) && list.length) {
          const items = list
            .filter((v) => !v.liveNow)
            .map((v, idx) => this.#build(idx + 1, v.videoId, v.title, v.author, v.viewCount, (v.published || 0) * 1000))
            .filter((e) => e.id && e.title)
          if (items.length) return items
        }
        errors.push(`${host}: 空数据`)
      } catch (e) {
        errors.push(`${host}: ${(e as Error).message}`)
      }
    }

    for (const host of PIPED_INSTANCES) {
      try {
        const res = await fetch(`https://${host}/trending?region=${region}`, {
          headers: { 'User-Agent': Common.chromeUA, Accept: 'application/json' },
          signal: AbortSignal.timeout(INSTANCE_TIMEOUT_MS),
        })
        if (!res.ok) {
          errors.push(`${host}: HTTP ${res.status}`)
          continue
        }

        const list = (await res.json()) as PipedVideo[]
        if (Array.isArray(list) && list.length) {
          const items = list
            // Piped 不支持栏目参数，只能拿到直播榜，按 duration < 0 全部滤掉
            .filter((v) => (v.duration ?? -1) >= 0)
            .map((v, idx) => {
              // 只给相对路径 /watch?v=xxx，视频 id 从这里取；uploaded 是毫秒时间戳
              const id = (v.url || '').split('v=')[1] || ''
              return this.#build(idx + 1, id, v.title, v.uploaderName, v.views, v.uploaded)
            })
            .filter((e) => e.id && e.title)
          if (items.length) return items
          errors.push(`${host}: 仅返回直播内容，已过滤`)
          continue
        }
        errors.push(`${host}: 空数据`)
      } catch (e) {
        errors.push(`${host}: ${(e as Error).message}`)
      }
    }

    throw new Error(`Failed to fetch youtube trending（免密钥实例全部不可用：${errors.join(' | ')}）`)
  }

  #build(rank: number, id: string, title: string, author: string, views: number, publishedAt: number): YoutubeItem {
    // 缩略图自己拼 ytimg 直链：实例返回的 thumbnail 可能走实例代理，慢且会随实例一起挂
    const cover = id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : ''
    // 频道名常带首尾空格（实测有 "Asmongold TV  "），收一下免得 meta 里出现空档
    const channel = (author || '').trim().replace(/\s+/g, ' ')

    return {
      rank,
      id,
      title: (title || '').trim(),
      link: id ? `https://www.youtube.com/watch?v=${id}` : '',
      cover,
      author: channel,
      views: views || 0,
      published_at: publishedAt,
      published: publishedAt > 0 ? dayjs(publishedAt).tz(TZ_SHANGHAI).format('YYYY-MM-DD HH:mm:ss') : '',
      meta: [channel, views ? `${this.#formatNum(views)}次观看` : '', this.#relTime(publishedAt)].filter(Boolean).join(' · '),
    }
  }

  // 相对时间自己算：实例返回的文本跟随实例语言（实测有阿拉伯语），不能用
  #relTime(ts: number): string {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60000) return '刚刚'
    const min = Math.floor(diff / 60000)
    if (min < 60) return `${min} 分钟前`
    const hour = Math.floor(min / 60)
    if (hour < 24) return `${hour} 小时前`
    const day = Math.floor(hour / 24)
    if (day < 30) return `${day} 天前`
    return dayjs(ts).tz(TZ_SHANGHAI).format('YYYY-MM-DD')
  }

  #formatNum(n: number): string {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return String(n)
  }
}

interface InvidiousVideo {
  videoId: string
  title: string
  author: string
  viewCount: number
  liveNow: boolean
  /** Unix 时间戳（秒） */
  published: number
}

interface PipedVideo {
  url: string
  title: string
  uploaderName: string
  views: number
  /** Unix 时间戳（毫秒），直播条目为 0 */
  uploaded: number
  /** 直播为 -1 */
  duration: number
}

export interface YoutubeItem {
  rank: number
  id: string
  title: string
  link: string
  cover: string
  author: string
  views: number
  published_at: number
  published: string
  meta: string
}

export const serviceYoutube = new ServiceYoutube()
