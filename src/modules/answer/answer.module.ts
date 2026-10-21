import { Common, renderByEncoding } from '../../common.ts'
import answerData from './answer.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

class ServiceAnswer {
  handle(): RouterMiddleware<'/answer'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      let result: any

      if (id) {
        // 按数据自身的编号（id 字段）查找，与卡片印章 № 保持同一语义；
        // 严格校验正整数，避免 parseInt 把 "abc" 解析成 NaN、"5abc" 宽松解析成 5
        const trimmed = id.trim()
        if (!/^\d+$/.test(trimmed)) {
          ctx.response.status = 400
          ctx.response.body = Common.buildJson(null, 400, '参数 id 必须是正整数')
          return
        }
        result = answerData.find((item) => item.id === trimmed)
        if (!result) {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, `未找到ID为 ${trimmed} 的答案`)
          return
        }
      } else {
        // 随机获取答案（默认行为）
        result = Common.randomItem(answerData)
      }

      renderByEncoding(ctx, {
        text: () => result.answer,
        markdown: () => `# 答案之书\n\n## ${result.answer}\n\n---\n\n*第 ${result.id} 条答案*`,
        json: () =>
          Common.buildJson({
            ...result,
            index: answerData.findIndex((item) => item === result),
          }),
      })
    }
  }
}

export const serviceAnswer = new ServiceAnswer()
