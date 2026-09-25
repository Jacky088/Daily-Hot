import { env } from './runtime-env.ts'

// 所有变量经 runtime-env 读取：Workers 下读 fetch(request, env) 注入的值，
// Node / Bun / Deno 下回退到 process.env。业务代码不要直读 process.env。
//
// env() 派生的字段一律用 getter 惰性求值：Workers 下 setRuntimeEnv(env) 在
// 首个请求才执行，若在模块加载时求值（import 链触发），Dashboard 改的
// 环境变量会被 process.env 的旧快照吞掉。
export const config = {
  get host() {
    return env('HOST') || '0.0.0.0'
  },
  get port() {
    return env('PORT') ? +env('PORT')! : 4399
  },
  group: '595941841',
  author: '木木',
  github: 'https://github.com/Jacky088/Daily-Hot',
  get debug() {
    return !!env('DEBUG')
  },
  get overseas_first() {
    return !!env('OVERSEAS_FIRST')
  },
  get encodingParamName() {
    return env('ENCODING_PARAM_NAME') || 'encoding'
  },
}

export const COMMON_MSG = `获取成功。开源地址 ${config.github}，反馈群 ${config.group}。`
