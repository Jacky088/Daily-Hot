import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

interface QuarkImage {
  url: string
  width: number
  height: number
  type: string
  description?: string
}

interface QuarkArticle {
  id: string
  title: string
  summary: string
  content: string
  source_name: string
  origin_src_name: string
  publish_time: number
  grab_time: number
  modify_time: number
  thumbnails: {
    url: string
    width: number
    height: number
    type: string
  }[]
  images: {
    url: string
    width: number
    height: number
    type: string
    description?: string
  }[]
  videos: {
    url: string
    length: number
    poster?: {
      url: string
      width: number
      height: number
    }
  }[]
  category: string[]
  tags: string[]
  cmt_cnt: number
  article_like_cnt: number
  share_cnt: number
  fav_cnt: number
  original_url: string
  wm_author?: {
    name: string
    desc: string
    author_icon?: {
      url: string
    }
    follower_cnt: number
  }
  item_agg_info?: {
    item_index: number
  }
}

interface QuarkHotItem {
  id: string
  title: string
  summary: string
  content: string
  source: string
  published: string
  published_at: number
  cover: string
  images: QuarkImage[]
  category: string[]
  tags: string[]
  like_count: number
  share_count: number
  comment_count: number
  link: string
}

const QUARK_API =
  'https://iflow.quark.cn/iflow/api/v1/article/aggregation?aggregation_id=16665090098771297825&count=50&bottom_pos=0'

/**
 * 请求头照网页端 XHR 补齐。
 * 上游挂在阿里 WAF 后面：本机直连（境内 IP）裸请求也能拿到数据，
 * 但 Worker 出海访问时是境外机房 IP，缺 Accept / Referer 更容易被判成爬虫，
 * 直接回一段 HTML 挑战页——解析 JSON 时抛错，表现就是「偶发拉不到数据」。
 */
const QUARK_HEADERS: Record<string, string> = {
  'User-Agent': Common.chromeUA,
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://123.quark.cn/',
  Origin: 'https://123.quark.cn',
}

/** 单次请求超时：跨境到境内上游，超过这个时间基本就是链路卡住，早断早重试 */
const QUARK_TIMEOUT_MS = 7000
/** 尝试次数：跨境链路偶发丢包/超时是常态，重试一次能挡掉绝大部分抖动 */
const QUARK_ATTEMPTS = 2

class ServiceQuark {
  handle(): RouterMiddleware<'/quark'> {
    return async (ctx) => {
      const data = await cached('quark', () => this.#fetch(), { ttl: 10 * 60 * 1000 })

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `夸克热点\n\n${data
            .slice(0, 20)
            .map((e, i) => `${i + 1}. ${e.title}${e.summary ? `\n   ${e.summary}` : ''}`)
            .join('\n\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 夸克热点\n\n${data
            .slice(0, 20)
            .map(
              (e, i) =>
                `### ${i + 1}. ${e.title}\n\n${e.summary ? `> ${e.summary}\n\n` : ''}${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}- 来源：${e.source}\n- 时间：${Common.localeTime(e.published)}\n- 分类：${e.category.join(' / ') || '未分类'}\n${e.tags.length > 0 ? `- 标签：${e.tags.join(', ')}\n` : ''}\n---\n`,
            )
            .join('\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<QuarkHotItem[]> {
    const articles = await this.#fetchArticles()

    return articles.map((article) => {
      // 清理 HTML 标签，提取纯文本内容
      const cleanContent = this.#cleanHtml(article.content || '')

      // 处理图片列表
      const images: QuarkImage[] = (article.images || []).map((img) => ({
        url: img.url,
        width: img.width,
        height: img.height,
        type: img.type || 'jpg',
        description: img.description || undefined,
      }))

      return {
        id: article.id,
        title: article.title,
        summary: (article.summary || '').replace(/[，；,;。]?(查看)?((更多)|(详情))(>>)?/, '。').replace(/>>/, '。'),
        content: cleanContent,
        source: article.source_name,
        cover: article.thumbnails?.[0]?.url || article.images?.[0]?.url || '',
        images,
        category: article.category || [],
        tags: article.tags || [],
        like_count: article.article_like_cnt || 0,
        share_count: article.share_cnt || 0,
        comment_count: article.cmt_cnt || 0,
        published: Common.localeTime(article.publish_time),
        published_at: article.publish_time,
        link: `https://123.quark.cn/detail?item_id=${article.id}`,
      }
    })
  }

  /**
   * 拉上游文章列表：超时 + 一次快速重试。
   *
   * 为什么必须重试：这条链路是「Cloudflare Worker → 境内上游」，跨境本身就有
   * 一定概率的超时/连接重置；单次失败不代表接口不可用，直接抛错会让前端看到
   * 一个偶发的「拉取失败」。实测本地直连上游 100% 正常（200 / 50 条），
   * 失败只出现在 Worker 侧，因此这里按链路抖动而不是按接口故障来处理。
   */
  async #fetchArticles(): Promise<QuarkArticle[]> {
    let lastErr: unknown

    for (let attempt = 1; attempt <= QUARK_ATTEMPTS; attempt++) {
      try {
        return await this.#fetchArticlesOnce()
      } catch (e) {
        lastErr = e
        // 间隔很短：失败基本都在连接层（超时/重置/挑战页），立刻换一条连接
        // 重试的收益远大于退避等待，也不至于把接口整体响应时间拖长
        if (attempt < QUARK_ATTEMPTS) await new Promise((r) => setTimeout(r, 300 * attempt))
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error('夸克上游请求失败')
  }

  async #fetchArticlesOnce(): Promise<QuarkArticle[]> {
    const response = await fetch(QUARK_API, {
      headers: QUARK_HEADERS,
      signal: AbortSignal.timeout(QUARK_TIMEOUT_MS),
    })

    // 显式检查状态码：上游被 WAF 拦下时回的是 HTML 挑战页，
    // 不检查就会在 response.json() 里抛一个语焉不详的解析错误，
    // 排查时看不出到底是「被拦」还是「结构变了」
    if (!response.ok) throw new Error(`夸克上游返回 HTTP ${response.status}`)

    const json = await response.json()
    const articles = json?.data?.articles

    // 结构不对同样要抛：悄悄返回空列表会让前端把「上游异常」显示成「没有数据」，
    // 既暴露不出问题，也拿不到缓存层的 stale 兜底
    if (!Array.isArray(articles)) throw new Error('夸克上游返回结构异常')

    return articles as QuarkArticle[]
  }

  /**
   * 清理 HTML 标签，提取纯文本内容
   */
  #cleanHtml(html: string): string {
    if (!html) return ''

    return (
      html
        // 移除图片/视频占位符
        .replace(/<!--\{(img|video):\d+\}-->/g, '')
        // 移除 HTML 标签
        .replace(/<[^>]+>/g, '')
        // 处理 HTML 实体
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        // 清理多余空白
        .replace(/\s+/g, ' ')
        .trim()
    )
  }
}

export const serviceQuark = new ServiceQuark()
