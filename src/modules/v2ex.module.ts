import { Common } from '../common.ts'
import { serviceUapis } from './uapis.module.ts'

import type { RouterMiddleware } from '@oak/oak'

/**
 * V2EX 热帖。
 *
 * 官方接口（https://www.v2ex.com/api/topics/hot.json）已不可用：整站现在挂在
 * Cloudflare 的 JS 挑战后面，任何非浏览器客户端拿到的都是 403 + "Just a moment..."
 * 中间页（本机直连、换 UA、换 IP 实测均如此），服务端无法通过；官方推荐的 API v2
 * 又要求每个部署方自备 Token，不适合开箱即用。
 *
 * 因此这里与虎扑同策：走 uapis 聚合源，且它**是唯一来源**，不做二次兜底——
 * 拉不到就如实报错，让缓存层的 stale 兜底与前端重试按钮接住。
 *
 * 字段损失如实说明：聚合源只给 标题 / 链接 / 作者，没有节点名与回复数，
 * 所以 node 固定为空串、replies 固定为 0；前端卡片改用 author 作副标题
 * （见 public/app.js 里 v2ex 的 f.d 配置），输出文案也会跳过这些空字段。
 */
interface V2exItem {
  rank: number
  title: string
  link: string
  author: string
  node: string
  replies: number
  created: string
  created_at: number
}

class ServiceV2ex {
  handle(): RouterMiddleware<'/v2ex'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `V2EX 热帖\n\n${data
            .map((e) => {
              const meta = [e.node && `[${e.node}]`, e.replies && `${e.replies} 回复`, e.author && `@${e.author}`]
                .filter(Boolean)
                .join(' ')
              return `${e.rank}. ${e.title}${meta ? ` ${meta}` : ''}`
            })
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 💻 V2EX 热帖\n\n${data
            .map((e) => {
              const meta = [`@${e.author}`, e.node && `\`${e.node}\``, e.replies && `💬 ${e.replies} 回复`, e.created]
                .filter(Boolean)
                .join(' · ')
              return `### ${e.rank}. [${e.title}](${e.link})\n\n${meta}\n\n---\n`
            })
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<V2exItem[]> {
    // uapis 侧已自带 5 分钟缓存（见 uapis.module.ts），这里不必再套一层
    const list = await serviceUapis.hotboard('v2ex')

    return list.map((e, i) => ({
      rank: i + 1,
      title: e.title,
      link: e.link,
      author: e.author,
      // 中转源没有这两个字段：留空而不是拿别的东西顶替，接口语义才不会说谎
      node: '',
      replies: 0,
      created: '',
      created_at: 0,
    }))
  }
}

export const serviceV2ex = new ServiceV2ex()
