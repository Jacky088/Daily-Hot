import { Router } from '@oak/oak/router'
import { Common } from './common.ts'

import type { Middleware } from '@oak/oak'

// ============ 路由懒加载 ============
// router.ts 之前在顶部一次性 import 全部 70+ 模块，把 cheerio / fontkit /
// tyme4ts / chinese-days / whois-raw 这些重依赖全拉进启动路径。
// 实测 Node 下 eager import 整份路由表约 12.5s；Workers 冷启动同样要为
// 一次只命中 1 个接口的请求付出全量加载代价。
//
// 这里按「实例化成本」分组做动态 import：
//   - light：纯逻辑 / JSON 本地数据 / fetchUpstream 轻链路，随路由表一起 eager 加载，
//     保持原有行为（聚合页 7 源与常用榜单都在这里，开销可忽略）。
//   - heavy-*：命中时再 import（cheerio 抓页 / tyme4ts-chinese-days 日历 /
//     fontkit-yaqrcode-whois 原生依赖 / 其余低频 I/O）。
//
// 约束（verify-endpoints.ts 靠正扫注册语句保证前后端一致）：
//   - 所有 appRouter.get/all 调用必须保留字面量路径（不得变量拼接），否则脚本扫不到。
//   - lazy 的 factory 不得在模块顶层执行，只能在请求命中时执行。

export const rootRouter = new Router()

// 图片代理：豆瓣图片有 Referer 防盗链，浏览器无法伪造跨域 Referer，
// 由服务端带豆瓣站内 Referer 拉图后同源透传（白名单仅豆瓣图片域）
rootRouter.get(
  '/img',
  lazyFn(() => import('./modules/img-proxy.module.ts').then((m) => m.handleImgProxy)),
)

// 兜底：正常情况下 / 由 wrangler [assets] 或 staticAssets 中间件返回 index.html，
// 只有在 public 目录缺失时才会走到这里，返回接口清单便于排查。
rootRouter.get('/', (ctx) => {
  ctx.response.headers.set('Content-Type', 'application/json; charset=utf-8')
  const endpoints = Array.from(appRouter.entries(), ([_, v]) => v.path)
  ctx.response.body = JSON.stringify({ ...Common.getApiInfo(), endpoints }, null, 2)
})

rootRouter.get('/health', (ctx) => {
  ctx.response.body = 'ok'
})

rootRouter.get('/endpoints', (ctx) => {
  ctx.response.headers.set('Content-Type', 'application/json; charset=utf-8')
  ctx.response.body = Array.from(appRouter.entries(), ([_, v]) => v.path)
})

export const appRouter = new Router({
  prefix: '/v2',
})

/**
 * 把「模块加载」推迟到路由命中时。
 * 缓存的是 factory 的 Promise 而非结果：首次并发命中同一 lazy 路由时，
 * 所有请求共享同一次 import（缓存结果的话 factory 会执行多次）；
 * 失败不缓存（清掉 pending），下次请求重试，避免瞬时故障被固化。
 * 工厂内部禁止做除 import 之外的副作用；service 实例化（如 new GoldPriceService()）
 * 同样推迟到首次命中时，与原来「启动即 new」相比只是时机变化。
 *
 * 类型说明：各模块导出的是窄泛型 RouterMiddleware<'/path'>（要求 RouterContext，
 * 带 params/captures），不能直接 widen 成顶层 Middleware（只保证 Context）。
 * 这里用 unknown 中转做一次适配：运行时期望的调用约定完全一致
 * （(ctx, next) => promise），只是静态类型层面桥接一下。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (ctx: any, next: any) => Promise<unknown> | unknown

function lazyFn(factory: () => Promise<AnyHandler>): Middleware {
  let pending: Promise<AnyHandler> | null = null
  return async (ctx, next) => {
    const p = (pending ||= factory())
    try {
      const handler = await p
      return handler(ctx, next)
    } catch (e) {
      if (pending === p) pending = null
      throw e
    }
  }
}

/** service 工厂风格：() => import(...).then(m => m.serviceX.handle(...))，与 lazyFn 同实现 */
const lazyService = lazyFn

