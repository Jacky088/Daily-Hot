import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

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

    // SSRF 防护：仅允许 http(s)，禁止内网/回环/链路本地/元数据地址
    this.#assertSafeUrl(_url)

    const response = await fetch(_url)
    const type = response.headers.get('content-type') || ''
    const isHTML = ['text/html', 'application/xhtml+xml'].some((e) => type.includes(e))

    if (!isHTML) {
      throw new Error('目标 URL 不是一个 HTML 页面，无法解析 OG 信息')
    }

    const html = await response.text()
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

  // SSRF 防护：校验目标 URL，禁止访问内网/回环/链路本地/云元数据等敏感地址
  #assertSafeUrl(url: URL): void {
    // 仅允许 http/https 协议
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('仅支持 http/https 协议')
    }

    const host = url.hostname.toLowerCase()

    // 阻止 IPv6 回环及映射地址
    if (host === '::1' || host === '[::1]' || host.startsWith('::ffff:') || host === '[::]') {
      throw new Error('禁止访问该地址')
    }

    // 阻止主机名直接等于元数据地址（部分平台）
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'metadata') {
      throw new Error('禁止访问该地址')
    }

    // 阻止 localhost 及常见内网/私有 IP 段
    const ipMatch = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipMatch) {
      const [a, b] = ipMatch.slice(1).map(Number)
      const isLoopback = a === 127
      const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      const isLinkLocal = a === 169 && b === 254
      const isCarrierNat = a === 100 && b >= 64 && b <= 127
      if (isLoopback || isPrivate || isLinkLocal || isCarrierNat) {
        throw new Error('禁止访问内网地址')
      }
    } else if (host === 'localhost') {
      throw new Error('禁止访问内网地址')
    }
    // 非纯 IP 的域名（如 github.com）在 Workers 环境下由平台解析，此处不再做 DNS 二次校验
  }
}

export const serviceOG = new ServiceOG()
