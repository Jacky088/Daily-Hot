import { app } from './src/app.ts'
import { config } from './src/config.ts'

// npm scripts 里的 `DEV=1 node ...` 是 POSIX 语法，在 Windows 的 cmd / PowerShell 下无法运行。
// 改为根据 Node 启动参数自动判定开发模式（开发脚本带 --watch），保证跨平台行为一致。
if (!process.env.DEV && process.execArgv.includes('--watch')) {
  process.env.DEV = '1'
}

console.log(`service is running at http://localhost:${config.port}`)

await app.listen({
  hostname: config.host,
  port: config.port,
})