// === 以下为已发布的正式接口 ===

// --- light 组：eager 加载（聚合页 7 源 + 常用榜单，开销可忽略） ---
import { serviceWeibo } from './modules/weibo.module.ts'
import { serviceZhihu } from './modules/zhihu.module.ts'
import { serviceDouyin } from './modules/douyin.module.ts'
import { serviceToutiao } from './modules/toutiao.module.ts'
import { serviceBaidu } from './modules/baidu.module.ts'
import { serviceBili } from './modules/bili.module.ts'
import { serviceIfeng } from './modules/ifeng.module.ts'
import { serviceHotAggregate } from './modules/hot-aggregate.module.ts'
import { serviceHupu } from './modules/hupu.module.ts'
import { serviceV2ex } from './modules/v2ex.module.ts'
import { service36Kr } from './modules/kr36.module.ts'
import { serviceJuejin } from './modules/juejin.module.ts'
import { serviceSspai } from './modules/sspai.module.ts'
import { serviceHuxiu } from './modules/huxiu.module.ts'
import { serviceRednote } from './modules/rednote.module.ts'
import { serviceDongchedi } from './modules/dongchedi.module.ts'
import { serviceNodeSeek } from './modules/nodeseek.module.ts'
import { serviceLowEndTalk } from './modules/lowendtalk.module.ts'
import { serviceReddit } from './modules/reddit.module.ts'
import { serviceYoutube } from './modules/youtube.module.ts'
import { serviceAppleMusic } from './modules/applemusic.module.ts'
import { serviceQQMusic } from './modules/qqmusic.module.ts'
import { serviceNcm } from './modules/ncm.module.ts'
import { serviceKuan } from './modules/kuan.module.ts'
import { serviceQuark } from './modules/quark.module.ts'
import { serviceHackerNews } from './modules/hacker-news.module.ts'
import { serviceIP } from './modules/ip.module.ts'
import { serviceWeather } from './modules/weather.module.ts'
import { serviceEpic } from './modules/epic.module.ts'
import { serviceSteam } from './modules/steam.module.ts'
import { serviceExRate } from './modules/exchange-rate.module.ts'
import { serviceOG } from './modules/og.module.ts'
import { serviceHash } from './modules/hash.module.ts'
import { serviceFanyi } from './modules/fanyi/fanyi.module.ts'
import { serviceGoogleTranslate } from './modules/google-translate.module.ts'
import { serviceLyric } from './modules/lyric.module.ts'
import { serviceDailyEng } from './modules/daily-eng/daily-eng.module.ts'
import { serviceSimkl } from './modules/simkl/simkl.module.ts'
import { serviceQQ } from './modules/qq.module.ts'
import { serviceHealth } from './modules/health.module.ts'
import { servicePassword } from './modules/password/password.module.ts'
import { serviceColor } from './modules/color.module.ts'

