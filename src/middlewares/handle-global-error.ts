import { Common } from '../common.ts'

import type { Middleware } from '@oak/oak'

export function handleGlobalError(): Middleware {
  return async (ctx, next) => {
    try {
      await next()
    } catch (err: any) {
      const isJSON = !ctx.state.encoding || ctx.state.encoding === 'json'
      // 仅在服务端日志记录完整错误，避免向前端泄露内部信息
      console.error(err)

      ctx.response.status = 500
      ctx.response.body = isJSON ? Common.buildJson(null, 500, '服务器内部错误，请稍后重试') : '服务器内部错误，请稍后重试'
    }
  }
}
