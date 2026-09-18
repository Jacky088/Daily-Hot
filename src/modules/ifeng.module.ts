import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

// 凤凰热榜（凤凰网）。
// 官方没有开放接口，但热榜页会把整份榜单数据以 JSON 内联在 <script> 里，
// 所以直接取那段 JSON 来用 —— 比解析 DOM 稳得多（页面改版通常不影响 JSON 字段）。
const IFENG_RANK_URL = 'https://ishare.ifeng.com/hotNewsRank'
const DEFAULT_LIMIT = 20
// 页面本身只给 30 条
const MAX_LIMIT = 30

class ServiceIfeng {
  /** 供聚合接口 /v2/hot/aggregate 复用：与 /v2/ifeng 共享同一份服务端缓存，不重复打上游 */
  fetch() {
    return cached('ifeng-rank', () => this.#fetch())
  }

  handle(): RouterMiddleware<'/ifeng'> {
    return async (ctx) => {
      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await this.fetch()).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `凤凰热榜\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title}\n   ${e.source}${e.hot_value_desc ? ` · ${e.hot_value_desc}` : ''}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 凤凰热榜\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}**${e.source}**${e.hot_value_desc ? ` | 🔥 ${e.hot_value_desc}` : ''}\n\n---\n`,
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

  async #fetch(): Promise<IfengItem[]> {
    const response = await fetch(IFENG_RANK_URL, {
      headers: { 'User-Agent': Common.chromeUA, Accept: '*/*' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ifeng rank: HTTP ${response.status}`)
    }

    const items = this.#parse(await response.text())

    // 一条都没解析出来 = 页面结构变了，报错让缓存层回退旧数据，而不是把空列表当成“正常”
    if (!items.length) {
      throw new Error('Failed to parse ifeng rank: inline json not found')
    }

    return items
  }

  #parse(html: string): IfengItem[] {
    // 数据形如 ..."content":{...,"list":[{"documentId":"ucms_xxx",...}]}
    // 先定位第一个 documentId，再往前回溯到数组开头，最后按括号配对截出整段数组
    const anchor = html.indexOf('"documentId"')
    if (anchor < 0) return []

    const start = html.lastIndexOf('[{"documentId"', anchor)
    if (start < 0) return []

    const raw = this.#sliceJsonArray(html, start)
    if (!raw) return []

    let list: IfengRawItem[]
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
    if (!Array.isArray(list)) return []

    return list
      .map((item, idx): IfengItem => {
        const hotGrade = item.hotLabel?.hotGrade || ''

        return {
          rank: idx + 1,
          id: item.documentId || item.id || '',
          title: item.title || '',
          // weburl 是可直接分享的阅读页；url 是客户端接口地址，浏览器打开体验差，只作兜底
          link: item.link?.weburl || item.link?.url || '',
          source: item.source || '',
          // 站点给的是 http 缩略图，站内是 https，直连会被浏览器当混合内容拦掉，统一升到 https
          cover: (item.thumbnail || '').replace(/^http:\/\//, 'https://'),
          hot_value_desc: hotGrade,
          topic: item.hotLabel?.desp || '',
        }
      })
      .filter((e) => e.title && e.link)
  }

  // 从 start（必须是 '[' 或 '{'）开始按括号配对截取一段完整 JSON，字符串内的括号不参与计数
  #sliceJsonArray(text: string, start: number): string | null {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < text.length; i++) {
      const ch = text[i]

      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }

      if (ch === '"') inString = true
      else if (ch === '[' || ch === '{') depth++
      else if (ch === ']' || ch === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }

    return null
  }
}

interface IfengRawItem {
  documentId?: string
  id?: string
  title?: string
  source?: string
  thumbnail?: string
  link?: {
    url?: string
    weburl?: string
  }
  hotLabel?: {
    hotGrade?: string
    desp?: string
  }
}

export interface IfengItem {
  rank: number
  id: string
  title: string
  link: string
  source: string
  cover: string
  hot_value_desc: string
  topic: string
}

export const serviceIfeng = new ServiceIfeng()
