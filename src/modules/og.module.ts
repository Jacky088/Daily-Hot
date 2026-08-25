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

    const ogTitlePattern = /<meta property="og:title" content="(?<title>[^"]+)"\s*\/?>/i
    const ogImagePattern = /<meta property="og:image" content="(?<image>[^"]+)"\s*\/?>/i
    const ogDescriptionPattern = /<meta property="og:description" content="(?<description>[^"]+)"\s*\/?>/i

    const [titleMatch, imageMatch, descriptionMatch] = [
      ogTitlePattern.exec(html),
      ogImagePattern.exec(html),
      ogDescriptionPattern.exec(html),
    ]

    const title = this.decodeHtmlEntities(titleMatch?.groups?.title || '')
    const image = this.decodeHtmlEntities(imageMatch?.groups?.image || '')
    const description = this.decodeHtmlEntities(descriptionMatch?.groups?.description || '')

    return {
      title,
      image,
      description,
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
