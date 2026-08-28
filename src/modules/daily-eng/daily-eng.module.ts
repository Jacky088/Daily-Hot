import { Common } from '../../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceDailyEng {
  handle(): RouterMiddleware<'/daily-eng'> {
    return async (ctx) => {
      const date = await Common.getParam('date', ctx.request)
      const result = await this.#fetch(date)

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `${result.content}\n${result.note}`
          break

        case 'markdown':
          ctx.response.body = `# 📖 每日一句\n\n> ${result.content}\n\n${result.note}\n\n---\n\n*金山词霸 · ${result.dateline}*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(result)
          break
      }
    }
  }

  // 金山词霸每日一句开放接口，无需 key；date 留空取当日，格式 YYYY-MM-DD
  async #fetch(date?: string): Promise<DailyEngData> {
    const url = date ? `https://open.iciba.com/dsapi/?date=${date}` : 'https://open.iciba.com/dsapi/'

    const response = await fetch(url, {
      headers: { 'User-Agent': Common.chromeUA },
      signal: AbortSignal.timeout(5000),
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
