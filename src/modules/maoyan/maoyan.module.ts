import { Common, dayjs } from '../../common.ts'
import { cached } from '../../cache.ts'
import { fetchBoxOfficeByType } from './encode.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceMaoyan {
  handleAllMovie(): RouterMiddleware<'/maoyan/all/movie'> {
    return async (ctx) => {
      const { list, tips } = await cached('maoyan:history', () => this.fetchHTMLData(), { ttl: 60 * 60 * 1000 })

      const data = {
        list: list
          .toSorted((a, b) => b.rawValue - a.rawValue)
          .map((e, idx) => ({
            rank: idx + 1,
            maoyan_id: e.movieId,
            movie_name: e.movieName,
            release_year: e.releaseTime,
            box_office: e.rawValue,
            box_office_desc: formatBoxOffice(e.rawValue),
          })),
        tip: tips,
        update_time: Common.localeTime(),
        update_time_at: new Date().getTime(),
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `全球电影票房总榜（猫眼）\n\n${data.list
            .map((e) => `${e.rank}. ${e.movie_name} (${e.release_year}) - ${e.box_office_desc}`)
            .slice(0, 20)
            .join('\n')}\n\n${data.tip}`
          break

        case 'markdown':
          ctx.response.body = `# 🎬 全球电影票房总榜\n\n| 排名 | 电影名称 | 上映年份 | 票房 |\n|------|----------|----------|------|\n${data.list
            .slice(0, 20)
            .map((e) => `| ${e.rank} | ${e.movie_name} | ${e.release_year} | ${e.box_office_desc} |`)
            .join(
              '\n',
            )}\n\n${data.tip ? `> ${data.tip}\n\n` : ''}*更新时间: ${data.update_time}*\n\n*数据来源: 猫眼专业版*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  handleRealtime(type: 'movie' | 'tv' | 'web'): RouterMiddleware<'/maoyan/movie'> {
    return async (ctx) => {
      const date = ctx.request.url.searchParams.get('date') || ''
      const data = await cached(`maoyan:${type}:${date}`, () => fetchBoxOfficeByType(type, date), { ttl: 10 * 60 * 1000 })

      switch (ctx.state.encoding) {
        case 'text': {
          switch (type) {
            case 'movie':
            default: {
              ctx.response.body =
                data && data.movie
                  ? `今日实时票房排行 (${dayjs().format('M/D HH:mm')})\n\n${data.movie.list
                      .map((e, idx) => `${idx + 1}. ${e.movie_name} - ${e.box_office_desc}/${e.release_info}`)
                      .slice(0, 20)
                      .join('\n')}\n\n数据来源：猫眼专业版`
                  : '数据异常'
              break
            }

            case 'tv': {
              ctx.response.body =
                data && data.tv
                  ? `今日实时电视收视排行 (${dayjs().format('M/D HH:mm')})\n\n${data.tv.list
                      .map(
                        (e, idx) => `${idx + 1}. ${e.programme_name} - ${e.channel_name}/${e.market_rate.toFixed(2)}%`,
                      )
                      .slice(0, 20)
                      .join('\n')}\n\n数据来源：猫眼专业版`
                  : '数据异常'
              break
            }

            case 'web': {
              ctx.response.body =
                data && data.web
                  ? `今日实时网播热度排行 (${dayjs().format('M/D HH:mm')})\n\n${data.web.list
                      .map((e, idx) => `${idx + 1}. ${e.series_name} - ${e.curr_heat_desc}/${e.release_info}`)
                      .slice(0, 20)
                      .join('\n')}\n\n数据来源：猫眼专业版`
                  : '数据异常'
              break
            }
          }

          break
        }

        case 'markdown': {
          switch (type) {
            case 'movie':
            default: {
              ctx.response.body =
                data && data.movie
                  ? `# 🎬 今日实时票房排行\n\n*更新时间: ${dayjs().format('M/D HH:mm')}*\n\n| 排名 | 电影名称 | 实时票房 | 上映信息 |\n|------|----------|----------|----------|\n${data.movie.list
                      .slice(0, 20)
                      .map((e, idx) => `| ${idx + 1} | ${e.movie_name} | ${e.box_office_desc} | ${e.release_info} |`)
                      .join('\n')}\n\n*数据来源: 猫眼专业版*`
                  : '数据异常'
              break
            }

            case 'tv': {
              ctx.response.body =
                data && data.tv
                  ? `# 📺 今日实时电视收视排行\n\n*更新时间: ${dayjs().format('M/D HH:mm')}*\n\n| 排名 | 节目名称 | 频道 | 收视率 |\n|------|----------|------|--------|\n${data.tv.list
                      .slice(0, 20)
                      .map(
                        (e, idx) =>
                          `| ${idx + 1} | ${e.programme_name} | ${e.channel_name} | ${e.market_rate.toFixed(2)}% |`,
                      )
                      .join('\n')}\n\n*数据来源: 猫眼专业版*`
                  : '数据异常'
              break
            }

            case 'web': {
              ctx.response.body =
                data && data.web
                  ? `# 🌐 今日实时网播热度排行\n\n*更新时间: ${dayjs().format('M/D HH:mm')}*\n\n| 排名 | 剧集名称 | 当前热度 | 上映信息 |\n|------|----------|----------|----------|\n${data.web.list
                      .slice(0, 20)
                      .map((e, idx) => `| ${idx + 1} | ${e.series_name} | ${e.curr_heat_desc} | ${e.release_info} |`)
                      .join('\n')}\n\n*数据来源: 猫眼专业版*`
                  : '数据异常'
              break
            }
          }

          break
        }

        case 'json':
        default: {
          ctx.response.body = data ? Common.buildJson(data[type] ?? {}) : { message: '数据异常' }
          break
        }
      }
    }
  }

  /** 在映电影：猫眼 M 站 ajax，含海报、评分、想看数、排片信息 */
  handleShowing(): RouterMiddleware<'/maoyan/showing'> {
    return async (ctx) => {
      const data = await cached('maoyan:showing', () => this.#fetchMovieList('showing'), { ttl: 60 * 60 * 1000 })

      this.#renderMovieList(ctx, '正在热映电影（猫眼）', data)
    }
  }

  /** 待映电影：同源于 M 站 comingList，按上映日期排序，支持 ?city= 切换城市 */
  handleComing(): RouterMiddleware<'/maoyan/coming'> {
    return async (ctx) => {
      const city = ctx.request.url.searchParams.get('city') || ''
      const data = await cached(`maoyan:coming:${city || 'default'}`, () => this.#fetchMovieList('coming', city), {
        ttl: 60 * 60 * 1000,
      })

      this.#renderMovieList(ctx, '即将上映电影（猫眼）', data)
    }
  }

  #renderMovieList(ctx: any, title: string, list: MovieListItemDTO[]) {
    switch (ctx.state.encoding) {
      case 'text':
        ctx.response.body = `${title}\n\n${list
          .slice(0, 20)
          .map((e, i) => `${i + 1}. ${e.movie_name}（${e.release_date || e.coming_title}）${e.score ? ` - 评分 ${e.score}` : ''}`)
          .join('\n')}`
        break

      case 'markdown':
        ctx.response.body = `# ${title}\n\n${list
          .slice(0, 20)
          .map(
            (e, i) =>
              `### ${i + 1}. [${e.movie_name}](${e.link}) ${e.score ? `\`${e.score}\` ` : ''}${e.coming_title}\n\n${e.star ? `主演：${e.star}\n\n` : ''}${e.cover ? `![${e.movie_name}](${e.cover})\n\n` : ''}---\n`,
          )
          .join('\n')}`
        break

      case 'json':
      default:
        ctx.response.body = Common.buildJson({ list, total: list.length, update_time: Common.localeTime() })
        break
    }
  }

  /**
   * 抓取猫眼 M 站影片列表（免鉴权 ajax，仅需浏览器 UA + Referer）。
   * 注意：待映接口必须携带空的 token 参数，否则上游返回空对象。
   */
  async #fetchMovieList(type: 'showing' | 'coming', city = ''): Promise<MovieListItemDTO[]> {
    const headers = {
      referer: 'https://m.maoyan.com/',
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    }

    const url =
      type === 'showing'
        ? 'https://m.maoyan.com/ajax/movieOnInfoList'
        : `https://m.maoyan.com/ajax/comingList?ci=${city || 1}&token=&limit=20`

    const res = await fetch(url, { headers })
    const json = (await res.json()) as any
    const raw = type === 'showing' ? json?.movieList : json?.coming

    if (!Array.isArray(raw) || !raw.length) throw new Error('猫眼 M 站返回数据异常')

    return raw.map((e: any, idx: number) => {
      const score = Number(e.sc) > 0 ? Number(e.sc).toFixed(1) : ''
      const wish = Number(e.wish) || 0

      return {
        rank: idx + 1,
        maoyan_id: e.id,
        movie_name: e.nm || '',
        cover: e.img || '',
        score,
        score_desc: score ? `${score} 分` : '暂无评分',
        wish,
        wish_desc: wish >= 10000 ? `${(wish / 10000).toFixed(1)} 万` : String(wish),
        release_date: e.rt || '',
        coming_title: e.comingTitle || '',
        show_info: e.showInfo || '',
        star: e.star || '',
        link: `https://m.maoyan.com/movie/${e.id}`,
      } satisfies MovieListItemDTO
    })
  }

  async fetchHTMLData() {
    const headers = {
      referer: 'https://piaofang.maoyan.com/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    }

    const html = await (await fetch('https://piaofang.maoyan.com/i/globalBox/historyRank', { headers })).text()
    const json = /var props = (\{.*?\});/.exec(html)?.[1] || '{}'
    const data = JSON.parse(json)?.data || {}

    return {
      uid: /name="csrf"\s+content="([^"]+)"/.exec(html)?.[1] ?? '',
      uuid: /name="deviceId"\s+content="([^"]+)"/.exec(html)?.[1] ?? '',
      list: (data?.detail?.list || []) as MovieItem[],
      tips: (data?.detail?.tips || '') as string,
    }
  }
}

