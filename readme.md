# 🔥 每日热榜

> 一站看完天下事 · 基于 [60s API](https://github.com/vikiboss/60s) 构建的一站式热榜聚合面板

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white) ](https://workers.cloudflare.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) ](https://docker.com/)
[![License](https://img.shields.io/badge/license-MIT-green) ](./license)

聚合 40+ 个热门数据源，一个页面看遍全网热点。涵盖新闻资讯、影视娱乐、实用工具、生活信息、趣味内容和翻译，部署即用，支持 Cloudflare Workers 和 Docker。

## ✨ 功能特性

### 📰 全网热榜聚合

一个面板覆盖 40+ 个数据源，按 6 大分类组织：

| 分类 | 包含接口 |
| ---- | -------- |
| 📰 新闻资讯 | 60 秒读懂世界、微博热搜、知乎热榜、B 站热门、抖音热点、今日头条、百度热搜/电视剧/贴吧、豆瓣电影周榜、Hacker News、IT 资讯、AI 新闻、历史上的今天、小红书 |
| 🎬 影视娱乐 | 猫眼票房、Epic 免费游戏、网易云排行榜、歌词搜索、唱鸭、摸鱼日历 |
| 🛠️ 实用工具 | 二维码生成、哈希加密、网页 OG 信息、IP 查询、WHOIS 查询、密码生成/检测、随机颜色、配色方案、化学元素 |
| 🌤️ 生活信息 | 实时天气、天气预报、汇率、油价、金价、农历信息 |
| 🎯 趣味内容 | 段子、冷笑话、一言、KFC 疯狂星期四、发病文案、今日运势、答案之书、必应壁纸、JS 题目、夸克网盘资源 |
| 🔤 翻译 | 有道翻译（支持 109 种语言下拉选择） |

### 🎨 体验设计

- **🌙 日间 / 夜间模式** — 默认夜间，一键切换，自动记忆偏好
- **🕸️ 流动网格背景** — Canvas 动态多边形网状结构，适配双主题
- **📱 移动端适配** — 触屏友好控件，响应式布局，分类导航自动滚动居中
- **🔗 链接可跳转** — 所有带原链接的数据均可点击跳转到来源页面
- **⚡ 智能加载** — 无参数接口自动加载，有参数接口提供输入控件
- **🏆 排行榜样式** — 前三名金银铜渐变色块，热度数值高亮
- **🔄 刷新记忆** — F5 刷新停留在当前分类，不会跳回首页

## 🚀 部署

### Cloudflare Workers（推荐）

```bash
git clone <your-repo-url>
cd daily-hot
npm install
npx wrangler deploy
```

部署完成后访问 Worker 域名即可使用。静态前端通过 `wrangler.toml` 的 `[assets]` 配置自动服务，API 请求由 Worker 脚本处理。

### Docker

```bash
docker run -d \
  --restart always \
  --name daily-hot \
  -p 4399:4399 \
  daily-hot:latest
```

访问 `http://localhost:4399` 使用面板和 API。Docker 模式通过内置 `static-assets` 中间件服务前端页面，开箱即用。

### 本地开发

```bash
# Node.js (需要 v22.6+)
npm install
npm run dev          # 开发模式，端口 4398
npm start            # 生产模式，端口 4398

# 或直接部署到 Workers
npx wrangler deploy
```

## ⚙️ 配置

所有环境变量均为**可选**，不设置也能正常运行：

| 变量名 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `PORT` | `4399` | 监听端口（仅 Docker / Node 模式） |
| `HOST` | `0.0.0.0` | 监听地址（仅 Docker / Node 模式） |
| `DEBUG` | `false` | 开启调试日志 |
| `OVERSEAS_FIRST` | `false` | CDN 优先级（`true` 海外优先） |
| `ENCODING_PARAM_NAME` | `encoding` | 响应格式参数名 |
| `BLACKLIST_IPS` | `[]` | IP 黑名单，JSON 字符串格式 |

## 📡 API 使用

部署后，根路径 `/` 返回前端面板，`/v2/*` 返回 API 数据。

```bash
# 60 秒读懂世界（JSON，默认）
curl "https://your-domain/v2/60s"

# 纯文本格式
curl "https://your-domain/v2/60s?encoding=text"

# 微博热搜
curl "https://your-domain/v2/weibo"

# 实时天气
curl "https://your-domain/v2/weather/realtime?city=北京"

# 查看全部接口列表
curl "https://your-domain/endpoints"
```

所有接口支持 `encoding=json`（默认）/ `text` / `markdown` 三种返回格式。

## 🏗️ 技术架构

```
前端面板                          后端 API
┌──────────────────┐            ┌──────────────────────┐
│  单页 HTML/CSS/JS │            │  Oak Framework (TS)   │
│  ├ Canvas 网格背景 │            │  ├ 40+ 模块化接口     │
│  ├ 响应式布局     │  ── API ──→│  ├ 中间件链           │
│  ├ 日夜间主题     │            │  ├ 静态资源服务       │
│  └ 无框架依赖     │            │  └ 多运行时入口       │
└──────────────────┘            └──────────────────────┘
        │                                │
        ├─ Workers: [assets] 配置        ├─ Workers: cf-worker.ts
        └─ Docker: static-assets 中间件  ├─ Docker: node.ts
                                         ├─ Deno: deno.ts
                                         └─ Bun: bun.ts
```

**技术栈：**

- **后端**：TypeScript + [Oak](https://oakserver.github.io/oak/) 框架
- **前端**：纯 HTML/CSS/JS，无框架依赖
- **数据源**：[vikiboss/60s](https://github.com/vikiboss/60s) + [60s-static-host](https://github.com/vikiboss/60s-static-host)
- **部署**：Cloudflare Workers / Docker / Node.js / Deno / Bun

## 📋 项目结构

```
.
├── public/
│   └── index.html          # 前端面板（单文件，含全部 UI 逻辑）
├── src/
│   ├── app.ts              # Oak 应用入口 + 中间件注册
│   ├── config.ts           # 环境变量配置
│   ├── common.ts           # 通用工具函数
│   ├── router.ts           # 路由集中注册
│   ├── middlewares/        # 中间件（CORS/错误处理/静态资源等）
│   └── modules/            # 40+ API 模块
├── cf-worker.ts            # Cloudflare Workers 入口
├── node.ts                 # Node.js 入口
├── deno.ts                 # Deno 入口
├── bun.ts                  # Bun 入口
├── wrangler.toml           # Cloudflare Workers 配置
├── Dockerfile              # Docker 构建文件
└── package.json
```

## 🙏 致谢

本项目基于以下开源项目构建：

- **[vikiboss/60s](https://github.com/vikiboss/60s)** — 提供 40+ 个 API 接口
- **[vikiboss/60s-static-host](https://github.com/vikiboss/60s-static-host)** — 每日新闻数据源（Gemini 大模型抓取）

## 🪪 License

[MIT](./license) License © 2022-PRESENT 木木
