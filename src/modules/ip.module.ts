import { Common } from '../common.ts'
import { toChineseCity } from '../data/cn-geo.ts'
import { getPlatformIP } from '../platform-ip.ts'
import type { RouterMiddleware } from '@oak/oak'

// 仅放行 IP 字面量：字符集收紧为 [0-9a-fA-F:.]，天然排除 / ? & # 等字符，
// 从源头阻断路径穿越（../../）与查询参数注入（?a=1）——两者都会把本服务变成上游开放代理。
function isValidIPLiteral(value: string): boolean {
  if (!value || value.length > 45) return false // IPv6 完整形式最长 45 字符
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false

  // IPv4：必须是 4 段点分十进制，且每段 0-255
  if (value.includes('.')) {
    const parts = value.split('.')

    if (parts.length !== 4) return false
    return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  }

  return true // IPv6 形式，字符集已在上面收紧
}

class ServiceIP {
  // 平台注入的客户端 IP 头：由平台在网络层写入，客户端无法伪造，优先使用。
  //   cf-connecting-ip：Cloudflare Workers / Pages
  //   eo-client-ip：腾讯 EdgeOne 规则引擎「客户端 IP 头部」的默认头名
  //   eo-connecting-ip / eo-real-ip：EdgeOne 其它接入方式下的变体，一并识别
  //   true-client-ip：部分 CDN（Akamai / Cloudflare Enterprise）
  private static readonly PLATFORM_IP_HEADERS = [
    'cf-connecting-ip',
    'eo-client-ip',
    'eo-connecting-ip',
    'eo-real-ip',
    'true-client-ip',
  ]

  // 自托管环境（Node/Bun/Deno）经过反向代理时，转发头作为回退。
  // 注意：这些头可被客户端伪造，仅用于日志展示，不可用于安全决策
  private static readonly FORWARDED_IP_HEADERS = ['x-forwarded-for', 'x-real-ip', 'x-client-ip', 'x-real-client-ip']

  /**
   * 解析访客 IP。优先级：
   *   1. 平台入口提供的 IP（见 src/platform-ip.ts，如 EdgeOne 的 context.clientIp）——
   *      它是平台承诺的字段，不依赖「转发头是否被原样透传」这一平台策略
   *   2. 平台注入头 → 3. 反代转发头
   */
  getClientIP(requestHeaders: Headers): string {
    const platformIP = getPlatformIP()
    if (platformIP) return platformIP

    // 内网/本地 IP 先记下继续往后找：高优先级头里出现内网地址（CDN 内部链路常见）时，
    // 低优先级头里的公网地址更接近访客真实位置。整轮都没有公网 IP 才用它兜底，
    // 保留本地开发 / 内网自托管下「改用服务器出口 IP 定位」的原有行为。
    let localFallback = ''

    for (const field of [...ServiceIP.PLATFORM_IP_HEADERS, ...ServiceIP.FORWARDED_IP_HEADERS]) {
      const value = requestHeaders.get(field)?.trim()
      if (!value) continue

      const ip = this.pickClientIP(value)
      if (!ip) continue

      if (!this.isLocalIP(ip)) return ip
      if (!localFallback) localFallback = ip
    }

    return localFallback
  }

  /**
   * 从逗号分隔的多跳 IP 链里挑出客户端 IP。
   *
   * 优先取链上第一个「公网 IP」，而不是无条件取链首：CDN 常把内网地址放在链首
   * （如 "10.0.0.5, 203.0.113.9"），若取到内网地址，上层会判定为「本地/内网访问」，
   * 转而改用服务器自身出口 IP 去定位——结果是拿机房位置冒充访客位置
   * （海外机房会让定位一路回退成默认城市），访客真实信息反而被掩盖。
   *
   * 整条链都是内网地址时退回链首，保留本地开发 / 内网自托管时的原有兜底行为。
   */
  private pickClientIP(chain: string): string {
    const parts = chain
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)

    if (!parts.length) return ''

    const publicIP = parts.find((part) => isValidIPLiteral(part) && !this.isLocalIP(part))
    if (publicIP) return publicIP

