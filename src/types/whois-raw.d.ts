// whois-raw 未随包提供类型声明，官方也没有 @types 包。
// 这里只声明项目实际用到的那一个 API（lookup），避免整个模块退化成隐式 any。
declare module 'whois-raw' {
  export interface LookupOptions {
    /** 跟随重定向的跳数或开关 */
    follow?: number | boolean
    /** 单次查询超时（毫秒） */
    timeout?: number
    [key: string]: unknown
  }

  export type LookupCallback = (err: Error | null, data: string) => void

  export function lookup(domain: string, options: LookupOptions, callback: LookupCallback): void
  export function lookup(domain: string, callback: LookupCallback): void

  const whois: { lookup: typeof lookup }
  export default whois
}
