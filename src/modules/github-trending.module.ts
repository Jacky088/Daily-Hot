import { load } from 'cheerio'
import { Common, dayjs } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

// GitHub Trending（官方无开放接口，抓页解析）。
// 上游没有 JSON 版榜单，故用 cheerio 解析 article.Box-row；一旦页面结构变动或被风控，
// 降级到官方搜索接口按「近期新建 + star 数」近似（口径偏新项目，见 #fetchFromSearchApi）
const GITHUB_TRENDING_URL = 'https://github.com/trending'
const GITHUB_SEARCH_API = 'https://api.github.com/search/repositories'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 25

const SINCE_MAP: Record<string, string> = {
  daily: '今日',
  weekly: '本周',
  monthly: '本月',
}

class ServiceGithubTrending {
  handle(): RouterMiddleware<'/github-trending'> {
    return async (ctx) => {
      const since = ctx.request.url.searchParams.get('since') || 'daily'

      if (!SINCE_MAP[since]) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(
          null,
          400,
          `暂不支持 ${since} 周期，可选值：${Object.keys(SINCE_MAP).join('、')}`,
        )
        return
      }

      // 语言过滤：要拼进 URL 路径，白名单校验挡掉路径注入（# 与 + 交给 encodeURIComponent）
      const lang = (ctx.request.url.searchParams.get('lang') || '').trim()
      if (lang && !/^[a-z0-9+#.-]{1,20}$/i.test(lang)) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, 'lang 只支持 GitHub 的编程语言英文名，如 python、typescript')
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await cached(`github-trending-${since}-${lang || 'all'}`, () => this.#fetch(since, lang))).slice(0, limit)

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `GitHub Trending（${SINCE_MAP[since]}${lang ? ` · ${lang}` : ''}）\n\n${data
            .map(
              (e, idx) =>
                `${idx + 1}. ${e.title}\n   ${e.language ? `${e.language} · ` : ''}${SINCE_MAP[since]}+${e.hot} star · 共 ${e.stars} star\n   ${e.link}`,
            )
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# GitHub Trending - ${SINCE_MAP[since]}${lang ? ` · ${lang}` : ''}\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n${e.description ? `${e.description}\n\n` : ''}**${e.language || '未知语言'}** | ⭐ ${e.stars} | 🍴 ${e.forks} | ${SINCE_MAP[since]} **+${e.hot}**\n\n---\n`,
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

  async #fetch(since: string, lang: string): Promise<GithubTrendingItem[]> {
    try {
      const url = `${GITHUB_TRENDING_URL}${lang ? `/${encodeURIComponent(lang)}` : ''}?since=${since}`
      const response = await fetch(url, {
        headers: { 'User-Agent': Common.chromeUA, Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
      })

      if (response.ok) {
        const items = this.#parse(await response.text(), since)
        // 解析出结果才认：返回 0 条基本等于页面结构变了，交给兜底重试
        if (items.length) return items
      }
    } catch {
      // 抓页失败（超时 / 被风控）：静默走兜底
    }

    return this.#fetchFromSearchApi(since, lang)
  }

  #parse(html: string, since: string): GithubTrendingItem[] {
    const $ = load(html)
    const items: GithubTrendingItem[] = []

    $('article.Box-row').each((_, el) => {
      const anchor = $(el).find('h2 a').first()
      const path = (anchor.attr('href') || '').replace(/^\//, '')
      if (!path) return

      // h2 的文字是「owner / repo」（owner 外层 span 自带留白），收成一行再去掉斜杠两侧多余空格
      const title = anchor.text().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim()
      // 右上角「1,234 stars today / this week / this month」，只取数字部分
      const starsToday = ($(el).find('span.d-inline-block.float-sm-right').first().text().match(/[\d,]+/) || [])[0] || ''

      items.push({
        rank: items.length + 1,
        id: path,
        title,
        link: `https://github.com/${path}`,
        description: $(el).find('p').first().text().replace(/\s+/g, ' ').trim(),
        language: $(el).find('[itemprop="programmingLanguage"]').first().text().trim(),
        stars: $(el).find('a[href$="/stargazers"]').first().text().replace(/\s+/g, '').trim(),
        forks: $(el).find('a[href$="/forks"]').first().text().replace(/\s+/g, '').trim(),
        hot: Number((starsToday || '0').replace(/,/g, '')),
        hot_value_desc: starsToday ? `${SINCE_MAP[since]} +${starsToday}` : '',
      })
    })

    return items
  }

  // 兜底：官方搜索接口按「近 N 天新建 + star 数」排序。
  // 与 Trending 的「热度增量」口径不同（更偏刚冒头的新项目），仅在抓页失败时使用
  async #fetchFromSearchApi(since: string, lang: string): Promise<GithubTrendingItem[]> {
    const days = since === 'daily' ? 7 : since === 'weekly' ? 14 : 30
    const created = dayjs().subtract(days, 'day').format('YYYY-MM-DD')
    const q = `created:>${created}${lang ? ` language:${lang}` : ''}`

    const response = await fetch(
      `${GITHUB_SEARCH_API}?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${DEFAULT_LIMIT}`,
      {
        headers: {
          'User-Agent': Common.chromeUA,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10000),
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch github trending: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { items?: GithubRepoSearchItem[] }

    return (body.items || []).map(
      (item, idx): GithubTrendingItem => ({
        rank: idx + 1,
        id: item.full_name,
        title: item.full_name.replace('/', ' / '),
        link: item.html_url,
        description: item.description || '',
        language: item.language || '',
        stars: String(item.stargazers_count ?? ''),
        forks: String(item.forks_count ?? ''),
        hot: item.stargazers_count || 0,
        hot_value_desc: `${SINCE_MAP[since]} +${item.stargazers_count || 0}`,
      }),
    )
  }
}

interface GithubRepoSearchItem {
  full_name: string
  html_url: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
}

export interface GithubTrendingItem {
  rank: number
  id: string
  title: string
  link: string
  description: string
  language: string
  stars: string
  forks: string
  hot: number
  hot_value_desc: string
}

export const serviceGithubTrending = new ServiceGithubTrending()
