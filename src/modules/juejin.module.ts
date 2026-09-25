import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { fetchUpstream } from '../fetch-upstream.ts'

import type { RouterMiddleware } from '@oak/oak'

// 稀土掘金热榜：官方内容 API，免鉴权、直接返回 JSON（无需 HTML 解析，属于最稳的一类上游）。
// ⚠️ category_id 必须用「长 ID」：短 ID 1~8 里只有 1 能取到数据，其余实测一律返回空数组
const JUEJIN_API = 'https://api.juejin.cn/content_api/v1/content/article_rank'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

const JUJIN_CATEGORY_MAP: Record<string, { id: string; name: string }> = {
  backend: { id: '6809637769959178254', name: '后端' },
  frontend: { id: '6809637767543259144', name: '前端' },
  android: { id: '6809635626879549454', name: 'Android' },
  ios: { id: '6809635626661445640', name: 'iOS' },
  ai: { id: '6809637773935378440', name: '人工智能' },
  tools: { id: '6809637771511070734', name: '开发工具' },
  life: { id: '6809637776263217160', name: '代码人生' },
  read: { id: '6809637772874219534', name: '阅读' },
}

class ServiceJuejin {
  handle(): RouterMiddleware<'/juejin'> {
    return async (ctx) => {
      const category = ctx.request.url.searchParams.get('category') || 'backend'
      const cat = JUJIN_CATEGORY_MAP[category]

      if (!cat) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(
          null,
          400,
          `暂不支持 ${category} 分类，可选值：${Object.keys(JUJIN_CATEGORY_MAP).join('、')}`,
        )
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      // 这里**不接** uapis 兜底：掘金按 category 分榜（前端/后端/AI…），
      // 而备用源不支持该参数、只会返回全站总榜——用户选了「前端」却拿到全站榜，
      // 比干脆没数据更让人困惑。宁可如实报错，也不给一份对不上的榜单
      const data = (await cached(`juejin-${category}`, () => this.#fetch(category))).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `掘金热榜（${cat.name}）\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title}\n   ${e.author} · 热度 ${e.hot}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 掘金热榜 - ${cat.name}\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n**${e.author}** | 🔥 ${e.hot_value_desc} | 👁 ${e.view} | 👍 ${e.like}\n\n---\n`,
            )
            .join('\n')}`
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

  async #fetch(category: string): Promise<JuejinItem[]> {
    const response = await fetchUpstream(`${JUEJIN_API}?category_id=${JUJIN_CATEGORY_MAP[category].id}&type=hot`, {
      timeoutMs: 10000,
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch juejin rank: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { err_no: number; err_msg: string; data: JuejinRawItem[] | null }

    if (body.err_no !== 0) {
      throw new Error(`Failed to fetch juejin rank: ${body.err_no} ${body.err_msg}`)
    }

    return (body.data || [])
      .map((item, idx): JuejinItem => {
        const content = item.content || {}
        const counter = item.content_counter || {}

        return {
          rank: idx + 1,
          id: content.content_id || '',
          title: content.title || '',
          brief: content.brief || '',
          link: `https://juejin.cn/post/${content.content_id}`,
          author: item.author?.name || '',
          hot: counter.hot_rank || 0,
          hot_value_desc: this.#formatNum(counter.hot_rank || 0),
          view: counter.view || 0,
          like: counter.like || 0,
          collect: counter.collect || 0,
          comment: counter.comment_count || 0,
        }
      })
      .filter((e) => e.title && e.id)
  }

  #formatNum(n: number): string {
    if (n >= 10000) return (n / 10000).toFixed(1) + ' 万'
    return String(n)
  }
}

interface JuejinRawItem {
  content?: {
    content_id?: string
    title?: string
    brief?: string
  }
  content_counter?: {
    view?: number
    like?: number
    collect?: number
    hot_rank?: number
    comment_count?: number
    interact_count?: number
  }
  author?: {
    name?: string
    avatar?: string
  }
}

interface JuejinItem {
  rank: number
  id: string
  title: string
  brief: string
  link: string
  author: string
  hot: number
  hot_value_desc: string
  view: number
  like: number
  collect: number
  comment: number
}

export const serviceJuejin = new ServiceJuejin()
