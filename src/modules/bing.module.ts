import { Common, dayjs } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

interface BingItem {
  title: string
  headline: string
  description: string
  cover: string
  cover_4k: string
  // 竖版派生（必应 th 服务支持任意宽高参数，源图是 UHD 所以足够清晰）：
  // 竖屏手机上用横版图会被 cover 裁得只剩中间一条，必须换成竖版
  cover_portrait?: string
  main_text: string
  copyright: string
  // 壁纸所属日期（YYYY-MM-DD）。往日壁纸用必应给的 startdate，
  // 不能用请求时刻——否则每一张历史图都会显示成「今天」
  date?: string
  update_date: string
  update_date_at: number
}
class ServiceBing {
  #cache = new Map<string, BingItem>()
  // 列表缓存与单张缓存分开存：两者的返回类型不同，混在一个 Map 里
  // 会让每次 get 都要做类型收窄，得不偿失
  #listCache = new Map<string, BingItem[]>()

  handle(): RouterMiddleware<'/bing'> {
    return async (ctx) => {
      const data = await this.#fetch()

      if (!data) {
        ctx.response.status = 500
        ctx.response.body = Common.buildJson(null, 500, '获取数据失败，可能是部署区域无法获取到 CN Bing 的数据')
        return
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = data.cover || ''
          break

        case 'markdown':
          ctx.response.body = `# ${data.title || '必应每日壁纸'}\n\n${data.headline ? `## ${data.headline}\n\n` : ''}${data.description ? `${data.description}\n\n` : ''}![${data.title}](${data.cover})\n\n${data.copyright ? `*${data.copyright}*` : ''}`
          break

        case 'image':
          ctx.response.redirect(data.cover || '')
          break

        case 'image-4k':
          ctx.response.redirect(data.cover_4k || '')
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  // 往日壁纸列表（含今日），供「今日及往期壁纸」幻灯片页使用。
  // 走 HPImageArchive 而不是首页 HTML：首页只含今日一张，而该接口的
  // idx 是起始偏移、n 是条数，idx 有效上限为 7，故最多能回溯约 15 天；
  // 这里固定从 idx=0 取最新 n 张，即「今日 + 往期」连续一段
  handleHistory(): RouterMiddleware<'/bing/history'> {
    return async (ctx) => {
      const raw = Number(ctx.request.url.searchParams.get('n'))
      const n = Math.min(8, Math.max(1, Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 7))

      const list = await this.#fetchList(n)

      if (!list.length) {
        ctx.response.status = 500
        ctx.response.body = Common.buildJson(null, 500, '获取数据失败，可能是部署区域无法获取到 CN Bing 的数据')
        return
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = list.map((e) => e.cover).join('\n')
          break

        case 'markdown':
          ctx.response.body = list
            .map((e) => `## ${e.date || e.title || '必应每日壁纸'}\n\n![${e.title}](${e.cover})\n\n${e.copyright ? `*${e.copyright}*` : ''}`)
            .join('\n\n---\n\n')
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(list)
          break
      }
    }
  }

  getUrl(url: string) {
    const id = (new URL(url).searchParams.get('id') || '').replace(/_\d+x\d+\.jpg$/, '')
    return `https://bing.com/th?id=${id}_1920x1080.jpg`
  }

  // https://cn.bing.com//th?id=OHR.GipuzcoaSummer_ZH-CN1926924422_UHD.jpg
  // https://cn.bing.com/th?id=OHR.GipuzcoaSummer_ZH-CN1926924422_1920x1080.jpg
  get4kUrl(url: string) {
    const id = (new URL(url).searchParams.get('id') || '').replace(/_\d+x\d+\.jpg$/, '')
    return `https://bing.com/th?id=${id}_UHD.jpg`
  }

  async #fetch() {
    const dailyUniqueKey = Common.localeDate()
    const cache = this.#cache.get(dailyUniqueKey)

    if (cache) {
      return cache
    }

    const options = {
      headers: {
        'User-Agent': Common.chromeUA,
        'X-Real-IP': '157.255.219.143',
        'X-Forwarded-For': '157.255.219.143',
      },
    }

    const rawContent = await fetch('https://global.bing.com/?setmkt=zh-cn', options).then((e) => e.text())

    const rawJson = /var\s*_model\s*=\s*([^;]+);/.exec(rawContent)?.[1] || '{}'
    const images = JSON.parse(rawJson)?.MediaContents ?? []

    const now = dayjs()

    if (!images.length) {
      const api = 'https://global.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&setmkt=zh-cn'
      const { images = [] } = await fetch(api, options).then((e) => e.json())
      const image = images[0]
      if (!image) return null

      return {
        title: image.title || '',
        headline: image.title || '',
        description: image.title || '',
        main_text: image.title || '',
        cover: image?.url ? this.getUrl(`https://bing.com${image.url}`) : '',
        cover_4k: image?.url ? this.get4kUrl(`https://bing.com${image.url}`) : '',
        copyright: image.copyright || '',
        update_date: now.format('YYYY-MM-DD HH:mm:ss'),
        update_date_at: now.valueOf(),
      }
    }

    const { ImageContent = {} } = images[0] || {}

    const { Description, Image, Headline, Title, Copyright, QuickFact } = (ImageContent || {}) as {
      Description: string
      Image: {
        Url: string
        Wallpaper: string
        Downloadable: boolean
      }
      Headline: string
      Title: string
      Copyright: string
      SocialGood: null
      MapLink: {
        Url: string
        Link: string
      }
      QuickFact: {
        MainText: string
        LinkUrl: string
        LinkText: string
      }
      TriviaUrl: string
      BackstageUrl: string
      TriviaId: string
    }

    const data = {
      title: Title,
      headline: Headline,
      description: Description,
      main_text: QuickFact?.MainText || '',
      cover: Image?.Wallpaper ? this.getUrl(`https://bing.com${Image.Wallpaper}`) : '',
      cover_4k: Image?.Wallpaper ? this.get4kUrl(`https://bing.com${Image.Wallpaper}`) : '',
      copyright: Copyright,
      update_date: now.format('YYYY-MM-DD HH:mm:ss'),
      update_date_at: now.valueOf(),
    }

    this.#cache.set(dailyUniqueKey, data)

    return data
  }

  // 最近 n 天壁纸（含今日，最新在前）
  async #fetchList(n: number): Promise<BingItem[]> {
    // 缓存键必须带上 n：不同条数的请求落在同一个键上会互相污染，
    // 先请求 n=3 再请求 n=7 就会拿到被截断的那份
    const cacheKey = `${Common.localeDate()}:list:${n}`
    const cache = this.#listCache.get(cacheKey)
    if (cache) return cache

    const options = {
      headers: {
        'User-Agent': Common.chromeUA,
        'X-Real-IP': '157.255.219.143',
        'X-Forwarded-For': '157.255.219.143',
      },
    }

    const api = `https://global.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${n}&setmkt=zh-cn`
    const { images = [] } = (await fetch(api, options).then((e) => e.json())) as {
      images?: Array<{ url?: string; title?: string; copyright?: string; startdate?: string }>
    }

    const list: BingItem[] = images
      .filter((e) => e?.url)
      .map((e) => {
        // startdate 形如 20260907，转成 YYYY-MM-DD 给前端直接显示
        const s = e.startdate || ''
        const date = s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ''
        const now = dayjs()
        const cover = this.getUrl(`https://bing.com${e.url}`)
        return {
          title: e.title || '',
          headline: e.title || '',
          description: e.title || '',
          main_text: '',
          cover,
          cover_4k: this.get4kUrl(`https://bing.com${e.url}`),
          cover_portrait: cover.replace('_1920x1080.jpg', '_1080x1920.jpg'),
          copyright: e.copyright || '',
          date,
          update_date: date ? `${date} 00:00:00` : now.format('YYYY-MM-DD HH:mm:ss'),
          update_date_at: date ? dayjs(date).valueOf() : now.valueOf(),
        }
      })

    if (list.length) this.#listCache.set(cacheKey, list)

    return list
  }
}

export const serviceBing = new ServiceBing()
