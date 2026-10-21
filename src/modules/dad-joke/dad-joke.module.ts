import { Common, renderByEncoding } from '../../common.ts'
import { fetchUpstream } from '../../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceDadJoke {
  handle(): RouterMiddleware<'/dad-joke'> {
    return async (ctx) => {
      const result = await this.#fetch()

      renderByEncoding(ctx, {
        text: () => result.joke,
        markdown: () => `# 🤣 Dad Joke\n\n${result.joke}\n\n---\n\n*icanhazdadjoke.com · ${result.id}*`,
        json: () =>
          Common.buildJson({
            id: result.id,
            content: result.joke,
          }),
      })
    }
  }

  async #fetch(): Promise<{ id: string; joke: string }> {
    const response = await fetchUpstream('https://icanhazdadjoke.com/', {
      headers: {
        Accept: 'application/json',
      },
      timeoutMs: 5000,
      retry: 1,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch dad-joke: HTTP ${response.status}`)
    }

    const data = (await response.json()) as { id: string; joke: string; status: number }
    return { id: data.id, joke: data.joke }
  }
}

export const serviceDadJoke = new ServiceDadJoke()