export const serviceMaoyan = new ServiceMaoyan()

interface MovieItem {
  box: string
  force: boolean
  movieId: number
  movieName: string
  rawValue: number
  releaseTime: string
}

/** M 站在映 / 待映影片列表项（面板卡片直接消费） */
interface MovieListItemDTO {
  rank: number
  maoyan_id: number
  movie_name: string
  cover: string
  score: string
  score_desc: string
  wish: number
  wish_desc: string
  release_date: string
  coming_title: string
  show_info: string
  star: string
  link: string
}

function formatBoxOffice(boxOffice: number | string, decimals: number = 2): string {
  if (typeof decimals !== 'number' || decimals < 0) {
    throw new Error('decimals must be a non-negative number')
  }

  const amount = Number(boxOffice)
  if (Number.isNaN(amount)) throw new Error('Invalid input: boxOffice must be a valid number')

  const UNIT_WAN = 10 ** 4
  const UNIT_YI = 10 ** 8
  const UNIT_WAN_YI = 10 ** 12

  const formatNumber = (num: number): string => num.toFixed(decimals).replace(/\.?0+$/, '')

  if (amount < UNIT_WAN) {
    return `${formatNumber(amount)}元`
  } else if (amount < UNIT_YI) {
    return `${formatNumber(amount / UNIT_WAN)}万元`
  } else if (amount < UNIT_WAN_YI) {
    return `${formatNumber(amount / UNIT_YI)}亿元`
  } else {
    return `${formatNumber(amount / UNIT_WAN_YI)}万亿元`
  }
}
