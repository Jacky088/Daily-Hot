import { app } from './src/app.ts'
import { setRuntimeEnv } from './src/runtime-env.ts'

// Cloudflare Workers 入口：把 env 灌进 runtime-env（供 config / WEIBO_COOKIE /
// BLACKLIST_IPS 等读取），再交给 Oak 处理。之前直读 process.env，线上改环境
// 变量不会生效——现在以这里传入的 env 为准。
//
// 首页走 dist 构建版：资产层默认会把 / 解析成源码版 /index.html（引用未压缩的
// /app.js），Node/Docker 那边由 static-assets 中间件优先 dist，Worker 侧拿不到
// 文件系统做同样的判断。这里用 ASSETS 绑定把两个入口路径（wrangler.toml 的
// run_worker_first 只拦这两个，其余静态文件仍由资产层直出、不过 Worker）转发到
// /dist/index.html（引用 hash 产物，压缩 + immutable 长缓存）；dist 未构建时
// （404）回退 Oak，保证站点永远有入口。
type AssetsBinding = { fetch: (req: Request | URL) => Promise<Response> }
const ENTRY_PATHS = new Set(['/', '/index.html'])

export default {
  fetch: async (request: Request, env: Record<string, string>) => {
    setRuntimeEnv(env || {})
    const url = new URL(request.url)
    const assets = (env as { ASSETS?: AssetsBinding }).ASSETS
    if (assets && ENTRY_PATHS.has(url.pathname)) {
      const dist = await assets.fetch(new URL('/dist/index.html', url.origin))
      if (dist.status !== 404) return dist
    }
    return (app.fetch as (req: Request) => Promise<Response>)(request)
  },
}
