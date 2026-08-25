import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceBili {
  handle(): RouterMiddleware<'/bili'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `B站实时热搜\n\n${data
            .map((e, i) => `${i + 1}. ${e.title}`)
            .slice(0, 20)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# B站实时热搜\n\n${data
            .slice(0, 20)
            .map((e, i) => `${i + 1}. [${e.title}](${e.link})`)
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  // 内存缓存最近一次成功结果（Workers 跨 isolate 不共享，作快速路径）
  #cache: { list: { title: string; link: string }[]; at: number } | null = null

  async #fetch() {
    // 5 分钟内的内存缓存直接返回（热搜数据时效性足够）
    if (this.#cache && Date.now() - this.#cache.at < 5 * 60 * 1000) {
      return this.#cache.list
    }

    const fresh = await this.#fetchFresh()
    if (fresh.length > 0) {
      this.#cache = { list: fresh, at: Date.now() }
      this.#saveCache(fresh)
      return fresh
    }

    // 数据源全部失败：30 分钟内返回近期缓存（内存 → Cache API 持久层）
    if (this.#cache && Date.now() - this.#cache.at < 30 * 60 * 1000) {
      return this.#cache.list
    }

    const persisted = await this.#loadCache()
    if (persisted?.length) return persisted

    return []
  }

  // Workers Cache API 持久缓存（跨 isolate/请求存活；Node/Deno 环境自动跳过）
  #cacheKey = 'https://cache.60s.local/bili'

  async #saveCache(list: { title: string; link: string }[]) {
    try {
      if (typeof caches === 'undefined') return
      const cache = (caches as any).default as Cache
      await cache.put(this.#cacheKey, new Response(JSON.stringify({ list, at: Date.now() })))
    } catch {}
  }

  async #loadCache() {
    try {
      if (typeof caches === 'undefined') return null
      const cache = (caches as any).default as Cache
      const matched = await cache.match(this.#cacheKey)
      if (!matched) return null
      const { list, at } = (await matched.json()) as { list: { title: string; link: string }[]; at: number }
      if (Date.now() - at < 30 * 60 * 1000) return list
      return null
    } catch {
      return null
    }
  }

  async #fetchFresh() {
    const options = {
      headers: {
        'User-Agent': Common.chromeUA,
      },
    }

    const toListItem = (item: Item) => ({
      title: item.keyword || item.show_name,
      link: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword)}`,
    })

    // 直连（国内 IP 可用；Workers 等海外 IP 会被 B站风控 412 拦截返回 HTML）
    try {
      const api = 'https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50'
      const { data = {} } = await (await fetch(api, options)).json()
      const list = (data?.trending?.list || []) as Item[]
      if (list.length > 0) return list.map(toListItem)
    } catch {}

    // RSSHub 镜像兜底（海外环境直连被拦时；镜像冷缓存回源较慢，超时放宽到 12s）
    try {
      const rss = await (
        await fetch('https://rsshub.woodland.cafe/bilibili/hot-search', {
          ...options,
          signal: AbortSignal.timeout(12000),
        })
      ).text()
      const list = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .map(([_, block]) => ({
          title: this.#unescapeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''),
          link: this.#unescapeXml((block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim()),
        }))
        .filter((e) => e.title)
      if (list.length > 0) return list
    } catch {}

    // app 接口直连兜底
    try {
      const api = 'https://app.bilibili.com/x/v2/search/trending/ranking?limit=50'
      const { data = {} } = await (await fetch(api, options)).json()
      return ((data?.list?.filter((e: any) => +e?.is_commercial === 0) || []) as Item[]).map(toListItem)
    } catch {}

    return []
  }

  #unescapeXml(str: string) {
    return str
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
  }
}

export const serviceBili = new ServiceBili()

interface Item {
  icon?: string
  hot_id: number
  keyword: string
  position: number
  show_name: string
  word_type: number
  is_commercial: string
}
