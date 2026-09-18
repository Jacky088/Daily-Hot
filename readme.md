# 🔥 每日热榜

> 一站看完天下事 · 一个页面看遍全网热点

[![Version](https://img.shields.io/badge/version-1.15.0-blue) ](./package.json)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white) ](https://workers.cloudflare.com/)
[![EdgeOne Pages](https://img.shields.io/badge/EdgeOne%20Pages-0052FF?style=flat) ](https://edgeone.ai/pages)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) ](https://docker.com/)
[![License](https://img.shields.io/badge/license-MIT-green) ](./license)

聚合 70+ 个热门数据源，一个页面看遍全网热点。涵盖新闻资讯、科技资讯、影视娱乐、实用工具、生活信息、趣味内容和学习工具，部署即用，支持 Cloudflare Workers、Docker 与 EdgeOne Makers 等多种部署方式。

## 界面预览

![界面预览](/daily-hot-preview.png)

桌面端为三栏版式：左侧固定导航栏、中间内容区、右侧信息栏；窄屏下侧边栏自动收起为抽屉，右侧栏折叠隐藏。

## ✨ 功能特性

### 🔥 今日热榜（聚合首页）

默认首页，把 7 个主流内容平台（社交媒体 / 问答社区 / 短视频 / 综合资讯 / 搜索引擎 / 视频社区 / 综合门户）的热榜合并成**一条可比榜单**：

- **跨平台混排** —— 各平台榜单并发拉取后打平合并，一个列表看完全网热点；任一平台失效只表现为该来源缺席，不影响整体出榜
- **综合热度指数** —— 各平台热度口径互不相通（有的以「次」计、有的给等级值），直接按数字混排会出现「268 万排在 4853 万前面」的割裂。这里按**平台内排名归一化**统一打分后加权混排，展示数值与榜单顺序同源；原始热度保留为悬停提示，可追溯
- **平台筛选** —— 「综合 / 单平台」切换为纯前端过滤，不额外请求；筛选后名次按当前所见顺序重编，不会跳号
- **热搜平台九宫格** —— 右侧信息栏展示本次参与出榜的来源与数量，与筛选行双向联动
- **热门话题** —— 跟随当前筛选展示对应话题与热度
- **榜单缩略图** —— 有封面的条目自动展示配图，无图条目回退纯文本布局，单条高度自适应
- 前三名金银铜色块、来源徽标、紧凑数值排版

### 📰 全网热榜聚合

一个面板覆盖 70+ 个数据源，按 7 大分类组织：

| 分类 | 覆盖内容 |
| ---- | -------- |
| 📰 新闻资讯 | 每日简报、主流社交与问答平台热搜、视频平台热门、新闻客户端与综合门户热榜、汽车资讯、历史上的今天、海外媒体头条 |
| 🚀 科技资讯 | 开发者社区热帖、技术资讯与排行、开源项目趋势、独立博客与数码社区热榜 |
| 🎬 影视娱乐 | 实时票房、影视剧集周榜、流媒体热门剧集与电影、音乐榜单（多平台多地区）、游戏热榜与免费游戏、歌词搜索 |
| 🛠️ 实用工具 | 百科、健康计算、二维码生成、哈希加密、网页信息提取、IP 与域名查询、密码生成与检测、配色方案 |
| 🌤️ 生活信息 | 实时天气与预报、汇率、油价、金价、万年历、农历信息、摸鱼日历 |
| 🎯 趣味内容 | 段子、冷笑话、一言、节日文案、答案之书、2048 小游戏、每日壁纸、JS 题目、梗百科 |
| 📚 学习工具 | 多引擎翻译（支持 110+ 种语言下拉选择）、每日一句英语 |

### 🎨 体验设计

- **🧭 三栏式布局** — 左侧导航 / 中间内容 / 右侧信息栏，窄屏自动重排
- **📱 移动端适配** — 侧边栏收纳为抽屉，触屏友好，顶栏不溢出
- **🌙 日间 / 夜间模式** — 跟随系统明暗，可手动切换并记忆
- **🔍 全网搜索** — 顶栏搜索框，必应 / 谷歌可切换并本地记忆
- **⏱️ 实时时钟** — 秒级走时，进度随一天推移铺满
- **🌤️ 本地天气** — 按访客 IP 定位城市，天空底色随天气与昼夜切换
- **🖼️ 必应壁纸** — 每日背景，自适应清晰度，支持 1080P / 4K 下载与往期浏览
- **🗂️ 同源榜单合并** — 同站多榜合并为一张卡，卡内下拉切换
- **🏆 榜单样式** — 前三名金银铜色块、缩略图、热度高亮、可跳转来源
- **📌 数据源便签** — 分类页一键定位到对应卡片
- **🔄 单卡刷新** — 每张卡片独立刷新，或一键刷新当前视图
- **⚡ 智能加载** — 无参接口自动加载，有参接口提供输入控件
- **🎮 2048 小游戏** — 拖拽 / 滑动 / 方向键操控，最高分本地记忆
- **📅 万年历** — 公历农历对照，节气节日与调休标注
- **🔗 友情链接** — 页脚入口，样式随主题自适应

## 🚀 部署

### Cloudflare Workers（推荐）

```bash
git clone https://github.com/Jacky088/Daily-Hot.git
cd Daily-Hot
pnpm install
npx wrangler deploy
```

部署完成后访问 Worker 域名即可使用。

### EdgeOne Makers

已内置 `edgeone.json` 与 `cloud-functions/[[default]].ts`，前端面板与 API 一体部署。

**方式一：控制台导入 Git 仓库（推荐）**

Fork 本项目，在 [EdgeOne Makers](https://edgeone.ai/pages) 控制台「导入 Git 仓库」，选择本项目。构建配置自动读取 `edgeone.json`，保持默认即可，之后每次 `git push` 自动重新部署。

**方式二：CLI 部署**

```bash
npm install -g edgeone
edgeone login
npm install --no-audit --no-fund
npx edgeone makers build --mode prod    # 产出 .edgeone/（云函数 + 前端资源）
npx edgeone makers deploy .edgeone -n daily-hot
```

> `deploy -n` 仅适用于「直接上传」项目。
> 绑定自定义域名后可长期公开访问。

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

## 🏗️ 技术架构

```
前端面板                          后端 API
┌──────────────────┐            ┌──────────────────────┐
│  单页 HTML/CSS/JS │            │  Oak Framework (TS)   │
│  ├ 聚合首页       │            │  ├ 70+ 模块化数据源   │
│  ├ 三栏响应式布局 │  ── API ──→│  ├ 聚合与归一化排序   │
│  ├ 日夜间主题     │            │  ├ 多级缓存           │
│  ├ 必应壁纸背景   │            │  ├ 中间件链           │
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
- **数据源**：聚合各大平台公开热榜与开源社区数据，涵盖社交、问答、短视频、新闻资讯、技术社区、影视音乐、游戏与实用工具等 70+ 个来源
- **部署**：Cloudflare Workers / Docker / EdgeOne Pages / Node.js / Deno / Bun

## 📋 项目结构

```
.
├── public/
│   ├── index.html           # 前端面板（单文件 HTML）
│   ├── wallpaper.html       # 壁纸幻灯片页（今日及往期）
│   ├── app.js               # 前端逻辑（数据源注册 + 渲染器 + 聚合首页）
│   ├── style.css            # 样式（含三栏布局与响应式断点）
│   ├── manifest.json        # PWA 配置
│   ├── sw.js                # Service Worker
│   ├── apple-touch-icon.png # iOS 主屏图标
│   └── logos/               # 数据源品牌图标
├── src/
│   ├── app.ts               # Oak 应用入口 + 中间件注册
│   ├── config.ts            # 环境变量配置
│   ├── common.ts            # 通用工具函数
│   ├── router.ts            # 路由集中注册
│   ├── cache.ts             # 缓存工具
│   ├── force-update-guard.ts # 强制刷新限流
│   ├── platform-ip.ts       # 访客 IP 定位（天气）
│   ├── middlewares/         # 中间件（CORS/错误处理/静态资源等）
│   └── modules/             # 各数据源模块，一个文件对应一类榜单
│       ├── hot-aggregate.module.ts # 全网热榜聚合（首页数据源）
│       ├── weibo.module.ts / zhihu.module.ts / ...
│       ├── geng/            # 梗百科（打包 JSON）
│       ├── duanzi/          # 随机段子
│       ├── hitokoto/        # 一言
│       └── ...
├── cf-worker.ts             # Cloudflare Workers 入口
├── node.ts                  # Node.js 入口
├── deno.ts                  # Deno 入口
├── bun.ts                   # Bun 入口
├── cloud-functions/         # EdgeOne Pages 云函数
│   └── [[default]].ts       # 全栈入口（Oak 服务，统一处理 API 与健康检查）
├── edgeone.json             # EdgeOne Pages 构建配置
├── wrangler.toml            # Cloudflare Workers 配置
├── Dockerfile               # Docker 构建文件
└── package.json
```

## 🙏 致谢

本项目的数据聚合能力建立在以下开源项目之上：

- **[vikiboss/60s](https://github.com/vikiboss/60s)** — 提供 40+ 个 API 接口
- **[vikiboss/60s-static-host](https://github.com/vikiboss/60s-static-host)** — 每日新闻数据源

## 🪪 License

[MIT](./license) License © 2026-PRESENT 木木
