import { Common } from '../../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceDadJoke {
  private lastFetchTime = 0
  private cacheDuration = 60 * 1000 // 缓存 1 分钟，减少重复请求
  private cache: { id: string; joke: string } | null = null

  handle(): RouterMiddleware<'/dad-joke'> {
    return async (ctx) => {
      const result = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = result.joke
          break

        case 'markdown':
          ctx.response.body = `# 🤣 Dad Joke\n\n${result.joke}\n\n---\n\n*icanhazdadjoke.com · ${result.id}*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson({
            id: result.id,
            content: result.joke,
          })
          break
      }
    }
  }

  async #fetch(): Promise<{ id: string; joke: string }> {
    if (this.cache && Date.now() - this.lastFetchTime <= this.cacheDuration) {
      return this.cache
    }

    const response = await fetch('https://icanhazdadjoke.com/', {
      headers: {
        Accept: 'application/json',
        'User-Agent': Common.chromeUA,
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dad-joke: HTTP ${response.status}`)
    }

    const data = (await response.json()) as { id: string; joke: string; status: number }
    this.cache = { id: data.id, joke: data.joke }
    this.lastFetchTime = Date.now()
    return this.cache
  }
}

export const serviceDadJoke = new ServiceDadJoke()
