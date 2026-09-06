import { Buffer } from 'node:buffer'
import { Common } from '../../common.ts'
import qrcode, { type Params } from 'yaqrcode'

import type { RouterMiddleware } from '@oak/oak'

class ServiceQRCode {
  handle(): RouterMiddleware<'/qrcode'> {
    return async (ctx) => {
      const text = await Common.getParam('text', ctx.request)

      if (!text) {
        return Common.requireArguments('text', ctx.response)
      }

      // text 长度上限：二维码单码有容量上限（约 2953 字节 @ L 级），
      // 超长文本还会让 yaqrcode 从 typeNumber 1 一路重试到 40，白白消耗 CPU
      if (text.length > 1024) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, '内容长度不能超过 1024 个字符')
        return
      }

      const size = await Common.getParam('size', ctx.request)
      const level = await Common.getParam('level', ctx.request)
      const type = await Common.getParam('type', ctx.request)

      // size 钳制到 64-1024：生成器按 size² 逐像素绘制并分配 GIF 缓冲，
      // 未钳制的超大值（如 100000）会让单个请求耗尽内存/CPU（DoS）
      let sizeNum = size ? Number.parseInt(size) : 256
      if (Number.isNaN(sizeNum)) sizeNum = 256
      sizeNum = Math.min(Math.max(sizeNum, 64), 1024)

      // 纠错级别白名单，避免任意字符串透传给生成器
      const levelUpper = (level || 'M').toUpperCase() as 'L' | 'M' | 'Q' | 'H'
      if (!['L', 'M', 'Q', 'H'].includes(levelUpper)) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, '参数 level 必须是 L / M / Q / H 之一')
        return
      }

      // typeNumber 有效范围 1-40，非法值忽略走自动升档
      const typeNumRaw = type ? Number.parseInt(type) : NaN
      const typeNumber =
        Number.isInteger(typeNumRaw) && typeNumRaw >= 1 && typeNumRaw <= 40
          ? (typeNumRaw as Params['typeNumber'])
          : undefined

      const dataURI = qrcode(text, {
        size: sizeNum,
        errorCorrectLevel: levelUpper,
        typeNumber,
      })

      const rawBase64 = dataURI.split(',')[1] || ''

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = rawBase64
          break
        }

        case 'markdown': {
          ctx.response.body = `# 📱 二维码生成\n\n**内容**: ${text}\n\n**尺寸**: ${sizeNum}px\n\n**纠错级别**: ${levelUpper}\n\n![QR Code](${dataURI})`
          break
        }

        case 'json': {
          ctx.response.body = Common.buildJson({
            mime_type: 'image/gif',
            text: text,
            base64: rawBase64,
            data_uri: dataURI,
          })
          break
        }

        case 'image':
        default: {
          ctx.response.headers.set('Content-Type', 'image/gif')
          ctx.response.body = Buffer.from(rawBase64, 'base64')
          break
        }
      }
    }
  }
}

export const serviceQRCode = new ServiceQRCode()
