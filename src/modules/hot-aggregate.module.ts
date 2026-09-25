import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { serviceWeibo } from './weibo.module.ts'
import { serviceZhihu } from './zhihu.module.ts'
import { serviceDouyin } from './douyin.module.ts'
import { serviceToutiao } from './toutiao.module.ts'
import { serviceBaidu } from './baidu.module.ts'
import { serviceBili } from './bili.module.ts'
import { serviceIfeng } from './ifeng.module.ts'

import type { RouterMiddleware } from '@oak/oak'

/**
 * 全网热榜聚合
 *
 * 把若干「同质但口径不同」的平台热搜榜合并成一条统一榜单流，供前端「今日热榜」首页消费。
 *
 * 两个设计要点：
 * ① 不重复抓上游：各平台数据一律走对应模块新暴露的 fetch()/fetchHot()，与独立接口
 *    共享同一份服务端缓存（键相同），因此聚合请求只是多了一次内存读取。
 * ② 跨平台可比：各平台热度单位互不相通（微博「次」、知乎「万热度」、B 站干脆没有），
 *    直接比大小必然被微博霸榜。故排序分 = 平台内归一化热度 × 平台权重，
 *    权重只做数量级微调（见 PLATFORMS.weight），榜单展示仍用各平台原始热度。
 */

export interface AggregateItem {
  /** 榜单标题 */
  title: string
  /** 原文链接 */
  link: string
  /** 摘要（部分平台有） */
  desc: string
  /** 封面图（部分平台有） */
  cover: string
  /** 原始热度数值（无热度口径的平台为 null） */
  hot: number | null
  /** 该平台原始热度文案（微博 268.5万 / 头条 4853.7万 …，仅供悬停查看） */
  hot_text: string
  /** 综合热度指数文案（跨平台统一口径，与榜单排序自洽，前端展示的就是它） */
  hot_index_text: string
  /** 平台内排名（从 1 开始） */
  rank: number
  /** 平台 id（weibo / zhihu …，前端筛选与图标定位用） */
  source: string
  /** 平台中文名 */
  source_name: string
  /** 平台图标（/logos/*.svg） */
  source_icon: string
  /** 角标（热 / 新 / 议，部分平台有） */
  tag: string | null
  /** 排序分（仅排序用，前端可不消费） */
  score: number
}

interface PlatformSummary {
  id: string
  name: string
  icon: string
  /** 该平台本次贡献的条数 */
  count: number
  /** 是否抓取成功 */
  ok: boolean
}

interface RawEntry {
  title: string
  link: string
  desc?: string
  cover?: string | null
  hot?: number | null
  tag?: string | null
}

interface Platform {
  id: string
  name: string
  icon: string
  /**
   * 平台权重：只用于抹平各平台热度量级的天然差异，让榜首领跑者能交错出现，
   * 而不是让某一家的数值口径独霸前排。取值 0~1，越大越靠前。
   */
  weight: number
  load: () => Promise<unknown[]>
  normalize: (item: any, index: number) => RawEntry | null
}

/** 从「1234 万热度」「3.2w」这类文案里抠出可比较的数值（单测锁定口径） */
export function parseHotText(text: unknown): number | null {
  if (text == null) return null
  const str = String(text)
  const matched = /([\d.]+)\s*(亿|万|w|W)?/.exec(str)
  if (!matched) return null
  let value = Number.parseFloat(matched[1])
  if (!Number.isFinite(value)) return null
  const unit = matched[2]
  if (unit === '亿') value *= 100_000_000
  else if (unit === '万' || unit === 'w' || unit === 'W') value *= 10_000
  return Math.round(value)
}

/** 热度展示文案：与前端榜单一致的「987.6万」口径（单测锁定口径） */
export function formatHot(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return ''
  if (value >= 100_000_000) return `${Math.round(value / 10_000_000) / 10}亿`
  if (value >= 10_000) return `${Math.round(value / 1_000) / 10}万`
  return String(value)
}

/** 平台内归一化打分：有热度口径的按热度占比，没有的退回排名折算（单测锁定口径） */
export function normalizeScore(
  hot: number | null,
  index: number,
  poolSize: number,
  maxHot: number,
  weight: number,
): number {
  const hotPart = maxHot > 0 && hot ? hot / maxHot : 1 - (index / poolSize) * 0.5
  const rankPart = 1 - (index / poolSize) * 0.5
  return (hotPart * 0.75 + rankPart * 0.25) * weight
}

