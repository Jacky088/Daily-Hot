import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceBaidu {
  handleHotSearch(): RouterMiddleware<'/baidu/hot'> {
    return async (ctx) => {
      const data = await cached('baidu:hot', () => this.#fetchRealtimeHot())

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `百度实时热搜\n\n${data
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.title} (${e.score_desc})`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 百度实时热搜\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.url}) ${e.type_desc ? `\`${e.type_desc}\`` : ''} \`${e.score_desc}\`\n\n${e.desc ? `${e.desc}\n\n` : ''}${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}---\n`,
            )
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  handleTeleplay(): RouterMiddleware<'/baidu/teleplay'> {
    return async (ctx) => {
      const data = await cached('baidu:teleplay', () => this.#fetchBoard('teleplay'))

      this.#renderBoard(ctx, '百度电视剧榜单', data)
    }
  }

  handleMovie(): RouterMiddleware<'/baidu/movie'> {
    return async (ctx) => {
      const data = await cached('baidu:movie', () => this.#fetchBoard('movie'))

      this.#renderBoard(ctx, '百度电影榜单', data)
    }
  }

  #renderBoard(ctx: any, title: string, data: BoardItemDTO[]) {
    switch (ctx.state.encoding) {
      case 'text':
        ctx.response.body = `${title}\n\n${data
          .slice(0, 20)
          .map((e, i) => `${i + 1}. ${e.title} (${e.score_desc})${e.genre ? ` [${e.genre}]` : ''}${e.actors ? ` 主演:${e.actors}` : ''}`)
          .join('\n')}`
        break

      case 'markdown':
        ctx.response.body = `# ${title}\n\n${data
          .slice(0, 20)
          .map(
            (e, i) =>
              `### ${i + 1}. [${e.title}](${e.url}) \`${e.score_desc}\`\n\n${e.genre ? `类型：${e.genre}\n\n` : ''}${e.actors ? `演员：${e.actors}\n\n` : ''}${e.desc ? `${e.desc}\n\n` : ''}${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}---\n`,
          )
          .join('\n')}`
        break

      case 'json':
      default:
        ctx.response.body = Common.buildJson(data)
        break
    }
  }

  handleTieba(): RouterMiddleware<'/baidu/tieba'> {
    return async (ctx) => {
      const data = await cached('baidu:tieba', () => this.#fetchTieba())

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `百度贴吧热门话题\n\n${data
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.title} (${e.score_desc})`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 百度贴吧热门话题\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. [${e.title}](${e.url}) \`讨论: ${e.score_desc}\`\n\n${e.desc ? `**话题描述**: ${e.desc}\n\n` : ''}${e.abstract ? `${e.abstract}\n\n` : ''}${e.avatar ? `![${e.title}](${e.avatar})\n\n` : ''}---\n`,
            )
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  #normalizeHtml(html: string) {
    return html.replace(/\\-/g, '-')
  }

  #formatScore(score: string) {
    const num = Number.parseInt(score, 10)
    if (num >= 10000) return `${Math.round(num / 100) / 100}w`
    return score
  }

  async #fetchRealtimeHot() {
    const options = { headers: { 'User-Agent': Common.chromeUA } }
    const response = await fetch('https://top.baidu.com/board?tab=realtime', options)
    const rawHtml = await response.text()
    const matchResult = rawHtml.match(/<!--s-data:(.*?)-->/s)
    const data: RealtimeItem[] =
      JSON.parse(this.#normalizeHtml(matchResult?.[1] || '{}'))?.data?.cards?.[0]?.content || []

    const hotTagMap: Record<string, string | null> = {
      '0': null,
      '1': '新',
      '3': '热',
    }

    return data
      .filter((e) => !e.isTop)
      .map((e) => ({
        rank: e.index + 1,
        title: e.word,
        desc: e.desc,
        score: e.hotScore,
        score_desc: this.#formatScore(e.hotScore),
        cover: e.img || null,
        type: e.hotTag,
        type_desc: hotTagMap[e.hotTag] || null,
        type_icon: e.hotTagImg || null,
        url: e.url.startsWith('http') ? e.url : `https://www.baidu.com${e.url}`,
      }))
  }

  /** 电视剧榜 / 电影榜共用：抓取百度热搜对应 tab，并把 show 标签拆为类型 / 演员等结构化字段 */
  async #fetchBoard(tab: 'teleplay' | 'movie'): Promise<BoardItemDTO[]> {
    const options = { headers: { 'User-Agent': Common.chromeUA } }
    const response = await fetch(`https://top.baidu.com/board?tab=${tab}`, options)
    const rawHtml = await response.text()
    const matchResult = rawHtml.match(/<!--s-data:(.*?)-->/s)
    const data: BoardItem[] =
      JSON.parse(this.#normalizeHtml(matchResult?.[1] || '{}'))?.data?.cards?.[0]?.content || []

    return data.map((e) => {
      const show: Record<string, string> = {}
      for (const item of e.show || []) {
        const i = item.indexOf('：')
        if (i > 0) show[item.slice(0, i).trim()] = item.slice(i + 1).trim()
      }

      return {
        rank: e.index + 1,
        title: e.word,
        desc: e.desc,
        score: e.hotScore,
        score_desc: this.#formatScore(e.hotScore),
        cover: e.img || null,
        url: e.url.startsWith('http') ? e.url : `https://www.baidu.com${e.url}`,
        genre: show['类型'] || '',
        actors: show['演员'] || show['主演'] || '',
        director: show['导演'] || '',
        region: show['地区'] || show['国家'] || '',
        show_raw: e.show || [],
      }
    })
  }

  async #fetchTieba() {
    const options = { headers: { 'User-Agent': Common.chromeUA } }
    const response = await fetch('https://tieba.baidu.com/hottopic/browse/topicList', options)
    const data = await response.json()

    return ((data?.data?.bang_topic?.topic_list || []) as TiebaItem[]).map((e, i) => ({
      rank: i + 1,
      title: e.topic_name,
      desc: e.topic_desc,
      abstract: e.abstract,
      score: e.discuss_num || 0,
      score_desc: this.#formatScore(String(e.discuss_num || 0)),
      avatar: e.topic_avatar || e.topic_default_avatar || null,
      url: e.topic_url,
    }))
  }
}

export const serviceBaidu = new ServiceBaidu()

interface RealtimeItem {
  appUrl: string
  desc: string
  hotChange: string
  hotScore: string
  hotTag: string
  img: string
  index: number
  indexUrl: string
  query: string
  rawUrl: string
  show: any[]
  url: string
  word: string
  isTop?: boolean
  hotTagImg?: string
}

interface TeleplayItem {
  appUrl: string
  desc: string
  hotChange: string
  hotScore: string
  img: string
  index: number
  indexUrl: string
  query: string
  rawUrl: string
  show: string[]
  url: string
  word: string
}

/** 电视剧榜 / 电影榜共用原始条目（结构同 TeleplayItem） */
type BoardItem = TeleplayItem

/** 面板卡片消费的榜单条目（show 标签已结构化） */
interface BoardItemDTO {
  rank: number
  title: string
  desc: string
  score: string
  score_desc: string
  cover: string | null
  url: string
  genre: string
  actors: string
  director: string
  region: string
  show_raw: string[]
}

interface TiebaItem {
  topic_id: number
  topic_name: string
  topic_desc: string
  abstract: string
  topic_pic: string
  tag: number
  discuss_num: number
  idx_num: number
  create_time: number
  content_num: number
  topic_avatar: string
  is_video_topic: string
  topic_url: string
  topic_default_avatar: string
}
