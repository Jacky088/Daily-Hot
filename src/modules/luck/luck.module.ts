import { Common, renderByEncoding } from '../../common.ts'
import luckData from './luck.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

class ServiceLuck {
  handle(): RouterMiddleware<'/luck'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      // 两个分支组装的是同一形状的展示对象
      let result: { luck_desc: string; luck_rank: number; luck_tip: string; luck_tip_index: number }

      if (id) {
        // 获取指定ID的运势
        const index = Common.parseId(id)
        if (index == null) {
          ctx.response.status = 400
          ctx.response.body = Common.buildJson(null, 400, '参数 id 必须是非负整数')
          return
        }
        if (index < luckData.length) {
          const luck = luckData[index]
          const tip = Common.randomItem(luck.content)
          const tip_index = luck.content.indexOf(tip)
          result = {
            luck_desc: luck['good-luck'],
            luck_rank: luck.rank,
            luck_tip: tip,
            luck_tip_index: tip_index,
          }
        } else {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, `未找到ID为 ${index} 的运势`)
          return
        }
      } else {
        // 随机获取运势（默认行为）
        const luck = Common.randomItem(luckData)
        const tip = Common.randomItem(luck.content)
        const tip_index = luck.content.indexOf(tip)
        result = {
          luck_desc: luck['good-luck'],
          luck_rank: luck.rank,
          luck_tip: tip,
          luck_tip_index: tip_index,
        }
      }

      renderByEncoding(ctx, {
        text: () => `${result.luck_desc}: ${result.luck_tip}`,
        markdown: () =>
          `# 🍀 今日运势\n\n## ${result.luck_desc}\n\n> ${result.luck_tip}\n\n**运势等级**: ${result.luck_rank}/10`,
        json: () => Common.buildJson(result),
      })
    }
  }
}

export const serviceLuck = new ServiceLuck()
