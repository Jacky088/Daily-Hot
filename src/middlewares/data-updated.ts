import { getDataTs, runWithDataTs } from '../cache.ts'

import type { Middleware } from '@oak/oak'

/**
 * 把「本次响应所用数据的时间戳」透出到响应头 X-Data-Updated。
 *
 * 为什么要这个头：前端卡片上的「x 分钟前」「更新于」如果用用户打开页面的时间，
 * 会把服务端缓存了几分钟的数据显示成「刚刚」，掩盖数据的真实陈旧程度。
 * 有了这个头，前端展示的就是数据实际的抓取/缓存时刻。
 *
 * 未走过缓存层的接口（即抓即用，如 whois）不会带这个头，前端退回本地时刻即可。
 * 与 force-update 同为空 AsyncLocalStorage 上下文的载体，必须注册在业务路由之前。
 */
export function dataUpdated(): Middleware {
  return async (ctx, next) => {
    await runWithDataTs(async () => {
      await next()

      const ts = getDataTs()
      if (ts) ctx.response.headers.set('X-Data-Updated', String(ts))
    })
  }
}
