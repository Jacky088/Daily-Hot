import { app } from './src/app.ts'
import { setRuntimeEnv } from './src/runtime-env.ts'

// Cloudflare Workers 入口：把 env 灌进 runtime-env（供 config / WEIBO_COOKIE /
// BLACKLIST_IPS 等读取），再交给 Oak 处理。之前直读 process.env，线上改环境
// 变量不会生效——现在以这里传入的 env 为准。
export default {
  fetch: (request: Request, env: Record<string, string>) => {
    setRuntimeEnv(env || {})
    return (app.fetch as (req: Request) => Promise<Response>)(request)
  },
}
