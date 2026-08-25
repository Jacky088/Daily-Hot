import crypto from 'node:crypto'
import dayjs from 'dayjs'
import bcrypt from 'bcryptjs'
import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { Buffer } from 'node:buffer'

import type { RouterMiddleware } from '@oak/oak'

interface CoolApkRawItem {
  id: number
  hash: string
  title: string
  logo: string
  cover: string
  description: string
  commentnum: number
  follownum: number
  hot_num: number
  dateline: number
  lastupdate: number
  bind_goods_id: number
  star_average_score: string
  star_total_count: number
  allow_rate: number
  open_rate: number
  is_search_show: number
  release_time: string
  url: string
  entityType: string
  entityId: number
  follownum_txt: string
  commentnum_txt: string
  hot_num_txt: string
  rating_average_score: string
  rating_total_num: number
  allow_rate_sdk?: string
  allow_rate_device?: string
  allow_rate_os?: string
  allow_publish_scope: number
}

interface CoolApkRawResponse {
  data: CoolApkRawItem[]
}

interface KuanTopicItem {
  id: number
  title: string
  description: string
  logo: string
  cover: string
  url: string
  followers: number
  comments: number
  hotness: number
  rating: {
    score: number
    total: number
  }
  created: string
  created_at: number
  updated: string
  updated_at: number
}

interface KuanApiResponse {
  topics: KuanTopicItem[]
  total: number
  updated: string
  updated_at: number
}

const md5hex = (str: string) => crypto.createHash('md5').update(str).digest('hex')

/**
 * 生成酷安 API 请求所需的 X-App-Device 与 X-App-Token（v2 算法）
 * 算法参考 https://github.com/XiaoMengXinX/FuckCoolapkTokenV2 与 Obtainium 的 coolapk 实现
 */
function generateAppAuth(): { deviceCode: string; token: string } {
  const aid = crypto.randomBytes(16).toString('hex').toUpperCase()
  const mac = Array.from(crypto.randomBytes(6), (b) => b.toString(16).padStart(2, '0')).join(':')

  const deviceCode = Buffer.from(`${aid}; ; ; ${mac}; Google; Google; Pixel 5a; SQ1D.220105.007`).toString('base64')

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const base64Timestamp = Buffer.from(timestamp).toString('base64')
  const md5Timestamp = md5hex(timestamp)
  const md5DeviceCode = md5hex(deviceCode)

  const rawToken = `token://com.coolapk.market/dcf01e569c1e3db93a3d0fcf191a622c?${md5Timestamp}$${md5DeviceCode}&com.coolapk.market`
  const base64Token = Buffer.from(rawToken).toString('base64')
  const md5Base64Token = md5hex(base64Token)
  const md5Token = md5hex(rawToken)

  const bcryptSalt = `$2a$10$${base64Timestamp.substring(0, 14)}/${md5Token.substring(0, 6)}u`
  const bcryptResult = bcrypt.hashSync(md5Base64Token, bcryptSalt)
  const token = 'v2' + Buffer.from(bcryptResult.replace(/^\$2a/, '$2y')).toString('base64')

  return { deviceCode, token }
}

class ServiceKuan {
  handle(): RouterMiddleware<'/kuan'> {
    return async (ctx) => {
      const data = await cached('kuan', () => this.#fetch())

      switch (ctx.state.encoding) {
        case 'text': {
          const items = data.topics.map((item, idx) => `${idx + 1}. ${item.title}`).join('\n')
          ctx.response.body = `酷安热门话题n\n${items}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 📱 酷安热门话题\n\n${data.topics
            .slice(0, 20)
            .map(
              (item, idx) =>
                `### ${idx + 1}. [${item.title}](${item.url})\n\n${item.description ? `${item.description}\n\n` : ''}${item.cover ? `![${item.title}](${item.cover})\n\n` : ''}📊 **热度**: ${item.hotness} | 👥 **关注**: ${item.followers} | 💬 **评论**: ${item.comments} | ⭐ **评分**: ${item.rating.score} (${item.rating.total}人)\n\n---`,
            )
            .join('\n\n')}\n\n*更新时间: ${data.updated}*`
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

  async #fetch(): Promise<KuanApiResponse> {
    const url = 'https://api.coolapk.com/v6/page/dataList?url=%23%2Ftopic%2FtagList'

    const { deviceCode, token } = generateAppAuth()

    const headers = {
      'User-Agent':
        'Dalvik/2.1.0 (Linux; U; Android 9; MI 8 SE MIUI/9.5.9) (#Build; Xiaomi; MI 8 SE; PKQ1.181121.001; 9) +CoolMarket/12.4.2-2208241-universal',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Sdk-Int': '30',
      'X-Sdk-Locale': 'zh-CN',
      'X-App-Id': 'com.coolapk.market',
      'X-App-Token': token,
      'X-App-Version': '12.4.2',
      'X-App-Code': '2208241',
      'X-Api-Version': '12',
      'X-Api-Supported': '2208241',
      'X-App-Mode': 'universal',
      'X-App-Channel': 'coolapk',
      'X-App-Device': deviceCode,
      'X-Dark-Mode': '0',
    }

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })

    if (!response.ok) {
      const res = await response.text()
      throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}, response: ${res}`)
    }

    const rawData: CoolApkRawResponse = await response.json()

    if (!rawData.data || !Array.isArray(rawData.data)) {
      throw new Error(`Invalid response format from CoolApk API: ${JSON.stringify(rawData)}`)
    }

    const transformedData: KuanApiResponse = {
      topics: rawData.data.map(this.#transformItem),
      total: rawData.data.length,
      updated: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      updated_at: Date.now(),
    }

    return transformedData
  }

  #transformItem(item: CoolApkRawItem): KuanTopicItem {
    return {
      id: item.id,
      title: item.title,
      description: item.description || '',
      logo: item.logo,
      cover: item.cover || '',
      url: `https://www.coolapk.com${item.url}`,
      followers: item.follownum,
      comments: item.commentnum,
      hotness: item.hot_num,
      rating: {
        score: parseFloat(item.star_average_score) || 0,
        total: item.star_total_count,
      },
      created: dayjs(item.dateline * 1000).format('YYYY-MM-DD HH:mm:ss'),
      created_at: item.dateline * 1000,
      updated: dayjs(item.lastupdate * 1000).format('YYYY-MM-DD HH:mm:ss'),
      updated_at: item.lastupdate * 1000,
    }
  }
}

export const serviceKuan = new ServiceKuan()
