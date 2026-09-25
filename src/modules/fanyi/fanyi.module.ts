import crypto from 'node:crypto'
import { Common } from '../../common.ts'
import { fetchUpstream, fetchUpstreamJson } from '../../fetch-upstream.ts'
import langData from './langs.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

class ServiceFanyi {
  langMap = new Map<string, { label: string; code: string; alphabet: string }>()
  // 语言表初始化 promise：handle 与 handleLangs 共用，保证只初始化一次且都能等到就绪
  #langsReady: Promise<void> | null = null

  handle(): RouterMiddleware<'/fanyi'> {
    // 冷启动时语言表尚未加载，必须等待就绪再校验——
    // 否则 langMap 为空，isLangValid 恒 false，默认 en→zh-CHS 也会 400
    this.#ensureLangs()

    return async (ctx) => {
      await this.#ensureLangs()
      const text = await Common.getParam('text', ctx.request, true)

      if (!text) {
        return Common.requireArguments('text', ctx.response)
      }

      const from = (await Common.getParam('from', ctx.request, true)) || 'auto'
      const to = (await Common.getParam('to', ctx.request, true)) || 'auto'

      if (!this.isLangValid(from, to)) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, '不支持的语言类型，请通过 /fanyi/langs 接口查询支持的语言类型')
        return
      }

      const data = await this.#fetch(text, from, to)
      const isSuccess = data.code === 0
      const responseItems = data?.translateResult?.flat() || []

      ctx.response.status = isSuccess ? 200 : 500
      const [sourceType, targetType] = data?.type?.split('2') || []

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = isSuccess ? responseItems.map((e) => e.tgt).join('') || '' : '[翻译服务异常]'
          break

        case 'markdown': {
          if (!isSuccess) {
            ctx.response.body = '# 翻译服务异常'
            break
          }
          const sourceText = responseItems.map((e) => e.src).join('') || ''
          const targetText = responseItems.map((e) => e.tgt).join('') || ''
          const sourcePronounce = responseItems.map((e) => e.srcPronounce).join('') || ''
          const targetPronounce = responseItems.map((e) => e.tgtPronounce).join('') || ''
          const sourceLang = this.langMap.get(sourceType)?.label || sourceType
          const targetLang = this.langMap.get(targetType)?.label || targetType
          ctx.response.body = `# 🌐 翻译结果\n\n## 原文 (${sourceLang})\n\n> ${sourceText}\n\n${sourcePronounce ? `*发音: ${sourcePronounce}*\n\n` : ''}## 译文 (${targetLang})\n\n> ${targetText}\n\n${targetPronounce ? `*发音: ${targetPronounce}*` : ''}`
          break
        }

