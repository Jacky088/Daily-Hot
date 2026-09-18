import { Common } from '../common.ts'
import { serviceUapis } from './uapis.module.ts'

import type { RouterMiddleware } from '@oak/oak'

// 虎扑热榜。
// 虎扑自身没有可用的公开接口，站点页面也一直改版，故走 uapis 的聚合源。
// 与 douyin 的兜底不同，这里是**唯一来源**，所以不做二次兜底——拉不到就如实报错。
class ServiceHupu {
  handle(): RouterMiddleware<'/hupu'> {
    return async (ctx) => {
      const data = await serviceUapis.hotboard('hupu')

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `虎扑热榜\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title} (${e.hot_value})`)
            .slice(0, 20)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 虎扑热榜\n\n${data
            .slice(0, 20)
            .map((e, idx) => `${idx + 1}. [${e.title}](${e.link}) \`热度: ${e.hot_value}\``)
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }
}

export const serviceHupu = new ServiceHupu()
