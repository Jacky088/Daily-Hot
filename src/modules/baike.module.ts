import { Common } from '../common.ts'
import { fetchUpstreamJson } from '../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceBaike {
  handle(): RouterMiddleware<'/baike'> {
    return async (ctx) => {
      const word = await Common.getParam('word', ctx.request)

      if (!word) {
        return Common.requireArguments('word', ctx.response)
      }

      try {
        const data = await this.#fetch(word)

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
      } catch {
        ctx.response.status = 404
        ctx.response.body = Common.buildJson(null, 404, '未找到相关词条')
      }
    }
  }

  async #fetchRaw(item: string) {
    const api = new URL('https://baike.baidu.com/api/openapi/BaikeLemmaCardApi')

    api.searchParams.set('appid', '379020')
    api.searchParams.set('bk_key', item)

    // 外层 #fetch 已有 3 次调用链，这里 retry: 0 防止重试叠加（3 次 × 3 次 = 9 次最坏请求）
    const data = (await fetchUpstreamJson<BaikeData>(api, { retry: 0 })) as BaikeData

    if (!data?.title) {
      throw new Error('未找到相关词条')
    }

    return data
  }

  async #fetch(item: string) {
    const data = await this.#fetchRaw(item)
      .catch(() => this.#fetchRaw(item))
      .catch(() => this.#fetchRaw(item))

    return {
      title: data.title,
      description: data.desc,
      abstract: data.abstract,
      cover: data.image,
      has_other: !!data.hasOther,
      link: data.url,
    }
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
