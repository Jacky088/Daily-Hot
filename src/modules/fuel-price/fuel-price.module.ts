import regions from './regions.json' with { type: 'json' }
import { load } from 'cheerio'
import { Common } from '../../common.ts'
import { serviceIP } from '../ip.module.ts'
import { allowForceUpdate, forceUpdateKey } from '../../force-update-guard.ts'

import type { RouterMiddleware } from '@oak/oak'

type FuelRegion = (typeof regions)[number]

const sortedRegion = regions.toSorted((a, b) => a.region.length - b.region.length)

// 历史油价数据源（you.jxgjtz.com）的省级区域拼音映射
// 注意：该站点部分拼音拼写特殊（西藏=xicang、内蒙古=namenggu、陕西=shanxi2），以其 URL 为准
const JXGJTZ_PROVINCES: Record<string, string> = {
  北京: 'beijing',
  上海: 'shanghai',
  天津: 'tianjin',
  重庆: 'chongqing',
  河北: 'hebei',
  山西: 'shanxi',
  辽宁: 'liaoning',
  吉林: 'jilin',
  黑龙江: 'heilongjiang',
  江苏: 'jiangsu',
  浙江: 'zhejiang',
  安徽: 'anhui',
  福建: 'fujian',
  江西: 'jiangxi',
  山东: 'shandong',
  河南: 'henan',
  湖北: 'hubei',
  湖南: 'hunan',
  广东: 'guangdong',
  海南: 'hainan',
  四川: 'sichuan',
  贵州: 'guizhou',
  云南: 'yunnan',
  陕西: 'shanxi2',
  甘肃: 'gansu',
  青海: 'qinghai',
  广西: 'guangxi',
  宁夏: 'ningxia',
  新疆: 'xinjiang',
  内蒙古: 'namenggu',
  西藏: 'xicang',
}

// 从区域名（可能是"安徽安庆"这类地级市）提取所属省级的拼音
function provincePinyin(region: string): { name: string; pinyin: string } | null {
  for (const p of ['黑龙江', '内蒙古']) {
    if (region.startsWith(p)) return { name: p, pinyin: JXGJTZ_PROVINCES[p] }
  }
  const prefix2 = region.slice(0, 2)
  const pinyin = JXGJTZ_PROVINCES[prefix2]
  return pinyin ? { name: prefix2, pinyin } : null
}

interface FuelPrice {
  name: string
  price: number
  price_desc: string
}

interface FuelHistoryPoint {
  date: string
  p92: number
  p95: number
  p98: number
  p0: number
}

interface FuelTrend {
  /** 下次调价日期，如 "2月24日24时" */
  next_adjustment_date: string
  /** 涨跌方向: 上调 / 下调 / 搁浅 */
  direction: string
  /** 每吨变化量（元），如 110 */
  change_ton: number
  /** 每吨变化描述，如 "上调110元/吨" */
  change_ton_desc: string
  /** 每升最小变化量（元），如 0.08 */
  change_liter_min: number
  /** 每升最大变化量（元），如 0.10 */
  change_liter_max: number
  /** 每升变化描述，如 "0.08元/升-0.10元/升" */
  change_liter_desc: string
  /** 完整描述 */
  description: string
}

class ServiceFuelPrice {
  #BASE_URL: string = 'http://www.qiyoujiage.com'
  #HISTORY_URL: string = 'https://you.jxgjtz.com'

  private cache = new Map<string, { ts: number; items: FuelPrice[]; trend: FuelTrend | null }>()
  private historyCache = new Map<string, { ts: number; data: FuelHistoryPoint[] }>()
  // 60 minutes
  private readonly CACHE_TTL_MS = 60 * 60 * 1000