appRouter.get('/weibo', serviceWeibo.handle())
appRouter.get('/zhihu', serviceZhihu.handle())
appRouter.get('/douyin', serviceDouyin.handle())
appRouter.get('/toutiao', serviceToutiao.handle())
// 全网热榜聚合：把微博/知乎/抖音/头条/百度/B站 合并成一条可比榜单（前端「今日热榜」首页）
appRouter.get('/hot/aggregate', serviceHotAggregate.handle())
// 虎扑热榜：虎扑自身无可用公开接口，走 uapis 聚合源
appRouter.get('/hupu', serviceHupu.handle())
appRouter.get('/baidu/hot', serviceBaidu.handleHotSearch())
appRouter.get('/baidu/teleplay', serviceBaidu.handleTeleplay())
appRouter.get('/baidu/movie', serviceBaidu.handleMovie())
appRouter.get('/baidu/tieba', serviceBaidu.handleTieba())
appRouter.get('/bili', serviceBili.handle())
// 凤凰热榜：无开放接口，取热榜页内联的 JSON（见模块内注释）
appRouter.get('/ifeng', serviceIfeng.handle())
// 技术社区热榜：掘金（官方 API）、GitHub Trending（抓页 + 搜索接口兜底）、51CTO 博客榜（抓页）
appRouter.get('/juejin', serviceJuejin.handle())
// 51CTO 抓页解析依赖 cheerio，命中时再加载
appRouter.get(
  '/51cto',
  lazyService(() => import('./modules/cto51.module.ts').then((m) => m.serviceCTO51.handle())),
)
appRouter.get('/36kr', service36Kr.handle())
appRouter.get('/nodeseek', serviceNodeSeek.handle())
appRouter.get('/v2ex', serviceV2ex.handle())
appRouter.get('/lowendtalk', serviceLowEndTalk.handle())
appRouter.get('/reddit', serviceReddit.handle())
appRouter.get('/sspai', serviceSspai.handle())
appRouter.get('/huxiu', serviceHuxiu.handle())
appRouter.get('/rednote', serviceRednote.handle())
appRouter.get('/dongchedi', serviceDongchedi.handle())
// IT之家抓页解析依赖 cheerio，命中时再加载
appRouter.get(
  '/it-news',
  lazyService(() => import('./modules/it-news.module.ts').then((m) => m.serviceITNews.handle())),
)
appRouter.get(
  '/it-news/rank',
  lazyService(() => import('./modules/it-news.module.ts').then((m) => m.serviceITNews.handleRank())),
)
// YouTube 热榜：官方 API 要 Key，走 Invidious / Piped 社区实例多实例兜底（见模块内注释）
appRouter.get('/youtube', serviceYoutube.handle())
// 音乐榜：Apple Music 官方公开 RSS（免密钥）、QQ 音乐站点榜单接口（免登录，需 Referer）
appRouter.get('/apple-music', serviceAppleMusic.handle())
appRouter.get('/qq-music', serviceQQMusic.handle())
appRouter.get('/ncm-rank/list', serviceNcm.handleRank())
appRouter.get('/ncm-rank/:id', serviceNcm.handleRankDetail())
appRouter.get('/kuan', serviceKuan.handle())
appRouter.get('/quark', serviceQuark.handle())
appRouter.get('/hacker-news/new', serviceHackerNews.handle('top'))
appRouter.get('/hacker-news/top', serviceHackerNews.handle('top'))
appRouter.get('/hacker-news/best', serviceHackerNews.handle('best'))
appRouter.get('/ip', serviceIP.handle())
appRouter.get('/weather/realtime', serviceWeather.handle())
appRouter.get('/weather/forecast', serviceWeather.handleForecast())
// 按访客 IP 自动定位的实时天气（Hero 卡「今日天气」用，免传城市）
appRouter.get('/weather/local', serviceWeather.handleLocal())
appRouter.get('/epic', serviceEpic.handle())
appRouter.get('/steam', serviceSteam.handle())
appRouter.get('/exchange-rate', serviceExRate.handle())
// whois 查询依赖 whois-raw（原生模块），命中时再加载
appRouter.get(
  '/whois',
  lazyService(() => import('./modules/whois.module.ts').then((m) => m.serviceWhois.handle())),
)
// === 以下为支持 body 解析参数的接口 ===
appRouter.all('/og', serviceOG.handle())
appRouter.all('/hash', serviceHash.handle())
appRouter.all('/fanyi', serviceFanyi.handle())
appRouter.all('/fanyi/langs', serviceFanyi.handleLangs())
appRouter.all('/google-translate', serviceGoogleTranslate.handle())
appRouter.all('/lyric', serviceLyric.handle())
// 油价抓页解析依赖 cheerio，命中时再加载
appRouter.all(
  '/fuel-price',
  lazyService(() => import('./modules/fuel-price/fuel-price.module.ts').then((m) => m.serviceFuelPrice.handle())),
)
appRouter.get('/daily-eng', serviceDailyEng.handle())
appRouter.get('/simkl-trending', serviceSimkl.handle())
appRouter.get('/health', serviceHealth.handle())
appRouter.get('/password', servicePassword.handle())
appRouter.get('/password/check', servicePassword.handleCheck())
appRouter.get('/color/random', serviceColor.handle())
appRouter.get('/color/palette', serviceColor.handlePalette())

