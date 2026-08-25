import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceHuxiu {
  // 缓存成功结果：虎嗅官方 API 有阿里云 WAF 防护，降低请求频率
  #cache: { data: HuxiuItem[]; ts: number } | null = null

  handle(): RouterMiddleware<'/huxiu'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `虎嗅热榜\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}\n   热度 ${e.hot} · ${e.link}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 虎嗅热榜\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}🔥 ${e.hot}\n\n---\n`,
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

  async #fetch(): Promise<HuxiuItem[]> {
    const FRESH_TTL = 10 * 60 * 1000 // 10 分钟内直接返回缓存
    const STALE_TTL = 2 * 60 * 60 * 1000 // 拉取失败时，2 小时内的旧数据兜底

    if (this.#cache && Date.now() - this.#cache.ts < FRESH_TTL) {
      return this.#cache.data
    }

    // 主源：虎嗅官方 API；被 WAF 拦截时降级 tophub 聚合源
    const data = (await this.#fetchOfficial()) ?? (await this.#fetchTophub())

    if (data) {
      this.#cache = { data, ts: Date.now() }
      return data
    }

    // 两个源都失败：旧数据兜底
    if (this.#cache && Date.now() - this.#cache.ts < STALE_TTL) {
      return this.#cache.data
    }

    throw new Error('虎嗅热榜获取失败（官方接口被 WAF 拦截且聚合源不可用），请稍后重试')
  }

  // 虎嗅官方 API（阿里云 WAF 对部分出口 IP 弹滑块验证，可能失败）
  async #fetchOfficial(): Promise<HuxiuItem[] | null> {
    try {
      const response = await fetch('https://api.huxiu.com/v1/article/hotList', {
        headers: {
          'User-Agent': Common.chromeUA,
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://www.huxiu.com/',
        },
        signal: AbortSignal.timeout(8000),
      })

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/html')) return null // WAF 验证码页面
      if (!response.ok) return null

      const apiData = (await response.json()) as HuxiuResponse
      if (apiData.code !== 1 || !Array.isArray(apiData.data)) return null

      return apiData.data.map((v, idx) => ({
        rank: idx + 1,
        title: v.title,
        desc: v.summary || '',
        cover: v.pic || '',
        author: v.user_info?.username || '',
        hot: v.score ?? 0,
        comments: v.comment_count ?? 0,
        timestamp: v.dateline,
        link: `https://www.huxiu.com/article/${v.aid}.html`,
      }))
    } catch {
      return null
    }
  }

  // 降级源：tophub.today 聚合的虎嗅网热文
  async #fetchTophub(): Promise<HuxiuItem[] | null> {
    try {
      const response = await fetch('https://tophub.today/n/5VaobgvAj1', {
        headers: {
          'User-Agent': Common.chromeUA,
          Referer: 'https://tophub.today/c/tech',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return null

      const html = await response.text()

      const rowRe =
        /<td align="center">(\d+)\.<\/td>\s*<td class="al" align="center"><img src="([^"]+)"[\s\S]*?<td class="al">\s*<div><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/div>\s*<div class="item-desc">([^<]*)<\/div>/g

      const items: HuxiuItem[] = []
      let m: RegExpExecArray | null

      while ((m = rowRe.exec(html)) !== null) {
        items.push({
          rank: Number(m[1]),
          title: m[4].trim(),
          desc: '',
          cover: m[2],
          author: '',
          hot: m[5].trim(),
          comments: 0,
          timestamp: 0,
          link: m[3],
        })
      }

      return items.length > 0 ? items : null
    } catch {
      return null
    }
  }
}

interface HuxiuItem {
  rank: number
  title: string
  desc: string
  cover: string
  author: string
  hot: number | string
  comments: number
  timestamp: number
  link: string
}

interface HuxiuRawItem {
  aid: number
  title: string
  summary?: string
  pic?: string
  score?: number
  comment_count?: number
  dateline: number
  user_info?: { username?: string }
}

interface HuxiuResponse {
  code: number
  msg?: string
  data: HuxiuRawItem[]
}

export const serviceHuxiu = new ServiceHuxiu()
