import { Common } from '../common.ts'
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
  getClientIP(requestHeaders: Headers): string {
    // Cloudflare Workers 环境下 cf-connecting-ip 由平台设置，无法被客户端伪造，优先使用
    const cfIP = requestHeaders.get('cf-connecting-ip')?.trim()
    if (cfIP) return cfIP

    // 自托管环境（Node/Bun/Deno）经过反向代理时，转发头作为回退
    // 注意：这些头可被客户端伪造，仅用于日志展示，不可用于安全决策
    const headerFields = ['x-forwarded-for', 'x-real-ip', 'x-client-ip', 'x-real-client-ip']

    for (const field of headerFields) {
      const value = requestHeaders.get(field)?.trim()

      if (value) {
        // 取逗号分隔的第一个 IP，去除空格
        const firstIP = value.split(',')[0].trim()
        if (firstIP) return firstIP
      }
    }

    return ''
  }

  // 检查是否为本地或内网 IP
  private isLocalIP(ip: string): boolean {
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

  // 获取公网 IP
  private async getPublicIP(): Promise<string> {
    try {
      // 使用多个备用服务，提高可靠性
      const services = ['https://api.ipify.org?format=text', 'https://ifconfig.me/ip', 'https://icanhazip.com']

      for (const service of services) {
        try {
          const response = await fetch(service, { signal: AbortSignal.timeout(1000) })
          if (response.ok) {
            const ip = (await response.text()).trim()
            if (ip && !this.isLocalIP(ip)) return ip
          }
        } catch {
          continue
        }
      }

      return '' // 所有服务都失败时返回空字符串
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

      // 如果是本地 IP，尝试获取公网 IP
      if (!inputIp && this.isLocalIP(ip)) {
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

  async fetchIpInfo(ip: string): Promise<IpInfo> {
    // 多源回退：ipinfo.io（IPv4+IPv6）→ ip-api.com（IPv4 中文省市）→ ip.sb（兜底）
    const isIPv4 = ip.includes('.') && !ip.includes(':')

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
      try {
        const res = await fetch(
          `http://ip-api.com/json/${ip}?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,isp,org,as,lat,lon,timezone`,
          { signal: AbortSignal.timeout(5000) },
        )
        if (res.ok) {
          const d = await res.json()
          if (d && d.status === 'success') {
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
          }
        }
      } catch {}
    }

    // 3. 最后兜底：ip.sb
    try {
      const res = await fetch(`https://api.ip.sb/geoip/${ip}`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const d = await res.json()
        if (d && d.ip) {
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
        }
      }
    } catch {}

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
