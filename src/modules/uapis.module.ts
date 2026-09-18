import { Common } from '../common.ts'
import { cached } from '../cache.ts'

/**
 * uapis.cn 热榜聚合（第三方中转）
 *
 * 定位是**备用数据源**：各平台一律「主源优先，主源失效才用它兜底」。
 * 不直接对外暴露成独立接口——它是第三方中转，可用性与限流都不由我们控制，
 * 能少依赖一次就少一次。
 *
 * 一个必须注意的点：hot_value 是**字符串**，而且各平台格式不统一
 *   weibo / douyin / hupu → "1232964"
 *   bilibili              → "640150播放"
 *   sspai                 → "评论:28 点赞:17"
 * 所以先取 extra 里的结构化数值（douyin、bilibili 有），取不到再对字符串做 parseInt
 * （这一步能顺手兼容 "640150播放"；"评论:28 点赞:17" 这类多指标拼接值本就没有可比性，
 * 只能退化成首个数）。
 *
 * 输出字段刻意多给了一个 hot_value_desc：项目里各热榜模块的字段命名并不统一
 * （有的用 hot_value、有的用 hot_value_desc、还有 score_desc），备用数据要能直接
 * 填进任意一张既有卡片，就得把两种命名都给上。
 */

const ENDPOINT = 'https://uapis.cn/api/v1/misc/hotboard'
const TIMEOUT_MS = 8_000

export type UapisBoardType =
  | 'weibo'
  | 'zhihu'
  | 'douyin'
  | 'baidu'
  | 'toutiao'
  | 'bilibili'
  | '36kr'
  | 'juejin'
  | 'sspai'
  | 'hupu'

/** 归一化后的条目：字段名对齐项目里既有热榜模块，前端可直接复用通用 list 渲染器 */
export interface UapisItem {
  title: string
  link: string
  hot_value: number
  /** 与 hot_value 同源的展示文案（「123.3万」），给按 hot_value_desc 取值的模块用 */
  hot_value_desc: string
  cover: string
  /** 部分平台带作者/媒体名（少数派等），取不到则为空串 */
  author: string
}

/** 热度文案：与首页聚合榜单保持同一套「万 / 亿」口径 */
function formatHot(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value >= 100_000_000) return `${Math.round(value / 10_000_000) / 10}亿`
  if (value >= 10_000) return `${Math.round(value / 1_000) / 10}万`
  return String(value)
}

class ServiceUapis {
  /** 拉某个平台的热榜；失败会抛错，由调用方决定是继续抛还是找别的兜底 */
  hotboard(type: UapisBoardType): Promise<UapisItem[]> {
    return cached(`uapis:${type}`, () => this.#fetch(type), { ttl: 5 * 60 * 1000 })
  }

  async #fetch(type: UapisBoardType): Promise<UapisItem[]> {
    const response = await fetch(`${ENDPOINT}?type=${encodeURIComponent(type)}`, {
      headers: { 'User-Agent': Common.chromeUA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`uapis 热榜请求失败: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { list?: unknown }
    const list = Array.isArray(body?.list) ? body.list : []

    return list
      .map((raw): UapisItem => {
        const item = raw as {
          title?: string
          url?: string
          hot_value?: string | number
          extra?: {
            cover?: string
            pic?: string
            hot_value?: number
            author?: string
          } | null
        }

        const hot = this.#pickHot(item)

        return {
          title: String(item?.title || '').trim(),
          link: String(item?.url || '').trim(),
          hot_value: hot,
          hot_value_desc: formatHot(hot),
          cover: String(item?.extra?.cover || item?.extra?.pic || ''),
          author: String(item?.extra?.author || ''),
        }
      })
      .filter((e) => e.title)
  }

  #pickHot(item: { hot_value?: string | number; extra?: { hot_value?: number } | null }): number {
    const structured = item?.extra?.hot_value
    if (typeof structured === 'number' && Number.isFinite(structured)) return structured

    const parsed = Number.parseInt(String(item?.hot_value ?? ''), 10)
    return Number.isFinite(parsed) ? parsed : 0
  }
}

export const serviceUapis = new ServiceUapis()

/**
 * 「主源优先、uapis 兜底」的统一入口。
 *
 * 各模块的 fetch 只要包一层即可获得备用源，不必各自抄一遍 try/catch：
 *   return cached('zhihu', () => withUapisFallback('zhihu', () => this.#fetch()))
 *
 * 兜底也拿不到时抛**原始错误**（而不是 uapis 的错误），这样缓存层能按既有逻辑
 * 走 stale 兜底，报错信息也仍然指向真正的故障源。
 */
export async function withUapisFallback<T>(type: UapisBoardType, loader: () => Promise<T[]>): Promise<T[]> {
  let primary: T[] | null = null
  let failure: unknown = null

  try {
    primary = await loader()
  } catch (e) {
    failure = e
  }

  // 主源有数据：直接用
  if (primary && primary.length) return primary

  // 走到这里有两种情况：抛错了，或者「成功但返回空数组」。
  // 对热榜而言这两者等价——用户看到的都是「一片空白」，所以一概去问备用源。
  // 注意 B 站和百度这两个主源失败时不会抛错、而是老老实实返回空数组，
  // 只判 catch 是拦不住的。
  const fallback = await serviceUapis.hotboard(type).catch(() => [])
  if (fallback.length) return fallback as unknown as T[]

  // 备用也没有：主源若曾正常返回（哪怕空）就如实返回空列表，
  // 否则把**原始错误**抛出去，让缓存层按既有逻辑走 stale 兜底、报错也指向真正的故障源
  if (primary) return primary
  throw failure
}