    // 没有公网 IP：返回第一个合法的 IP 字面量，都不合法时原样返回链首
    return parts.find((part) => isValidIPLiteral(part)) || parts[0]
  }

  // 检查是否为本地或内网 IP（public：天气等模块用它判断是否需要改用出口公网 IP 定位）
  isLocalIP(ip: string): boolean {
    if (!ip) return false

    // IPv6 本地地址
    if (ip === '::1' || ip.startsWith('::ffff:127.')) return true

    // IPv4 本地和内网地址
    if (ip === '127.0.0.1' || ip === 'localhost') return true

    // 私有网络地址段
    if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (ip.startsWith('172.')) {
      const parts = ip.split('.')
      if (parts.length >= 2) {
        const secondOctet = parseInt(parts[1], 10)
        return secondOctet >= 16 && secondOctet <= 31
      }
    }

    return false
  }

  /**
   * 探测出口公网 IP 的备用服务。数组顺序即优先级，取第一个成功的结果。
   *
   * ipip 排在最前是有意的：系统代理/分流环境（Clash 规则模式、公司代理等）下，
   * 它对国内域名的请求走直连，拿到的是本机真实出口 IP；而 ipify / icanhazip 这些
   * 海外站点会走代理节点，拿到的是机房 IP（最终把天气定位到香港/新加坡之类的机房城市）。
   */
  private static readonly PUBLIC_IP_SERVICES = [
    'https://myip.ipip.net',
    'https://api.ipify.org?format=text',
    'https://ipv4.icanhazip.com',
    'https://ifconfig.me/ip',
  ]

  /**
   * 获取本机出口公网 IP（public：本地开发/预览没有访客 IP 时，用它兜底定位）。
   *
   * 两处与稳定性直接相关的取舍：
   *   ① 并发探测 + 按固定优先级取结果。串行会让最慢的一家把整体拖到十几秒；
   *      并发只等最慢的一家。但结果必须按数组顺序挑——谁先返回就用谁的话，
   *      每次请求可能拿到不同出口 IP（代理与直连混在一起），定位会忽东忽西。
   *   ② 单次超时给到 2.5s。原来的 1s 只够「已建连」的请求，冷启动首包还要加上
   *      DNS + TLS 握手（实测首查常在 1s 上下），这正是「本地预览偶尔定位不到、
   *      退回默认城市」的来源。
   */
  async getPublicIP(): Promise<string> {
    const results = await Promise.allSettled(
      ServiceIP.PUBLIC_IP_SERVICES.map((service) => this.probePublicIP(service)),
    )

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) return result.value
    }

    return '' // 所有服务都失败时返回空字符串，由调用方决定如何降级
  }

  /** 单个探测服务：异常一律吞掉返回空串，交给 getPublicIP 按优先级挑选 */
  private async probePublicIP(service: string): Promise<string> {
    try {
      const response = await fetch(service, { signal: AbortSignal.timeout(2500) })
      if (!response.ok) return ''

      // 各家的响应格式并不统一：多数只回一个裸 IP，ipip 回的是
      // 「当前 IP：1.2.3.4  来自于：中国 江苏 无锡 移动」这种整句。
      // 统一从文本里挑第一个「合法且非内网」的 IP 字面量，就不必逐家写解析
      const text = await response.text()

      for (const token of text.match(/[0-9a-fA-F:.]{7,45}/g) || []) {
        if (isValidIPLiteral(token) && !this.isLocalIP(token)) return token
      }

      return ''
    } catch {
      return ''
    }
  }

  handle(): RouterMiddleware<'/ip'> {
    return async (ctx) => {
      let ip = this.getClientIP(ctx.request.headers) || ctx.request.ip
      const inputIp = ctx.request.url.searchParams.get('ip') || ''

      // 优先使用请求参数中的 IP。该值会被拼进上游 URL 的路径，必须先校验格式，
      // 否则可被用作路径穿越/查询注入，把本服务变成上游接口（ipinfo.io 等）的开放代理。
      if (inputIp) {
        if (!isValidIPLiteral(inputIp)) {
          ctx.response.status = 400
          ctx.response.body = Common.buildJson(null, 400, '参数 ip 不是合法的 IP 地址')
          return
        }
        ip = inputIp
      }

      // 本地/内网 IP（含「取不到 IP」）都改用本机出口公网 IP，与 /weather/local 口径一致
      if (!inputIp && (!ip || this.isLocalIP(ip))) {
        const publicIP = await this.getPublicIP()

        if (publicIP) {
          ip = publicIP
        }
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = ip
          break

        case 'markdown': {
          const data = await this.fetchIpInfo(ip)
          ctx.response.body = `# 🌐 IP 地址查询\n\n## ${ip}\n\n${data.continent ? `**洲**: ${data.continent}\n\n` : ''}${data.country ? `**国家**: ${data.country}\n\n` : ''}${data.prov ? `**省份**: ${data.prov}\n\n` : ''}${data.city ? `**城市**: ${data.city}\n\n` : ''}${data.district ? `**区县**: ${data.district}\n\n` : ''}${data.isp ? `**运营商**: ${data.isp}` : ''}`
          break
        }

        case 'json':
        default: {
          const data = await this.fetchIpInfo(ip)
          ctx.response.body = Common.buildJson(data)
          break
        }
      }
    }
  }

  /**
   * IP → 地理信息。返回前把英文省市归一化成中文（见 data/cn-geo.ts）。
   *
   * 为什么必须归一化：ip-api.com 是免费源里唯一直接返回中文省市的，但它只支持 IPv4。
   * 访客走 IPv6 时会跳过它、落到 ipinfo.io / api.ip.sb，而这两者对中国的城市名一律
   * 返回拼音（如 Jiangsu / Wuxi）。下游腾讯天气城市库只认中文，拼音名检索失败，
   * 于是定位结果被一路回退成默认城市——IPv4 访客正常、IPv6 访客永远定位不到，
   * 就是这条链路造成的。
   *
   * 归一化放在这里而不是天气模块，是为了让 /v2/ip 与 /v2/weather/local 口径一致。
   */
  async fetchIpInfo(ip: string, preferChinese = false): Promise<IpInfo> {
    const info = await this.fetchIpInfoRaw(ip, preferChinese)
    const cn = toChineseCity(info.prov, info.city)

    return { ...info, prov: cn.province || info.prov, city: cn.city || info.city }
  }

  private async fetchIpInfoRaw(ip: string, preferChinese = false): Promise<IpInfo> {
    // 多源回退：ipinfo.io（IPv4+IPv6）→ ip-api.com（IPv4 中文省市）→ ip.sb（兜底）
    const isIPv4 = ip.includes('.') && !ip.includes(':')

    // 需要中文省市的场景（天气等下游只认中文城市名）：把 ip-api.com 提到最前。
    // ipinfo 对中国 IP 常只给拼音城市名（如 Fuzhou），下游按中文检索城市会失败
    if (preferChinese && isIPv4) {
      const zh = await this.fetchByIpApi(ip)
      if (zh) return zh
    }

    // IPv6 专属优化：ipinfo 对 IPv6 的中国城市常只给到省级中心——实测该访客在无锡，
    // ipinfo 返回 Shanghai，而 ip.sb 返回 Wuxi。所以 IPv6 时先问 ip.sb；
    // 它有限流风险，失败会自动落到下面的 ipinfo 兜底，不会影响可用性
    if (!isIPv4) {
      const byIpSb = await this.fetchByIpSb(ip)
      if (byIpSb) return byIpSb
    }

    // 1. 主源：ipinfo.io —— 同时支持 IPv4/IPv6，数据准确
    try {
      const res = await fetch(`https://ipinfo.io/${ip}/json`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const d = await res.json()
        if (d && d.ip && !d.error) {
          const [lat, lng] = (d.loc || ',').split(',')
          // org 形如 "AS13335 Cloudflare, Inc."，提取运营商名
          const orgMatch = (d.org || '').match(/^AS\d+\s+(.+)$/)
          const isp = orgMatch ? orgMatch[1] : (d.org || '')
          const asMatch = (d.org || '').match(/^AS(\d+)/)
          return {
            ip,
            continent: '',
            country: d.country || '',
            zipcode: d.postal || '',
            timezone: d.timezone || '',
            accuracy: '',
            owner: '',
            isp,
            source: 'ipinfo.io',
            areacode: d.country || '',
            adcode: '',
            asnumber: asMatch ? asMatch[1] : '',
            lat: lat || '',
            lng: lng || '',
            radius: '',
            prov: d.region || '',
            city: d.city || '',
            district: '',
          }
        }
      }
    } catch {}

    // 2. 回退：ip-api.com —— 仅 IPv4，中文省市更友好
    if (isIPv4) {
      const byIpApi = await this.fetchByIpApi(ip)
      if (byIpApi) return byIpApi
    }

    // 3. 最后兜底：ip.sb
    const byIpSb = await this.fetchByIpSb(ip)
    if (byIpSb) return byIpSb

    // 全部失败：返回基础信息
    return {
      ip,
      continent: '',
      country: '',
      zipcode: '',
      timezone: '',
      accuracy: '',
      owner: '',
      isp: '',
      source: 'unknown',
      areacode: '',
      adcode: '',
      asnumber: '',
      lat: '',
      lng: '',
      radius: '',
      prov: '',
      city: '',
      district: '',
    }
  }

  // api.ip.sb：IPv4/IPv6 都支持。实测对同一 IPv6 它给出 Wuxi（正确），
  // 而 ipinfo 给出 Shanghai（省级中心，偏差明显），所以 IPv6 路径优先用它。
  // 免费调用有频率限制（约 1 次/秒），失败返回 null 由调用方继续回退
  private async fetchByIpSb(ip: string): Promise<IpInfo | null> {
    try {
      const res = await fetch(`https://api.ip.sb/geoip/${ip}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null

      const d = await res.json()
      if (!d || !d.ip) return null

      return {
        ip,
        continent: d.continent_code || '',
        country: d.country || '',
        zipcode: '',
        timezone: d.timezone || '',
        accuracy: '',
        owner: '',
        isp: d.isp || d.organization || '',
        source: 'ip.sb',
        areacode: d.country_code || '',
        adcode: '',
        asnumber: String(d.asn || ''),
        lat: String(d.latitude || ''),
        lng: String(d.longitude || ''),
        radius: '',
        prov: d.region || '',
        city: d.city || '',
        district: '',
      }
    } catch {
      return null
    }
  }

  // ip-api.com：免费源里唯一直接给中文省市（regionName/city）的，仅支持 IPv4，
  // 免费版只走 HTTP。失败返回 null，由调用方继续回退
  private async fetchByIpApi(ip: string): Promise<IpInfo | null> {
    try {
      const res = await fetch(
        `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,isp,org,as,lat,lon,timezone`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (!res.ok) return null

      const d = await res.json()
      if (!d || d.status !== 'success') return null

      const asMatch = (d.as || '').match(/^AS(\d+)/)
      return {
        ip,
        continent: '',
        country: d.country || '',
        zipcode: '',
        timezone: d.timezone || '',
        accuracy: '',
        owner: d.org || '',
        isp: d.isp || '',
        source: 'ip-api.com',
        areacode: d.countryCode || '',
        adcode: '',
        asnumber: asMatch ? asMatch[1] : (d.as || ''),
        lat: String(d.lat || ''),
        lng: String(d.lon || ''),
        radius: '',
        prov: d.regionName || '',
        city: d.city || '',
        district: '',
      }
    } catch {
      return null
    }
  }
}

interface IpInfo {
  ip: string // '222.79.47.25'
  continent: string // '亚洲'
  country: string // '中国'
  zipcode: string // '350007'
  timezone: string // 'UTC+8'
  accuracy: string // '区县'
  owner: string // '中国电信'
  isp: string // '中国电信'
  source: string // '数据挖掘'
  areacode: string // 'CN'
  adcode: string // '350104'
  asnumber: string // '4134'
  lat: string // '26.016978'
  lng: string // '119.323547'
  radius: string // '13.7621'
  prov: string // '福建省'
  city: string // '福州市'
  district: string // '仓山区'
}

export const serviceIP = new ServiceIP()
