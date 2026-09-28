import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { fetchUpstreamJson } from '../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

/**
 * 上游明确返回「没有这个词条」。与网络故障区分开：
 * 前者对调用方就是 404，后者要走 500 + 缓存 stale 兜底，不能混为一谈。
 */
class BaikeNotFoundError extends Error {}

class ServiceBaike {
  handle(): RouterMiddleware<'/baike'> {
    return async (ctx) => {
      const word = await Common.getParam('word', ctx.request)

      if (!word) {
        return Common.requireArguments('word', ctx.response)
      }

      try {
        // 词条内容按词缓存（键经 md5 收敛）：词条基本不变，同一词高频查询不该反复打上游
        const data = await cached(`baike:${Common.md5(word)}`, () => this.#fetch(word), {
          ttl: 30 * 60 * 1000,
          cacheIf: (d) => !!d.title,
        })

        switch (ctx.state.encoding) {
          case 'text':
            ctx.response.body = `${data.title}: ${data.abstract} (详情: ${data.link})`
            break

          case 'markdown':
            ctx.response.body = `# 📖 ${data.title}\n\n${data.description ? `> ${data.description}\n\n` : ''}${data.cover ? `![${data.title}](${data.cover})\n\n` : ''}## 摘要\n\n${data.abstract}\n\n${data.has_other ? '**注**: 该词条有其他义项\n\n' : ''}[查看完整词条](${data.link})`
            break

          case 'json':
          default:
            ctx.response.body = Common.buildJson(data)
            break
        }
      } catch (e) {
        if (e instanceof BaikeNotFoundError) {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, '未找到相关词条')
          return
        }
        // 网络故障不再混同为 404「未找到」：缓存层 stale 兜底失败后走到这里，
        // 如实报 500，原始原因只进服务端日志
        console.error('[baike]', e)
        ctx.response.status = 500
        ctx.response.body = Common.buildJson(null, 500, '百科服务暂时不可用，请稍后重试')
      }
    }
  }

  async #fetchRaw(item: string) {
    const api = new URL('https://baike.baidu.com/api/openapi/BaikeLemmaCardApi')

    api.searchParams.set('appid', '379020')
    api.searchParams.set('bk_key', item)

    // 外层 #fetch 已有重试链，这里 retry: 0 防止重试叠加
    const data = await fetchUpstreamJson<BaikeData>(api, { retry: 0 })

    if (!data?.title) {
      // 上游正常响应但没有词条：这是确定性结果，重试也不会变出来
      throw new BaikeNotFoundError('未找到相关词条')
    }

    return data
  }

  async #fetch(item: string) {
    // 重试只给网络故障；上游明确说没有词条（BaikeNotFoundError）重试没有意义
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await this.#fetchRaw(item)
        return {
          title: data.title,
          description: data.desc,
          abstract: data.abstract,
          cover: data.image,
          has_other: !!data.hasOther,
          link: data.url,
        }
      } catch (e) {
        lastError = e
        if (e instanceof BaikeNotFoundError) throw e
      }
    }
    throw lastError
  }
}

export const serviceBaike = new ServiceBaike()

interface BaikeData {
  id: number
  subLemmaId: number
  newLemmaId: number
  key: string
  desc: string
  title: string
  card: Array<{
    key: string
    name: string
    value: string[]
    format: string[]
  }>
  image: string
  src: string
  imageHeight: number
  imageWidth: number
  isSummaryPic: string
  abstract: string
  moduleIds: number[]
  url: string
  wapUrl: string
  hasOther: number
  totalUrl: string
  catalog: string[]
  wapCatalog: string[]
  logo: string
  copyrights: string
  customImg: string
  redirect: any[]
}
