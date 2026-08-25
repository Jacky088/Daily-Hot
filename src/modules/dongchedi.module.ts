import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceDongchedi {
  handle(): RouterMiddleware<'/dongchedi'> {
    return async (ctx) => {
      const list = await cached('dongchedi', () => this.#fetch())

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `懂车帝热搜\n\n${list
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.title}`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 懂车帝热搜\n\n${list
            .slice(0, 20)
            .map((e, i) => `${i + 1}. [${e.title}](${e.url})`)
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(list)
          break
      }
    }
  }

  async #fetch() {
    const api = 'https://www.dongchedi.com/motor/searchpage/launcher/main/v1/?aid=1839&app_name=auto_web_pc'

    const response = await fetch(api, {
      headers: { 'User-Agent': Common.chromeUA },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dongchedi: HTTP ${response.status}`)
    }

    const data = (await response.json()) as DcdResponse

    // 取第一批 hot_search_words（热搜词）
    const hotWords = data?.data?.hot_search_roll_info_v2?.[0]?.hot_search_words || []

    return hotWords.map((word, idx) => ({
      rank: idx + 1,
      title: word.title,
      url: `https://www.dongchedi.com/search?keyword=${encodeURIComponent(word.title)}`,
    }))
  }
}

interface DcdResponse {
  data: {
    hot_search_roll_info_v2: Array<{
      hot_search_words: Array<{
        title: string
        origin: string
        search_mode: string
      }>
    }>
  }
}

export const serviceDongchedi = new ServiceDongchedi()