// === 以下为测试接口，beta 前缀，接口可能不稳定 ===
appRouter.get('/beta/kuan', serviceKuan.handle())
appRouter.get('/beta/qq/profile', serviceQQ.handle())

// === 以下接口为兼容保留，未来大版本移除 ===
appRouter.get('/exchange_rate', serviceExRate.handle())
appRouter.get('/baidu/realtime', serviceBaidu.handleHotSearch())
appRouter.get('/weather', serviceWeather.handle())
appRouter.get('/ncm-rank', serviceNcm.handleRank())
appRouter.get('/color', serviceColor.handle())

// --- heavy-cheerio 组：抓页解析（cheerio），命中时再加载 ---
appRouter.get(
  '/ai-news',
  lazyService(() => import('./modules/ai-news.module.ts').then((m) => m.serviceAINews.handle())),
)
appRouter.get(
  '/github-trending',
  lazyService(() => import('./modules/github-trending.module.ts').then((m) => m.serviceGithubTrending.handle())),
)
appRouter.get(
  '/world-news',
  lazyService(() => import('./modules/world-news.module.ts').then((m) => m.serviceWorldNews.handle())),
)
appRouter.get(
  '/gold-price',
  lazyService(() => import('./modules/gold-price.module.ts').then((m) => new m.GoldPriceService().handle())),
)

// --- heavy-cal 组：日历/节气（tyme4ts、chinese-days） ---
appRouter.get(
  '/60s',
  lazyService(() => import('./modules/60s.module.ts').then((m) => m.service60s.handle())),
)
appRouter.get(
  '/60s/rss',
  lazyService(() => import('./modules/60s-rss.module.ts').then((m) => m.service60sRss.handle())),
)
appRouter.get(
  '/lunar',
  lazyService(() => import('./modules/lunar/lunar.module.ts').then((m) => m.serviceLunar.handle())),
)
appRouter.get(
  '/lunar/calendar',
  lazyService(() => import('./modules/lunar/lunar.module.ts').then((m) => m.serviceLunar.handleCalendar())),
)
appRouter.get(
  '/moyu',
  lazyService(() => import('./modules/moyu.module.ts').then((m) => m.serviceMoyu.handle())),
)
appRouter.get(
  '/today-in-history',
  lazyService(() => import('./modules/today-in-history.module.ts').then((m) => m.serviceTodayInHistory.handle())),
)
appRouter.get(
  '/today_in_history',
  lazyService(() => import('./modules/today-in-history.module.ts').then((m) => m.serviceTodayInHistory.handle())),
)

// --- heavy-binary 组：字体/二维码（fontkit、yaqrcode） ---
appRouter.get(
  '/maoyan/all/movie',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleAllMovie())),
)
appRouter.get(
  '/maoyan/showing',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleShowing())),
)
appRouter.get(
  '/maoyan/coming',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleComing())),
)
appRouter.get(
  '/maoyan/realtime/movie',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleRealtime('movie'))),
)
appRouter.get(
  '/maoyan/realtime/tv',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleRealtime('tv'))),
)
appRouter.get(
  '/maoyan/realtime/web',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleRealtime('web'))),
)
appRouter.get(
  '/maoyan',
  lazyService(() => import('./modules/maoyan/maoyan.module.ts').then((m) => m.serviceMaoyan.handleAllMovie())),
)
appRouter.get(
  '/qrcode',
  lazyService(() => import('./modules/qrcode/qrcode.module.ts').then((m) => m.serviceQRCode.handle())),
)

