# 🔥 每日热榜

> 一站看完天下事 · 基于 [60s API](https://github.com/vikiboss/60s) 构建的一站式热榜聚合面板

[![Version](https://img.shields.io/badge/version-1.4.1-blue) ](./package.json)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white) ](https://workers.cloudflare.com/)
[![EdgeOne Pages](https://img.shields.io/badge/EdgeOne%20Pages-0052FF?style=flat) ](https://edgeone.ai/pages)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) ](https://docker.com/)
[![License](https://img.shields.io/badge/license-MIT-green) ](./license)

聚合 60+ 个热门数据源，一个页面看遍全网热点。涵盖新闻资讯、科技资讯、影视娱乐、实用工具、生活信息、趣味内容和翻译，部署即用，支持 Cloudflare Workers、Docker 与 EdgeOne Pages 等多种部署方式。

## 界面预览

![界面预览](/daily-hot-preview.png)

## ✨ 功能特性

### 📰 全网热榜聚合

一个面板覆盖 60+ 个数据源，按 7 大分类组织：

| 分类 | 包含接口 |
| ---- | -------- |
| 📰 新闻资讯 | 60 秒读懂世界、微博热搜、知乎热榜、B 站热门、抖音热点、今日头条、百度热搜/电视剧/贴吧、夸克每日资讯、汽车热榜、历史上的今天、小红书 |
| 💻 科技资讯 | NodeSeek 新帖、V2EX 热帖、LowEndTalk、Hacker News、IT 资讯、酷安热榜、36 氪热榜、Reddit 热帖、少数派热榜、虎嗅热榜 |
| 🎬 影视娱乐 | 猫眼票房、百度电视剧榜、豆瓣电影周榜、Epic 免费游戏、Steam 免费游戏、网易云热歌榜/飙升榜/ACG 榜、Billboard Hot 100、歌词搜索、唱鸭 |
| 🛠️ 实用工具 | 百度百科、健康计算器、二维码生成、哈希加密、网页 OG 信息、IP 查询、WHOIS 查询、密码生成/检测、随机颜色、配色方案、化学元素 |
| 🌤️ 生活信息 | 实时天气、天气预报、汇率、油价、金价、农历信息、摸鱼日历 |
| 🎯 趣味内容 | 段子、冷笑话、一言、KFC 疯狂星期四、发病文案、今日运势、答案之书、必应壁纸、JS 题目、梗百科 |
| 🔤 翻译 | 有道翻译（支持 109 种语言下拉选择） |

### 🎨 体验设计

- **🌙 日间 / 夜间模式** — 默认夜间，一键切换，自动记忆偏好
- **🕸️ 流动网格背景** — Canvas 动态多边形网状结构，适配双主题
- **📱 移动端适配** — 触屏友好控件，响应式布局，分类导航自动滚动居中
- **🔗 链接可跳转** — 所有带原链接的数据均可点击跳转到来源页面
- **⚡ 智能加载** — 无参数接口自动加载，有参数接口提供输入控件
- **🏆 排行榜样式** — 前三名金银铜渐变色块，热度数值高亮

## 🚀 部署

### Cloudflare Workers（推荐）

```bash
git clone https://github.com/Jacky088/Daily-Hot.git
cd Daily-Hot
pnpm install
npx wrangler deploy
```

部署完成后访问 Worker 域名即可使用。

### EdgeOne Pages（Makers 全栈部署）

已内置 `edgeone.json` 与 `cloud-functions/[[default]].ts`，前端面板与 `/v2/*` API 一体部署，无需额外配置。

**方式一：CLI 部署**

```bash
npm install -g edgeone
edgeone login

npm install --no-audit --no-fund
npx edgeone makers build --mode prod    # 产出 .edgeone/（云函数 + 前端资源）
npx edgeone makers deploy .edgeone -n daily-hot
```

常用参数：`-e preview` 预览环境、`-a overseas` 海外可用区、`-t <token>` CI 免登录。

> `deploy -n` 仅适用于「直接上传」类型的项目；若项目由 Git 导入创建，请改用方式二。

**方式二：Git 仓库导入**

1. 在 [EdgeOne Pages](https://edgeone.ai/pages) 控制台「导入 Git 仓库」，选择 `Jacky088/Daily-Hot`。
2. 构建配置自动读取仓库根目录的 `edgeone.json`，保持默认即可：安装 `npm install --no-audit --no-fund`、构建 `node scripts/copy-assets.mjs`、输出目录 `.edgeone`。其中**构建命令不可省略**——平台只自动构建云函数，前端 `public/` 需由该脚本拷入 `.edgeone/assets`，否则页面全部 404。
3. 之后每次 `git push` 会自动重新构建部署。

**访问域名**：部署后控制台会给出默认域名（如 `https://daily-hot.edgeone.dev`）。「全球可用区」项目的域名带 `eo_token` 预览鉴权参数（有时效），绑定自定义域名后可免 token 长期公开访问。

### Docker

```bash
git clone https://github.com/Jacky088/Daily-Hot.git
cd Daily-Hot

# 构建镜像
docker build -t daily-hot .

# 运行容器
docker run -d \
  --restart always \
  --name daily-hot \
  -p 4399:4399 \
  daily-hot
```

访问 `http://localhost:4399` 使用面板和 API。

更新到最新版本：

```bash
git pull origin main
docker build -t daily-hot .
docker stop daily-hot && docker rm daily-hot
docker run -d \
  --restart always \
  --name daily-hot \
  -p 4399:4399 \
  daily-hot
```

### 本地开发

```bash
# Node.js (需要 v22.6+)
pnpm install
pnpm run dev          # 开发模式（--watch 热重载），端口 4399
pnpm start            # 生产模式，端口 4399

# 或直接部署到 Workers
npx wrangler deploy
```

| 命令 | 说明 |
| ---- | ---- |
| `pnpm run dev` | 开发模式，文件变更自动重启 |
| `pnpm start` | 生产模式 |
| `pnpm run typecheck` | TypeScript 类型检查（不产出文件） |
| `pnpm run verify:endpoints` | 校验前端面板引用的接口是否都在后端注册 |
| `pnpm run format` / `pnpm run lint` | Prettier 格式化 / 格式检查 |

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
| `WEIBO_COOKIE` | 内置游客 Cookie | 微博热搜接口凭证，内置值失效时注入新值 |
| `DEV` | 自动 | 开发模式，`pnpm run dev` 会自动置为 `1`，无需手动设置 |

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
│  ├ Canvas 网格背景 │            │  ├ 60+ 模块化接口     │
│  ├ 响应式布局     │  ── API ──→│  ├ 中间件链           │
│  ├ 日夜间主题     │            │  ├ 静态资源服务       │
│  └ 无框架依赖     │            │  └ 多运行时入口       │
└──────────────────┘            └──────────────────────┘
        │                                │
        ├─ Workers: [assets] 配置        ├─ Workers: cf-worker.ts
        └─ Docker: static-assets 中间件  ├─ Docker: node.ts
                                         ├─ EdgeOne: cloud-functions/[[default]].ts
                                         ├─ Deno: deno.ts
                                         └─ Bun: bun.ts
```

**技术栈：**

- **后端**：TypeScript + [Oak](https://oakserver.github.io/oak/) 框架
- **前端**：纯 HTML/CSS/JS，无框架依赖
- **数据源**：[vikiboss/60s](https://github.com/vikiboss/60s) + [60s-static-host](https://github.com/vikiboss/60s-static-host) + NodeSeek / V2EX / LowEndTalk RSS
- **部署**：Cloudflare Workers / Docker / EdgeOne Pages / Node.js / Deno / Bun

## 📋 项目结构

```
.
├── public/
│   ├── index.html          # 前端面板（单文件 HTML）
│   ├── app.js              # 前端逻辑（EPS 注册 + 渲染器）
│   ├── style.css           # 样式
│   ├── manifest.json       # PWA 配置
│   └── sw.js               # Service Worker
├── src/
│   ├── app.ts              # Oak 应用入口 + 中间件注册
│   ├── config.ts           # 环境变量配置
│   ├── common.ts           # 通用工具函数
│   ├── router.ts           # 路由集中注册
│   ├── cache.ts            # 缓存中间件
│   ├── middlewares/        # 中间件（CORS/错误处理/静态资源等）
│   └── modules/            # 60+ API 模块
│       ├── geng/            # 梗百科（打包 JSON）
│       ├── duanzi/          # 随机段子
│       ├── hitokoto/        # 一言
│       ├── fabing/          # 发病文案
│       ├── nodeseek.module.ts   # NodeSeek 新帖
│       ├── v2ex.module.ts       # V2EX 热帖
│       ├── lowendtalk.module.ts # LowEndTalk
│       └── ...
├── cf-worker.ts            # Cloudflare Workers 入口
├── node.ts                 # Node.js 入口
├── deno.ts                 # Deno 入口
├── bun.ts                  # Bun 入口
├── cloud-functions/        # EdgeOne Pages 云函数
│   └── [[default]].ts      # 全栈入口（Oak 服务，统一处理 /v2/* 与 /health）
├── edgeone.json            # EdgeOne Pages 构建配置
├── wrangler.toml           # Cloudflare Workers 配置
├── Dockerfile              # Docker 构建文件
└── package.json
```

## 🙏 致谢

本项目基于以下开源项目构建：

- **[vikiboss/60s](https://github.com/vikiboss/60s)** — 提供 40+ 个 API 接口
- **[vikiboss/60s-static-host](https://github.com/vikiboss/60s-static-host)** — 每日新闻数据源

## 🪪 License

[MIT](./license) License © 2026-PRESENT 木木