        case 'json':
        default:
          ctx.response.body = isSuccess
            ? Common.buildJson({
                source: {
                  text: responseItems.map((e) => e.src).join('') || '',
                  type: sourceType,
                  type_desc: this.langMap.get(sourceType)?.label || '',
                  pronounce: responseItems.map((e) => e.srcPronounce).join('') || '',
                },
                target: {
                  text: responseItems.map((e) => e.tgt).join('') || '',
                  type: targetType,
                  type_desc: this.langMap.get(targetType)?.label || '',
                  pronounce: responseItems.map((e) => e.tgtPronounce).join('') || '',
                },
              })
            : // 原先把整个上游响应对象序列化进错误文案当「调试信息」，等于把上游数据
              // 原样透出给调用方；真实原因只进服务端日志
              Common.buildJson(null, 500, '翻译服务异常，请稍后重试')
          break
      }
    }
  }

  handleLangs(): RouterMiddleware<'/fanyi/langs'> {
    return async (ctx) => {
      // 等待语言表就绪，避免向客户端返回空列表
      await this.#ensureLangs()
      ctx.response.body = Common.buildJson(
        [...this.langMap.values()].toSorted((a, b) => a.alphabet.localeCompare(b.alphabet)),
      )
    }
  }

  isLangValid(from: string, to: string) {
    return (from === 'auto' || this.langMap.has(from)) && (to === 'auto' || this.langMap.has(to))
  }

  // 语言表只初始化一次；并发请求共享同一个 promise，全部等到就绪为止
  #ensureLangs(): Promise<void> {
    this.#langsReady ??= this.initLangs()
    return this.#langsReady
  }

  async initLangs() {
    const api = 'https://api-overmind.youdao.com/openapi/get/luna/dict/luna-front/prod/langType'

    // 初始化链路自带 catch 兜底（失败回退内置语言表）：fetchUpstream 抛错语义与裸 fetch
    // 一致（超时/5xx/解析失败都抛），这里 retry: 0 避免启动时多等一轮
    const { data = {} } = await fetchUpstreamJson<{ data?: LangApiData }>(api, { retry: 0 })
      .then((e) => e)
      .catch(() => ({ data: {} }) as { data: LangApiData })

    const value = (data as LangApiData | undefined)?.value
    const langs = [...(value?.textTranslate?.common || []), ...(value?.textTranslate?.specify || [])]

    for (const lang of langs) {
      this.langMap.set(lang.code, lang)
    }

    if (this.langMap.size <= 0) {
      const date = new Date().toLocaleString('zh-CN')

      const langs = [
        ...(langData.data.value.textTranslate.common || []),
        ...(langData.data.value.textTranslate.specify || []),
      ]

      for (const lang of langs) {
        this.langMap.set(lang.code, lang)
      }

      console.error(`[${date}] [fanyi] 语言列表初始化失败，回退到内置语言列表，共 ${langs.length} 种语言`)
    }
  }

  async #fetch(text: string, from: string, to: string) {
    function aesDecode(value: string) {
      const key = 'ydsecret://query/key/B*RGygVywfNBwpmBaZg*WT7SIOUP2T0C9WHMZN39j^DAdaZhAnxvGcCY6VYFwnHl'
      const iv = 'ydsecret://query/iv/C@lZe2YzHtZ2CYgaXKSVfsb7Y4QWHjITPPZ0nQp87fBeJ!Iv6v^6fvi2WN@bYpJ4'
      const encoder = crypto.createDecipheriv('aes-128-cbc', Common.md5(key, 'buffer'), Common.md5(iv, 'buffer'))
      return encoder.update(value, 'base64', 'utf-8') + encoder.final('utf-8')
    }

    function getCommonParams(secretKey: string) {
      const now = String(Date.now())
      return {
        sign: Common.md5(`client=fanyideskweb&mysticTime=${now}&product=webfanyi&key=${secretKey}`),
        client: 'fanyideskweb',
        product: 'webfanyi',
        appVersion: '1.0.0',
        vendor: 'web',
        pointParam: 'client,mysticTime,product',
        mysticTime: now,
        keyfrom: 'fanyi.web',
      }
    }

    async function getSecretKey() {
      // 有道 key 接口偶发 5xx：fetchUpstream 默认重试 1 次，比原来裸 fetch 稳
      const response = await fetchUpstream(
        `https://dict.youdao.com/webtranslate/key?${Common.qs({
          keyid: 'webfanyi-key-getter',
          ...getCommonParams('asdjnjfenknafdfsdfsd'),
        })}`,
      )
      const data = await response.json()
      return data?.data?.secretKey || ''
    }

    // 翻译主接口：cookie/referer/content-type 一个不能少，fetchUpstream 只补缺失的 UA
    const response = await fetchUpstream('https://dict.youdao.com/webtranslate', {
      method: 'POST',
      headers: {
        cookie: 'OUTFOX_SEARCH_USER_ID_NCOO=2100336809.6038957; OUTFOX_SEARCH_USER_ID=711138426@112.20.94.181',
        referer: 'https://fanyi.youdao.com/',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: Common.qs({
        from,
        to,
        i: text,
        dictResult: true,
        keyid: 'webfanyi',
        ...getCommonParams(await getSecretKey()),
      }),
    })

    return JSON.parse(aesDecode(await response.text())) as YoudaoData
  }
}

export const serviceFanyi = new ServiceFanyi()

/** 有道语言表接口的 value 结构（与 langs.json 内置表同形） */
interface LangApiData {
  value?: {
    textTranslate?: {
      common?: { code: string; label: string; alphabet: string }[]
      specify?: { code: string; label: string; alphabet: string }[]
    }
  }
}

interface YoudaoData {
  code: number
  dictResult: {
    ce?: {
      word: {
        trs?: {
          voice: string
          '#text': string
          '#tran': string
        }[]
        phone?: string
        'return-phrase'?: string
      }
    }
    ec?: {
      exam_type: string[]
      word: {
        usphone?: string
        ukphone?: string
        ukspeech?: string
        trs?: {
          pos: string
          tran: string
        }[]
        wfs?: {
          wf?: {
            name: string
            value: string
          }
        }[]
        'return-phrase'?: string
        usspeech?: string
      }
    }
  }
  translateResult: {
    tgt: string
    src: string
    srcPronounce?: string
    tgtPronounce?: string
  }[][]
  type: string
}