// --- heavy-rest 组：其余带上游 I/O / 本地 JSON，命中时加载 ---
appRouter.get(
  '/answer',
  lazyService(() => import('./modules/answer/answer.module.ts').then((m) => m.serviceAnswer.handle())),
)
appRouter.get(
  '/baike',
  lazyService(() => import('./modules/baike.module.ts').then((m) => m.serviceBaike.handle())),
)
appRouter.get(
  '/bing',
  lazyService(() => import('./modules/bing.module.ts').then((m) => m.serviceBing.handle())),
)
// 往日壁纸列表（含今日）：供 /wallpaper.html 幻灯片页使用
appRouter.get(
  '/bing/history',
  lazyService(() => import('./modules/bing.module.ts').then((m) => m.serviceBing.handleHistory())),
)
appRouter.get(
  '/changya',
  lazyService(() => import('./modules/changya.module.ts').then((m) => m.serviceChangYa.handle())),
)
appRouter.get(
  '/duanzi',
  lazyService(() => import('./modules/duanzi/duanzi.module.ts').then((m) => m.serviceDuanzi.handle())),
)
appRouter.get(
  '/fabing',
  lazyService(() => import('./modules/fabing/fabing.module.ts').then((m) => m.serviceFabing.handle())),
)
appRouter.get(
  '/geng',
  lazyService(() => import('./modules/geng/geng.module.ts').then((m) => m.serviceGeng.handle())),
)
appRouter.get(
  '/hitokoto',
  lazyService(() => import('./modules/hitokoto/hitokoto.module.ts').then((m) => m.serviceHitokoto.handle())),
)
appRouter.get(
  '/kfc',
  lazyService(() => import('./modules/kfc.module.ts').then((m) => m.serviceKfc.handle())),
)
appRouter.get(
  '/luck',
  lazyService(() => import('./modules/luck/luck.module.ts').then((m) => m.serviceLuck.handle())),
)
appRouter.get(
  '/awesome-js',
  lazyService(() => import('./modules/awesome-js/awesome-js.module.ts').then((m) => m.serviceAwesomeJs.handle())),
)
appRouter.get(
  '/dad-joke',
  lazyService(() => import('./modules/dad-joke/dad-joke.module.ts').then((m) => m.serviceDadJoke.handle())),
)
appRouter.get(
  '/douban/weekly/movie',
  lazyService(() => import('./modules/douban-weekly.module.ts').then((m) => m.serviceDoubanWeekly.handle('movie'))),
)
appRouter.get(
  '/douban/weekly/tv_chinese',
  lazyService(() =>
    import('./modules/douban-weekly.module.ts').then((m) => m.serviceDoubanWeekly.handle('tv_chinese')),
  ),
)
appRouter.get(
  '/douban/weekly/tv_global',
  lazyService(() => import('./modules/douban-weekly.module.ts').then((m) => m.serviceDoubanWeekly.handle('tv_global'))),
)
appRouter.get(
  '/douban/weekly/show_chinese',
  lazyService(() =>
    import('./modules/douban-weekly.module.ts').then((m) => m.serviceDoubanWeekly.handle('show_chinese')),
  ),
)
appRouter.get(
  '/douban/weekly/show_global',
  lazyService(() =>
    import('./modules/douban-weekly.module.ts').then((m) => m.serviceDoubanWeekly.handle('show_global')),
  ),
)
appRouter.get(
  '/olympics',
  lazyService(() => import('./modules/olympics/olympics.module.ts').then((m) => m.olympicsService.handle())),
)
appRouter.get(
  '/olympics/events',
  lazyService(() => import('./modules/olympics/olympics.module.ts').then((m) => m.olympicsService.handleEventList())),
)

// === 以下为待定接口，还在计划、开发中 ===
// appRouter.get('/slacking-calendar', serviceSlackingCalendar.handle())