/** 聚合接口参数钳制：非法回退默认值，越界压到 min/max（单测锁定口径） */
export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const PLATFORMS: Platform[] = [
  {
    id: 'weibo',
    name: '微博',
    icon: '/logos/sinaweibo.svg',
    weight: 1,
    load: () => serviceWeibo.fetch() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.link,
      hot: Number(e.hot_value) || null,
    }),
  },
  {
    id: 'douyin',
    name: '抖音',
    icon: '/logos/tiktok.svg',
    weight: 0.97,
    load: () => serviceDouyin.fetch() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.link,
      cover: e.cover,
      hot: Number(e.hot_value) || null,
    }),
  },
  {
    id: 'toutiao',
    name: '今日头条',
    icon: '/logos/toutiao.ico',
    weight: 0.93,
    load: () => serviceToutiao.fetch() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.link,
      cover: e.cover,
      hot: Number(e.hot_value) || null,
    }),
  },
  {
    id: 'baidu',
    name: '百度',
    icon: '/logos/baidu.svg',
    weight: 0.9,
    load: () => serviceBaidu.fetchHot() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.url,
      desc: e.desc,
      cover: e.cover,
      hot: Number(e.score) || parseHotText(e.score_desc),
      // 百度自带「新 / 热」标记，直接沿用
      tag: e.type_desc || null,
    }),
  },
  {
    id: 'zhihu',
    name: '知乎',
    icon: '/logos/zhihu.svg',
    weight: 0.87,
    load: () => serviceZhihu.fetch() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.link,
      desc: e.detail,
      cover: e.cover,
      hot: parseHotText(e.hot_value_desc),
    }),
  },
  {
    id: 'bili',
    name: '哔哩哔哩',
    icon: '/logos/bilibili.svg',
    weight: 0.83,
    load: () => serviceBili.fetch() as Promise<unknown[]>,
    // B 站热搜不公开热度数值，只给关键词：热度留空，靠排名折算排序分
    normalize: (e) => ({
      title: e.title,
      link: e.link,
    }),
  },
  {
    id: 'ifeng',
    name: '凤凰网',
    icon: '/logos/ifeng.png',
    weight: 0.8,
    load: () => serviceIfeng.fetch() as Promise<unknown[]>,
    normalize: (e) => ({
      title: e.title,
      link: e.link,
      // source 是发布媒体（央视财经 / 中国新闻周刊 …），topic 是话题（#水晶加速出海#），
      // 两者拼成摘要比只留一个更有信息量
      desc: [e.source, e.topic].filter(Boolean).join(' · '),
      cover: e.cover,
      // hotGrade 形如「286万热度」，是可解析的数值而非等级标记
      hot: parseHotText(e.hot_value_desc),
    }),
  },
]

/**
 * 单平台抓取超时。
 * 抖音冷启动实测约 7.6s（上游接口本身慢），卡在 8s 上会时好时坏地缺席——
 * 而缺席的直接后果是首页少一个平台标签，看起来像功能坏了。给到 12s 留足余量；
 * 代价是首屏最坏情况多等几秒，但有 splash 的 3.5s 兜底遮罩顶着。
 */
const PER_SOURCE_TIMEOUT = 12_000

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('aggregate source timeout')), ms)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** 单平台最多进入总榜的条数：避免某一家把前排占满 */
const DEFAULT_PER_SOURCE = 3
/** 单平台参与「综合」混排的候选条数上限 */
const POOL_PER_SOURCE = 12
/** 单平台完整榜单的条数上限（点平台筛选时展示的就是这份） */
const FULL_LIST_PER_SOURCE = 30

