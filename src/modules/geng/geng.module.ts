import { Common } from '../../common.ts'
import gengData from './geng.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

// year 字段为可选：老条目无年份，近年新增条目标注 year 用于优先展示
type GengItem = { title: string; content: string; year?: number }
const data = gengData as GengItem[]

class ServiceGeng {
  handle(): RouterMiddleware<'/geng'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      let index: number
      let result: GengItem

      if (id) {
        index = parseInt(id)
        if (index >= 0 && index < data.length) {
          result = data[index]
        } else {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, `未找到ID为 ${index} 的梗`)
          return
        }
      } else {
        // 随机抽梗：优先返回最新年份的热梗（80% 概率命中最新年份池），其余在全量库中抽取
        const latestYear = Math.max(...data.map((g) => g.year ?? 0))
        const modern = latestYear
          ? data.map((g, i) => ({ g, i })).filter((x) => x.g.year === latestYear)
          : []
        if (modern.length && Math.random() < 0.8) {
          index = modern[Common.randomInt(0, modern.length - 1)].i
        } else {
          index = Common.randomInt(0, data.length - 1)
        }
        result = data[index]
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `${result.title}：${result.content}`
          break

        case 'markdown':
          ctx.response.body = `# 🎭 ${result.title}\n\n${result.content}\n\n---\n\n*${result.year ? `${result.year} 年热梗 · ` : ''}第 ${index + 1} 个梗*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson({
            index,
            year: result.year ?? null,
            title: result.title,
            content: result.content,
          })
          break
      }
    }
  }
}

export const serviceGeng = new ServiceGeng()