  handle(): RouterMiddleware<'/fuel/price'> {
    return async (ctx) => {
      try {
        const queryRegion = ctx.request.url.searchParams.get('region') || '北京'
        const forceUpdate = !!ctx.request.url.searchParams.get('force-update')
        // 限流防护：同一调用方 60 秒内仅允许一次强制刷新，否则回退缓存
        const ip = serviceIP.getClientIP(ctx.request.headers) || ctx.request.ip || 'unknown'
        const allowedForce = forceUpdate && allowForceUpdate(forceUpdateKey(ctx.request.url.pathname, ip))
        const target = sortedRegion.find((e) => e.region.endsWith(queryRegion))

        if (!target) {
          ctx.response.body = Common.buildJson(null, 400, `暂不支持 ${queryRegion} 区域查询`)
          return
        }

        const [{ items, trend, ts }, history] = await Promise.all([
          this.#fetch(target, allowedForce),
          this.#fetchHistory(target.region, allowedForce),
        ])

        const province = provincePinyin(target.region)
        const historyRegion = province ? province.name : ''

        const data = {
          region: target.region,
          trend,
          items,
          history,
          history_region: historyRegion,
          link: `${this.#BASE_URL}${target.url}`,
          updated: Common.localeTime(ts),
          updated_at: ts,
        }

        const trendText = data.trend ? `\n\n${data.trend.description}` : ''
        const historyText = history.length
          ? `\n\n历史油价（${historyRegion}，最近 ${history.length} 期）:\n${history
              .slice(-5)
              .map((e) => `${e.date} 92#: ${e.p92} 95#: ${e.p95} 98#: ${e.p98} 0#: ${e.p0}`)
              .join('\n')}`
          : ''

        switch (ctx.state.encoding) {
          case 'text': {
            ctx.response.body = `今日油价 (${queryRegion})\n\n${data.items
              .map((e) => `${e.name}: ${e.price_desc}`)
              .join('\n')}${trendText}${historyText}\n\n更新时间: ${data.updated}`
            break
          }

          case 'markdown': {
            ctx.response.body = `# 今日油价 (${queryRegion})\n\n${data.items
              .map((e) => `- **${e.name}**: ${e.price_desc}`)
              .join('\n')}${data.trend ? `\n\n> ${data.trend.description}` : ''}${history.length ? `\n\n## 历史油价（${historyRegion}）\n\n| 日期 | 92# | 95# | 98# | 0# |\n|---|---|---|---|---|\n${history
              .slice(-10)
              .map((e) => `| ${e.date} | ${e.p92} | ${e.p95} | ${e.p98} | ${e.p0} |`)
              .join('\n')}` : ''}\n\n更新时间: ${data.updated}`
            break
          }

          case 'json':
          default: {
            ctx.response.body = Common.buildJson(data)
            break
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误'
        ctx.response.body = Common.buildJson({ error: message }, 500, message)
      }
    }
  }

  async #fetch(
    region: FuelRegion,
    forceUpdate: boolean = false,
  ): Promise<{ ts: number; items: FuelPrice[]; trend: FuelTrend | null }> {
    const cacheKey = `FUEL_PRICE_${region.url}`

    if (forceUpdate) {
      this.cache.delete(cacheKey)
    }

    const cachedEntry = this.cache.get(cacheKey)
    const isCacheValid = cachedEntry && Date.now() - cachedEntry.ts < this.CACHE_TTL_MS

    if (isCacheValid) {
      return cachedEntry
    }

    const response = await fetch(`${this.#BASE_URL}${region.url}`, { headers: { 'User-Agent': Common.chromeUA } })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const html = await response.text()
    const data = { ts: Date.now(), items: this.parsePrices(html), trend: this.parseTrend(html) }

    this.cache.set(cacheKey, data)

    return data
  }

  // 历史油价：you.jxgjtz.com 提供省级最近 30 期调价记录，失败时返回空数组（不阻塞主数据）
  async #fetchHistory(regionName: string, forceUpdate: boolean = false): Promise<FuelHistoryPoint[]> {
    const province = provincePinyin(regionName)
    if (!province) return []

    const cacheKey = `FUEL_HISTORY_${province.pinyin}`

    if (forceUpdate) {
      this.historyCache.delete(cacheKey)
    }

    const cachedEntry = this.historyCache.get(cacheKey)
    if (cachedEntry && Date.now() - cachedEntry.ts < this.CACHE_TTL_MS) {
      return cachedEntry.data
    }

    try {
      const response = await fetch(`${this.#HISTORY_URL}/${province.pinyin}/`, {
        headers: { 'User-Agent': Common.chromeUA },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return []

      const html = await response.text()
      const section = html.slice(html.indexOf('历史油价数据'))
      const trs = section.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []

      const rows: FuelHistoryPoint[] = []

      for (const tr of trs) {
        const tds = tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []
        if (tds.length < 6) continue

        const date = (tds[0].replace(/<[^>]+>/g, '').trim().match(/\d{4}-\d{2}-\d{2}/) || [])[0]
        if (!date) continue

        const cells = tds.slice(1).map((td) => {
          const text = td.replace(/<[^>]+>/g, ' ')
          return parseFloat(text.trim().match(/\d+\.?\d*/)?.[0] ?? '')
        })

        if (Number.isNaN(cells[1])) continue

        rows.push({ date, p92: cells[1], p95: cells[2], p98: cells[3], p0: cells[4] })
      }

      if (rows.length === 0) return []

      // 按日期升序（旧 -> 新），便于前端绘制曲线
      rows.sort((a, b) => a.date.localeCompare(b.date))

      this.historyCache.set(cacheKey, { ts: Date.now(), data: rows })

      return rows
    } catch {
      return []
    }
  }

  parsePrices(html: string): FuelPrice[] {
    const $ = load(html)
    const items: FuelPrice[] = []
    $('#youjia dl').each((_, dl) => {
      const $dl = $(dl)
      const dts = $dl.find('dt')
      const dds = $dl.find('dd')

      dts.each((i, dt) => {
        const name = $(dt)
          .text()
          .trim()
          .replace(/^[^0-9]+/, '')
        const priceText = $(dds[i]).text().trim()
        const price = parseFloat(priceText)

        items.push({
          name,
          price,
          price_desc: `${price.toFixed(2)} 元/升`,
        })
      })
    })

    return items
  }

  parseTrend(html: string): FuelTrend | null {
    const $ = load(html)

    // The trend info is in a styled div inside #youjiaCont, or in the first styled div on the homepage
    const trendDiv = $('#youjiaCont > div')
      .filter((_, el) => {
        const style = $(el).attr('style') || ''
        return style.includes('border') && style.includes('#EA5146')
      })
      .first()

    // Fallback: homepage uses a different structure
    const trendText = trendDiv.length ? trendDiv.text() : $('#left > div').first().text()

    if (!trendText) return null

    const dateMatch = trendText.match(/下次油价(\d+月\d+日\d+时)调整/)
    const directionMatch = trendText.match(/预计(上调|下调|搁浅)/)
    const tonMatch = trendText.match(/(上调|下调)(\d+)元\/吨/)
    const literMatch = trendText.match(/\((\d+\.?\d*)元\/升[-~](\d+\.?\d*)元\/升\)/)

    if (!dateMatch && !directionMatch) return null

    const direction = directionMatch ? directionMatch[1] : '搁浅'
    const nextDate = dateMatch ? dateMatch[1] : ''
    const changeTon = tonMatch ? parseInt(tonMatch[2], 10) : 0
    const changeLiterMin = literMatch ? parseFloat(literMatch[1]) : 0
    const changeLiterMax = literMatch ? parseFloat(literMatch[2]) : 0

    const changeTonDesc = tonMatch ? `${direction}${tonMatch[2]}元/吨` : ''
    const changeLiterDesc =
      changeLiterMin && changeLiterMax ? `${changeLiterMin.toFixed(2)}元/升-${changeLiterMax.toFixed(2)}元/升` : ''

    const descParts: string[] = []
    if (nextDate) descParts.push(`下次调价时间: ${nextDate}`)
    if (direction !== '搁浅') {
      descParts.push(`预计${changeTonDesc}${changeLiterDesc ? ' (' + changeLiterDesc + ')' : ''}`)
    } else {
      descParts.push('预计搁浅（不调整）')
    }

    return {
      next_adjustment_date: nextDate,
      direction,
      change_ton: changeTon,
      change_ton_desc: changeTonDesc,
      change_liter_min: changeLiterMin,
      change_liter_max: changeLiterMax,
      change_liter_desc: changeLiterDesc,
      description: descParts.join('，'),
    }
  }
}

export const serviceFuelPrice = new ServiceFuelPrice()
