import { Application } from '@oak/oak/application'

import { appRouter, rootRouter } from './router.ts'

import { cors } from './middlewares/cors.ts'
import { notFound } from './middlewares/not-found.ts'
import { favicon } from './middlewares/favicon.ts'
import { debug } from './middlewares/debug.ts'
import { blacklist } from './middlewares/blacklist.ts'
import { rateLimit } from './middlewares/rate-limit.ts'
import { encoding } from './middlewares/encoding.ts'
import { forceUpdate } from './middlewares/force-update.ts'
import { handleGlobalError } from './middlewares/handle-global-error.ts'
import { staticAssets } from './middlewares/static-assets.ts'

export const app = new Application()

app.use(handleGlobalError())
// forceUpdate 需在业务路由前注册，它把标志写入 AsyncLocalStorage 供缓存层读取
app.use(blacklist(), debug(), cors(), favicon(), encoding(), forceUpdate(), rateLimit())

app.use(staticAssets())

app.use(rootRouter.routes(), rootRouter.allowedMethods())
app.use(appRouter.routes(), appRouter.allowedMethods())

app.use(notFound())
