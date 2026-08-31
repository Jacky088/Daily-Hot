import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

const FETCH_TIMEOUT_MS = 5_000 // 单次请求超时，避免慢速响应长期占用连接
const MAX_HTML_BYTES = 2 * 1024 * 1024 // HTML 最多读取 2MB，防止超大响应体耗尽内存
const MAX_REDIRECTS = 3 // 最多跟随 3 次重定向，且每一跳都重新做 SSRF 校验

// 端口白名单：仅放行默认端口与 80/443，阻断内网服务探测（22/3306/6379/8080 等）
const ALLOWED_PORTS = new Set(['', '80', '443'])

// 云厂商元数据等敏感地址（宿主机为云主机时可直读 IAM 临时凭证）
const BLOCKED_HOSTS = new Set([
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254', // AWS / Azure / OpenStack 元数据
  '169.254.170.2', // AWS ECS 任务元数据
  '100.100.100.200', // 阿里云元数据
])

class ServiceOG {
  handle(): RouterMiddleware<'/og'> {
    return async (ctx) => {
      const url = await Common.getParam('url', ctx.request, true)

      if (!url) {
        return Common.requireArguments('url', ctx.response)
      }

      try {
        const data = await this.#fetch(url)

        switch (ctx.state.encoding) {
          case 'text':
            ctx.response.body = `标题: ${data.title}\n描述: ${data.description}`
            break

          case 'markdown':
            ctx.response.body = `# 🔗 Open Graph 信息\n\n## [${data.title || '无标题'}](${url})\n\n${data.description ? `> ${data.description}\n\n` : ''}${data.image ? `![预览图](${data.image})` : '*无预览图*'}`
            break

          case 'json':
          default:
            ctx.response.body = Common.buildJson(data)
            break
        }
      } catch (e: any) {
        console.error(e)
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 500, `OG 信息解析失败: ${e.message || e}`)
      }
    }
  }

  async #fetch(url: string) {
    const link = !/^https?:\/\//i.test(url) ? `https://${url}` : url
    let _url: URL

    try {
      _url = new URL(link)
    } catch {
      throw new Error('无效的 URL')
    }

    let response: Response | undefined

    // SSRF：fetch 默认自动跟随 302，若只校验初始 URL，攻击者可用「公网域名 302 跳到
    // 169.254.169.254」绕过校验、直取云元数据。改为 manual 模式，逐跳校验后再请求下一跳。
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      this.#assertSafeUrl(_url)

      response = await fetch(_url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': Common.chromeUA, Accept: 'text/html,*/*' },
      })

      // 非 3xx 即为最终响应
      if (response.status < 300 || response.status >= 400) break

      const location = response.headers.get('location')
      if (!location) break

      let next: URL
      try {
        next = new URL(location, _url)
      } catch {
        throw new Error('重定向目标不是有效的 URL')
      }
      _url = next

      if (hop === MAX_REDIRECTS) throw new Error('重定向次数过多')
    }

    if (!response) throw new Error('请求失败')
    if (response.status >= 300 && response.status < 400) throw new Error('重定向响应无效或次数过多')

    const type = response.headers.get('content-type') || ''
    const isHTML = ['text/html', 'application/xhtml+xml'].some((e) => type.includes(e))

    if (!isHTML) {
      throw new Error('目标 URL 不是一个 HTML 页面，无法解析 OG 信息')
    }

    const html = await this.#readTextLimited(response, MAX_HTML_BYTES)
    const httpOk = response.ok // 仅在 2xx 时回退到 <title>/<meta description>，避免误取 403/404 错误页标题

    // 通用 meta 提取：匹配 <meta ... attr="value" ...> 并取出 content（兼容属性先后顺序）
    const pickMeta = (attr: string, value: string): string => {
      const tag = new RegExp(`<meta[^>]*\\s${attr}=["']${value}["'][^>]*>`, 'i').exec(html)?.[0] || ''
      return /content=["'](?<c>[^"']*)["']/i.exec(tag)?.groups?.c || ''
    }

    // 标题：og:title → twitter:title → <title>（仅 2xx）
    const titleRaw =
      pickMeta('property', 'og:title') ||
      pickMeta('name', 'twitter:title') ||
      (httpOk ? /<title[^>]*>(?<t>[^<]*)<\/title>/i.exec(html)?.groups?.t || '' : '')

    // 图片：og:image → twitter:image → itemprop="image"
    const imageRaw =
      pickMeta('property', 'og:image') ||
      pickMeta('name', 'twitter:image') ||
      (httpOk ? pickMeta('itemprop', 'image') : '')

    // 描述：og:description → meta description → twitter:description（仅 2xx）
    const descriptionRaw =
      pickMeta('property', 'og:description') ||
      (httpOk ? pickMeta('name', 'description') || pickMeta('name', 'twitter:description') : '')

    // 相对路径图片解析为绝对 URL
    const resolveUrl = (raw: string): string => {
      if (!raw) return ''
      try {
        return new URL(raw, _url).href
      } catch {
        return raw
      }
    }

    return {
      title: this.decodeHtmlEntities(titleRaw.trim()),
      image: resolveUrl(this.decodeHtmlEntities(imageRaw.trim())),
      description: this.decodeHtmlEntities(descriptionRaw.trim()),
    }
  }

  decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&cent;': '¢',
      '&pound;': '£',
      '&yen;': '¥',
      '&euro;': '€',
      '&copy;': '©',
      '&reg;': '®',
      '&sol;': '/',
      '&quest;': '?',
      '&equals;': '=',
      '&num;': '#',
      '&percnt;': '%',
      '&plus;': '+',
      '&colon;': ':',
      '&semi;': ';',
    }

    return text.replace(/&[a-z0-9]+;|&#[0-9]+;|&#x[0-9a-f]+;/gi, (match) => {
      // Named entities
      if (entities[match.toLowerCase()]) {
        return entities[match.toLowerCase()]
      }

      // Decimal numeric entities (&#123;)
      if (match.startsWith('&#') && !match.startsWith('&#x')) {
        const code = parseInt(match.slice(2, -1), 10)
        return isNaN(code) ? match : String.fromCharCode(code)
      }

      // Hexadecimal numeric entities (&#x7B;)
      if (match.startsWith('&#x')) {
        const code = parseInt(match.slice(3, -1), 16)
        return isNaN(code) ? match : String.fromCharCode(code)
      }

      return match
    })
  }

  // 流式读取并限制最大字节数，避免超大/无限响应体耗尽内存
  async #readTextLimited(response: Response, limit: number): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) return ''

    const chunks: Uint8Array[] = []
    let total = 0

    try {
      while (total < limit) {
        const { done, value } = await reader.read()
        if (done || !value) break

        chunks.push(value)
        total += value.byteLength
      }
    } finally {
      // 达到上限时取消剩余流，及时释放连接
      if (total >= limit) await reader.cancel().catch(() => {})
    }

    const merged = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }

    return new TextDecoder('utf-8').decode(merged)
  }

  // SSRF 防护：校验目标 URL，禁止访问内网/回环/链路本地/云元数据等敏感地址
  #assertSafeUrl(url: URL): void {
    // 1) 协议白名单：阻断 file://、gopher://、dict:// 等
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('仅支持 http/https 协议')
    }

    // 2) 端口白名单：阻断内网服务探测（22/3306/6379/8080 等）
    if (!ALLOWED_PORTS.has(url.port)) {
      throw new Error('禁止访问非标准端口')
    }

    // 3) 归一化主机名：WHATWG URL 会为 IPv6 保留方括号（如 [::ffff:7f00:1]），先去掉
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

    // 4) 云厂商元数据等敏感地址
    if (BLOCKED_HOSTS.has(host)) {
      throw new Error('禁止访问该地址')
    }

    // 5) localhost 及其子域
    if (host === 'localhost' || host.endsWith('.localhost')) {
      throw new Error('禁止访问内网地址')
    }

    // 6) IPv4 字面量。URL 规范已把十进制(2130706433)、八进制(0177.0.0.1)、
    //    短式(127.1) 统一归一化为点分十进制，此处只需判定点分十进制。
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      if (this.#isBlockedIPv4(host.split('.').map(Number))) {
        throw new Error('禁止访问内网地址')
      }
      return
    }

    // 7) IPv6（含 IPv4-mapped）
    if (host.includes(':')) {
      if (host === '::1' || host === '::') throw new Error('禁止访问内网地址')

      // IPv4-mapped：URL 规范会归一化为十六进制形式，如 [::ffff:127.0.0.1] → ::ffff:7f00:1
      const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
      if (mapped) {
        const hi = parseInt(mapped[1], 16)
        const lo = parseInt(mapped[2], 16)
        const octets = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255]

        if (this.#isBlockedIPv4(octets)) throw new Error('禁止访问内网地址')
        return
      }

      // fc00::/7 唯一本地地址、fe80::/10 链路本地
      if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)) {
        throw new Error('禁止访问内网地址')
      }
      return
    }

    // 8) 普通域名：Workers 无 DNS 解析能力，无法在连接前校验解析结果（DNS rebinding
    //    残余风险）。自托管（Node/Docker）如需彻底防护，应改为「先解析 IP → 校验 →
    //    再连接」的 connect-time 校验。
  }

  #isBlockedIPv4(octets: number[]): boolean {
    const [a, b] = octets

    return (
      a === 0 || // 0.0.0.0/8：Linux 上等同访问本机
      a === 10 || // 私有地址
      a === 127 || // 回环
      (a === 169 && b === 254) || // 链路本地（含 169.254.169.254 云元数据）
      (a === 172 && b >= 16 && b <= 31) || // 私有地址
      (a === 192 && b === 168) || // 私有地址
      (a === 100 && b >= 64 && b <= 127) || // 运营商级 NAT
      a >= 224 // 组播(224/4)与保留/广播地址
    )
  }
}

export const serviceOG = new ServiceOG()