class ServiceHotAggregate {
  handle(): RouterMiddleware<'/hot/aggregate'> {
    return async (ctx) => {
      const limit = clampInt(ctx.request.url.searchParams.get('limit'), 30, 1, 100)
      const per = clampInt(ctx.request.url.searchParams.get('per'), DEFAULT_PER_SOURCE, 1, 20)
      const only = (ctx.request.url.searchParams.get('sources') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const platforms = only.length ? PLATFORMS.filter((p) => p.id && only.includes(p.id)) : PLATFORMS
      // 缓存键收敛：前端固定用 limit=20&per=3&全源（见 public/app.js 的两处调用），
      // 无参 API 默认是 limit=30&per=3&全源。这两组是 99% 的流量，各占一个缓存键；
      // 非常规参数（自定义 limit/per/sources）实时计算不缓存——之前 limit(1~100) ×
      // per(1~20) × 来源组合能组合出几千种键，会把 500 条的内存缓存池冲掉，
      // 挤走微博/知乎等高价值单源缓存。
      const isCommon = (limit === 20 || limit === 30) && per === DEFAULT_PER_SOURCE && !only.length
      const data = isCommon
        ? await cached(`hot:aggregate:default:${limit}:${per}`, () => this.#aggregate(platforms, limit, per), {
            ttl: 3 * 60 * 1000,
          })
        : await this.#aggregate(platforms, limit, per)

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `全网热榜聚合\n\n${data.items
            .map((e, i) => `${i + 1}. [${e.source_name}] ${e.title}${e.hot_text ? ` (${e.hot_text})` : ''}`)
            .join('\n')}`
          break

        case 'markdown':
          ctx.response.body = `# 全网热榜聚合\n\n${data.items
            .map(
              (e, i) =>
                `${i + 1}. [${e.title}](${e.link}) \`${e.source_name}\`${e.hot_text ? ` \`${e.hot_text}\`` : ''}`,
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

  /**
   * 并发拉取各平台 → 归一化打分 → 混排取前 limit 条。
   * allSettled + 单源超时：任一平台挂了（风控/超时）只表现为该平台缺席，不影响整体出榜，
   * 也不会让最慢的一家把整份响应拖住——被掐掉的上游请求仍在后台跑完并落缓存，下次就有。
   */
  async #aggregate(platforms: Platform[], limit: number, per: number) {
    const settled = await Promise.allSettled(platforms.map((p) => withTimeout(p.load(), PER_SOURCE_TIMEOUT)))

    // candidates：「综合」榜的候选池（各平台头部若干条，混排用）
    // lists：各平台自己的完整榜单（点平台筛选时原样展示，不参与混排）
    const candidates: AggregateItem[] = []
    const lists: Record<string, AggregateItem[]> = {}
    const summary: PlatformSummary[] = []

    settled.forEach((result, i) => {
      const platform = platforms[i]
      if (result.status !== 'fulfilled') {
        summary.push({ id: platform.id, name: platform.name, icon: platform.icon, count: 0, ok: false })
        return
      }

      const raw = Array.isArray(result.value) ? result.value : []
      const rows: AggregateItem[] = []

      for (const [index, entry] of raw.entries()) {
        if (rows.length >= FULL_LIST_PER_SOURCE) break
        let mapped: RawEntry | null = null
        try {
          mapped = platform.normalize(entry, index)
        } catch {
          mapped = null
        }
        if (!mapped || !mapped.title) continue
        rows.push({
          title: String(mapped.title),
          link: String(mapped.link || ''),
          // 摘要只用于列表里一行的展示，百度/凤凰的原文动辄数百字，
          // 传全文纯属浪费带宽（前端本来就只渲染一行）
          desc: String(mapped.desc || '').slice(0, 120),
          cover: String(mapped.cover || ''),
          hot: mapped.hot ?? null,
          hot_text: formatHot(mapped.hot ?? null),
          hot_index_text: '',
          rank: rows.length + 1,
          source: platform.id,
          source_name: platform.name,
          source_icon: platform.icon,
          tag: mapped.tag ?? null,
          score: 0,
        })
      }

      // 平台内归一化：有热度口径的按热度占比，没有的（B 站）退回排名折算。
      // 分母固定取混排池长度，而不是完整榜长度——榜尾那几十条不参与「综合」，
      // 让它们稀释头部的分差只会把各平台第一名拉平
      const head = rows.slice(0, POOL_PER_SOURCE)
      const poolSize = Math.max(head.length, 1)
      const maxHot = Math.max(0, ...head.map((e) => e.hot || 0))
      head.forEach((item, index) => {
        item.score = normalizeScore(item.hot, index, poolSize, maxHot, platform.weight)
      })

      candidates.push(...head)
      // 完整榜单存克隆：综合榜后面要重排 rank / 补角标 / 写热度指数，
      // 直接引用同一批对象会把这些改动带进平台榜，导致单平台榜单排名被打乱
      lists[platform.id] = rows.map((it) => ({ ...it }))
      summary.push({
        id: platform.id,
        name: platform.name,
        icon: platform.icon,
        count: rows.length,
        ok: rows.length > 0,
      })
    })

    // 全局排序后按平台配额截断：先保证各家头部有位置，再用剩余名额补满
    candidates.sort((a, b) => b.score - a.score)
    const used = new Map<string, number>()
    const picked: AggregateItem[] = []
    for (const item of candidates) {
      if (picked.length >= limit) break
      const count = used.get(item.source) || 0
      if (count >= per) continue
      used.set(item.source, count + 1)
      picked.push(item)
    }
    for (const item of candidates) {
      if (picked.length >= limit) break
      if (picked.includes(item)) continue
      picked.push(item)
    }

    // 展示用排名重排：截断后再统一编号，避免出现「1、2、5、7」这种跳号
    picked.forEach((item, index) => {
      item.rank = index + 1
      // 前三名补「热」角标——跨平台混排没有统一的榜单标记，给前排一致口径更清爽
      if (!item.tag && index < 3) item.tag = '热'
      // 综合热度指数：把归一化得分映射到「万」量级。
      // 各平台原始热度口径互不相通（微博 268 万 vs 头条 4853 万），直接展示会与排序
      // 自相矛盾——268 万排在 4853 万前面没人能看懂。指数与排序同源，展示自洽；
      // 原始热度仍留在 hot_text 里，前端以悬停提示的形式保留可追溯性
      item.hot_index_text = `${Math.round(item.score * 1000 * 10) / 10}万`
    })

    return {
      /** 「综合」：跨平台加权混排结果 */
      items: picked,
      /** 各平台自己的完整榜单（platform.id → 榜单条目，按平台原始顺序） */
      lists,
      platforms: summary,
      total: picked.length,
      updated_at: Date.now(),
    }
  }
}

export const serviceHotAggregate = new ServiceHotAggregate()
