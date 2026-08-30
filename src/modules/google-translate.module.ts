import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

// Google 翻译 Chrome 词典扩展使用的免费端点（client=dict-chrome-ex，无需 key）。
// 注：translate.googleapis.com 的 gtx/webapp 端点已全面风控（返回 Sorry 拦截页），此端点实测可用。
const apiUrl = 'https://clients5.google.com/translate_a/t'

// 支持的语言代码白名单（与前端下拉一致）
const langs = new Set([
  'auto', 'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru',
  'pt', 'it', 'ar', 'th', 'vi', 'id',
])

class ServiceGoogleTranslate {
  handle(): RouterMiddleware<'/google-translate'> {
    return async (ctx) => {
      const text = await Common.getParam('text', ctx.request, true)

      if (!text) {
        return Common.requireArguments('text', ctx.response)
      }

      const from = (await Common.getParam('from', ctx.request, true)) || 'auto'
      const to = (await Common.getParam('to', ctx.request, true)) || 'zh-CN'

      if (!langs.has(from) || !langs.has(to)) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, `不支持的语言类型，可用：${[...langs].join(' / ')}`)
        return
      }

      // Cloudflare Workers 出口 IP 会被 Google 间歇拦截（实测约 40% 失败），
      // 拦截页返回极快，快速重试 2 次可把成功率提升到 ~94%；
      // 前端 fetchWithRetry 还有 2 次外层重试兜底。
      let response: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(
            `${apiUrl}?${Common.qs({ client: 'dict-chrome-ex', sl: from, tl: to, q: text })}`,
            {
              headers: { 'User-Agent': Common.chromeUA, Accept: 'application/json' },
              signal: AbortSignal.timeout(8000),
            },
          )
          if (res.ok) {
            response = res
            break
          }
        } catch {
          // 超时/网络错误，继续重试
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300))
      }

      if (!response) {
        throw new Error('Google 翻译接口被限流，请稍后重试')
      }

      // sl=auto 时元素为 [译文, 检测语言]；显式指定 sl 时元素为纯字符串
      const raw = (await response.json()) as unknown[]
      if (!Array.isArray(raw)) {
        throw new Error('Google 翻译返回结构异常')
      }

      let detected = from
      const trans = raw
        .map((el) => {
          if (Array.isArray(el)) {
            if (el[1] && typeof el[1] === 'string') detected = el[1]
            return String(el[0] ?? '')
          }
          return String(el ?? '')
        })
        .join('')

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = trans
          break

        case 'markdown':
          ctx.response.body = `# 🔤 Google 翻译\n\n## 原文 (${detected})\n\n> ${text}\n\n## 译文 (${to})\n\n> ${trans}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson({
            source: { text, type: detected },
            target: { text: trans, type: to },
          })
          break
      }
    }
  }
}

export const serviceGoogleTranslate = new ServiceGoogleTranslate()
