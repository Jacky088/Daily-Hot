import { app } from './src/app.ts'
import { config } from './src/config.ts'

// npm scripts 里的 `DEV=1 node ...` 是 POSIX 语法，在 Windows 的 cmd / PowerShell 下无法运行。
// 改为根据启动参数自动判定开发模式：
//   - `--dev`：dev script 显式带的标记参数（script 参数经 argv 透传，Node/Bun/Deno 皆可靠）；
//     Node ≥22 的 `--watch` 由 watcher 父进程持有，子进程 execArgv/argv 里都看不到，检测不到
//   - `--watch`：Bun 会把它写进 execArgv（Node 不会，见上）
if (!process.env.DEV && (process.argv.includes('--dev') || process.execArgv.includes('--watch'))) {
  process.env.DEV = '1'
}

console.log(`service is running at http://localhost:${config.port}`)

await app.listen({
  hostname: config.host,
  port: config.port,
})
