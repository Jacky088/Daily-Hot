import { Common } from '../../common.ts'
import gengData from './geng.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

class ServiceGeng {
  handle(): RouterMiddleware<'/geng'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      let index: number
      let result: { title: string; content: string }

      if (id) {
        index = parseInt(id)
        if (index >= 0 && index < gengData.length) {
          result = gengData[index]
        } else {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, `未找到ID为 ${index} 的梗`)
          return
        }
      } else {
        index = Common.randomInt(0, gengData.length - 1)
        result = gengData[index]
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `${result.title}：${result.content}`
          break

        case 'markdown':
          ctx.response.body = `# 🎭 ${result.title}\n\n${result.content}\n\n---\n\n*第 ${index + 1} 个梗*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson({
            index,
            title: result.title,
            content: result.content,
          })
          break
      }
    }
  }
}

export const serviceGeng = new ServiceGeng()
