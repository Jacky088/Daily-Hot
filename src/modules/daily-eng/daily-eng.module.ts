import { Common, renderByEncoding } from '../../common.ts'
import { cached } from '../../cache.ts'
import { fetchUpstream } from '../../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceDailyEng {
  handle(): RouterMiddleware<'/daily-eng'> {
    return async (ctx) => {
      const date = await Common.getParam('date', ctx.request)
      // 必须走 cached：open.iciba.com 对高频访问不友好（裸调曾把出口 IP 打到
      // 连 TLS 都不给回包），而这张卡 auto:1，每次页面打开都会请求一次。
      // 一天一换的句子 1h TTL 足够新鲜；上游断供时 48h 内的旧句兜底，好过 500
      const result = await cached(
        `daily-eng:${date || 'today'}`,
        () => this.#fetch(date),
        { ttl: 60 * 60 * 1000, staleTtl: 48 * 60 * 60 * 1000 },
      )

      renderByEncoding(ctx, {
        text: () => `${result.content}\n${result.note}`,
        markdown: () =>
          `# 📖 每日一句\n\n> ${result.content}\n\n${result.note}\n\n---\n\n*金山词霸 · ${result.dateline}*`,
        json: () => Common.buildJson(result),
      })
    }
  }

  // 金山词霸每日一句开放接口，无需 key；date 留空取当日，格式 YYYY-MM-DD
  async #fetch(date?: string): Promise<DailyEngData> {
    // date 来自 query：编码后 &/? 等分隔符无法再篡改上游的 query 结构
    const url = date
      ? `https://open.iciba.com/dsapi/?date=${encodeURIComponent(date)}`
      : 'https://open.iciba.com/dsapi/'

    const response = await fetchUpstream(url, {
      timeoutMs: 5000,
      retry: 1,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch daily-eng: HTTP ${response.status}`)
    }

    const data = (await response.json()) as IcibaData
    return {
      content: data.content || '',
      note: data.note || '',
      tts: data.tts || '',
      picture: data.picture || '',
      picture2: data.picture2 || '',
      dateline: data.dateline || '',
    }
  }
}

export const serviceDailyEng = new ServiceDailyEng()

interface IcibaData {
  content: string
  note: string
  tts: string
  picture: string
  picture2: string
  dateline: string
}

interface DailyEngData {
  content: string
  note: string
  tts: string
  picture: string
  picture2: string
  dateline: string
}
