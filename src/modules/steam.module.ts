import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceSteam {
  handle(): RouterMiddleware<'/steam'> {
    return async (ctx) => {
      const data = await cached('steam', () => this.#fetch(), { ttl: 10 * 60 * 1000 })

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `Steam 免费游戏\n\n${data
            .map((g, i) => `${i + 1}. ${g.title}\n   原价: ${g.original_price} | 链接: ${g.link}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 🎮 Steam 免费游戏\n\n${data
            .map(
              (g, i) =>
                `### ${i + 1}. [${g.title}](${g.link}) 🔥\n\n![${g.title}](${g.cover})\n\n**原价**: ${g.original_price} | **现价**: 免费\n\n---\n`,
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

  async #fetch(): Promise<SteamGame[]> {
    const url =
      'https://store.steampowered.com/search/results/?query&start=0&count=20&dynamic_data=&sort_by=Price_ASC&maxprice=free&specials=1&infinite=1&cc=us&l=english'

    const response = await fetch(url, {
      headers: {
        'User-Agent': Common.chromeUA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch steam free games: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { success: number; results_html: string; total_count: number }
    if (!body.success || !body.results_html) return []

    return this.#parseHtml(body.results_html)
  }

  #parseHtml(html: string): SteamGame[] {
    const games: SteamGame[] = []

    // 每个游戏是一个 <a> 标签，以 data-ds-appid 开始
    const itemRe =
      /data-ds-appid="(\d+)"[^]*?<span class="title"[^>]*>([^<]+)<\/span>[\s\S]*?<div class="discount_original_price">([^<]*)<\/div>[\s\S]*?<div class="discount_final_price">([^<]*)<\/div>/g

    let m: RegExpExecArray | null
    while ((m = itemRe.exec(html)) !== null) {
      const appid = m[1]
      const title = m[2].trim()
      const originalPrice = m[3].trim()
      const finalPrice = m[4].trim()

      games.push({
        appid,
        title,
        cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
        original_price: originalPrice,
        final_price: finalPrice,
        is_free_now: true,
        link: `https://store.steampowered.com/app/${appid}`,
      })
    }

    return games
  }
}

interface SteamGame {
  appid: string
  title: string
  cover: string
  original_price: string
  final_price: string
  is_free_now: boolean
  link: string
}

export const serviceSteam = new ServiceSteam()
