import { Common, dayjs, TZ_SHANGHAI } from '../common.ts'
import { SolarDay } from 'tyme4ts'
import { resolveForceUpdate } from '../force-update-guard.ts'

import type { RouterMiddleware } from '@oak/oak'
import { config } from '../config.ts'

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']

function getDayOfWeek(date?: string) {
  const day = date ? new Date(date) : new Date()
  return `星期${WEEK_DAYS[day.getDay()]}`
}

class Service60s {
  #cache = new Map<string, DailyNewsItem>()

  handle(): RouterMiddleware<'/60s'> {
    return async (ctx) => {
      const data = await this.#fetch(ctx.request.url.searchParams.get('date'), resolveForceUpdate(ctx.request))

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `每天 60s 读懂世界（${data.date}）\n\n${data.news
            .map((e, idx) => `${idx + 1}. ${e}`)
            .join('\n')}\n\n${data.tip ? `【微语】${data.tip}` : ''}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 每天 60s 读懂世界\n\n> ${data.date} ${data.day_of_week} ${data.lunar_date}\n\n${data.news
            .map((e, idx) => {
              const newsItem = typeof e === 'string' ? { title: e, link: '' } : e
              return newsItem.link
                ? `${idx + 1}. [${newsItem.title}](${newsItem.link})`
                : `${idx + 1}. ${newsItem.title}`
            })
            .join(
              '\n',
            )}\n\n${data.tip ? `---\n\n**【微语】** *${data.tip}*` : ''}${data.image ? `\n\n![每天 60s 读懂世界](${data.image})` : ''}`
          break
        }

        case 'image': {
          // test image url
          const response = await fetch(data.image, { method: 'HEAD' })
          ctx.response.redirect(response.ok ? data.image : `https://60s-static.viki.moe/images/${data.date}.png`)
          break
        }

        case 'image-proxy': {
          let response: Response | null = await fetch(data.image)

          if (!response.ok) {
            response = await Common.tryRepoUrl({
              repo: 'vikiboss/60s-static-host',
              path: `static/images/${data.date}.png`,
              alternatives: [`https://60s-static.viki.moe/images/${data.date}.png`],
            })
          }

          if (response) {
            ctx.response.headers = response.headers
            ctx.response.body = response.body
            ctx.response.type = response.type
            ctx.response.status = response.status
          } else {
            ctx.response.status = 404
            ctx.response.body = 'Image not found'
          }

          break
        }

        case 'json':
        default: {
          ctx.response.body = Common.buildJson(data)
          break
        }
      }
    }
  }

  async tryUrl(date: string) {
    const response = await Common.tryRepoUrl({
      repo: 'vikiboss/60s-static-host',
      path: `static/60s/${date}.json`,
      alternatives: [
        `https://60s-static.viki.moe/60s/${date}.json`,
        `https://60s-static-host.vercel.app/60s/${date}.json`,
      ],
    })

    if (!response || !response.ok) return null

    let data: any

    if (config.debug) {
      data = await response.text()
      Common.debug(`60s data text: ${data}`)
      data = JSON.parse(data)
    } else {
      data = await response.json()
    }

    if (!data?.news?.length) return null

    // 农历必须按数据日期计算：请求历史日期（?date=2026-01-01）时不能返回当天的农历
    const target = dayjs(data.date).tz(TZ_SHANGHAI)
    const lunarDate = target.isValid()
      ? SolarDay.fromYmd(target.year(), target.month() + 1, target.date())
          .getLunarDay()
          .toString()
          .replace('农历', '')
      : ''

    return {
      ...data,
      day_of_week: getDayOfWeek(data.date),
      lunar_date: lunarDate,
      api_updated: Common.localeTime(),
      api_updated_at: Date.now(),
    } satisfies DailyNewsItem
  }

  async #fetch(date?: string | null, forceUpdate = false): Promise<DailyNewsItem> {
    const today = date || Common.localeDate(Date.now()).replace(/\//g, '-')
    const yesterday = Common.localeDate(Date.now() - 24 * 60 * 60 * 1000).replace(/\//g, '-')
    const theDayBeforeYesterday = Common.localeDate(Date.now() - 2 * 24 * 60 * 60 * 1000).replace(/\//g, '-')

    for (const date of [today, yesterday, theDayBeforeYesterday]) {
      const cache = this.#cache.get(date)
      if (cache && !forceUpdate) return cache

      const data = await this.tryUrl(date)

      if (data) {
        this.#cache.set(date, data)
        return data
      }
    }

    throw new Error('Failed to fetch 60s data, please try again later.')
  }
}

export const service60s = new Service60s()

interface DailyNewsItem {
  date: string
  news: {
    title: string
    link: string
  }[]
  cover: string
  tip: string
  image: string
  link: string
  day_of_week: string
  lunar_date: string
  updated: string
  updated_at: number
  api_updated: string
  api_updated_at: number
}
