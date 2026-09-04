import { Common } from '../common.ts'
// 本地补充的 2025-2026 年疯四文案：与远程 v50 库合并去重，远程不可用时兜底
import kfcExtra from './kfc/kfc-extra.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

class ServiceKfc {
  private lastFetchTime = 0
  private cacheDuration = 1 * 24 * 60 * 60 * 1000 // 缓存 1 天
  private cache: string[] = []

  handle(): RouterMiddleware<'/kfc'> {
    return async (ctx) => {
      const list = await this.#fetch()
      const result = Common.randomItem(list)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = result
          break
        }

        case 'markdown': {
          ctx.response.body = `# 🍗 疯狂星期四文案\n\n${result}\n\n---\n\n*v50 文案第 ${list.findIndex((item: string) => item === result) + 1} 条*`
          break
        }

        case 'json':
        default: {
          ctx.response.body = Common.buildJson({
            index: list.findIndex((item: string) => item === result),
            kfc: result,
          })
          break
        }
      }
    }
  }

  async #fetch() {
    if (this.cache && Date.now() - this.lastFetchTime <= this.cacheDuration) {
      return this.cache
    }

    const response = await Common.tryRepoUrl({
      repo: 'vikiboss/v50',
      path: 'static/v50.json',
      alternatives: [`https://v50.deno.dev/list`],
    })

    // 远程库更新滞后，合并本地补充文案并去重；远程不可用时仅用本地库兜底
    const remote = response ? ((await response.json()) as string[]) : []
    const merged = [...new Set([...(remote || []), ...kfcExtra])]

    if (merged.length > 0) {
      this.cache = merged
      this.lastFetchTime = Date.now()
    }

    return merged
  }
}

export const serviceKfc = new ServiceKfc()
