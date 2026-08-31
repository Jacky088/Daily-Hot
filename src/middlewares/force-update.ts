import { resolveForceUpdate, runWithForceUpdate } from '../force-update-guard.ts'

import type { Middleware } from '@oak/oak'

/**
 * 解析 ?force-update 并把结果写入 AsyncLocalStorage，供下游缓存层读取。
 * 必须注册在使用缓存的业务路由之前。
 */
export function forceUpdate(): Middleware {
  return async (ctx, next) => {
    await runWithForceUpdate(resolveForceUpdate(ctx.request), next)
  }
}
