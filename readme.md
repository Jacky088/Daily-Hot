# 🔥 每日热榜

> 一站看完天下事 · 基于 [60s API](https://github.com/vikiboss/60s) 构建的一站式热榜聚合面板

[![Version](https://img.shields.io/badge/version-1.14.0-blue) ](./package.json)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white) ](https://workers.cloudflare.com/)
[![EdgeOne Pages](https://img.shields.io/badge/EdgeOne%20Pages-0052FF?style=flat) ](https://edgeone.ai/pages)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) ](https://docker.com/)
[![License](https://img.shields.io/badge/license-MIT-green) ](./license)

聚合 70+ 个热门数据源，一个页面看遍全网热点。涵盖新闻资讯、科技资讯、影视娱乐、实用工具、生活信息、趣味内容和翻译，部署即用，支持 Cloudflare Workers、Docker 与 EdgeOne Makers 等多种部署方式。

## 界面预览

![界面预览](/daily-hot-preview.png)

## ✨ 功能特性

### 📰 全网热榜聚合

一个面板覆盖 70+ 个数据源，按 7 大分类组织：

| 分类 | 包含接口 |
| ---- | -------- |
| 📰 新闻资讯 | 60 秒读懂世界、微博热搜、知乎热榜、B 站热门、抖音热点、今日头条、百度热搜/电视剧/贴吧、夸克每日资讯、凤凰热榜、汽车热榜、历史上的今天、Al Jazeera/BBC/CNN 头条 |
| 💻 科技资讯 | NodeSeek 新帖、V2EX 热帖、LowEndTalk、Hacker News、IT 资讯、IT 之家热榜、掘金热榜、GitHub 热榜、51CTO 博客榜、酷安热榜、36 氪热榜、Reddit 热帖、少数派热榜、虎嗅热榜 |
| 🎬 影视娱乐 | 猫眼票房、百度电视剧榜、豆瓣电影/剧集/综艺周榜（华语/全球）、流媒体热门剧集/电影、YouTube 游戏热榜、Epic 免费游戏、Steam 免费游戏、网易云音乐榜（60+ 榜单）、QQ 音乐热榜（9 个榜单）、Apple Music 热歌榜（7 个地区）、歌词搜索、唱鸭 |
| 🛠️ 实用工具 | 百度百科、健康计算器、二维码生成、哈希加密、网页 OG 信息、IP 查询、WHOIS 查询、密码生成/检测、随机颜色、配色方案 |
| 🌤️ 生活信息 | 实时天气、天气预报、汇率、油价、金价、万年历、农历信息、摸鱼日历 |
| 🎯 趣味内容 | 段子、冷笑话、一言、KFC 疯狂星期四、发病文案、答案之书、2048 小游戏、必应壁纸、JS 题目、梗百科 |
| 🔤 翻译 | 有道翻译（支持 110+ 种语言下拉选择）、Google 翻译、每日一句英语 |

### 🎨 体验设计

- **🌙 日间 / 夜间模式** — 自动跟随系统明暗，顶栏可手动切换并记忆偏好
- **🔍 全网搜索** — 顶栏搜索框默认必应，右侧只露当前引擎图标，点开在下方下拉切换必应 / 谷歌，选择本地记忆；回车或点放大镜新标签打开结果页，不打断当前浏览
- **⏱️ 实时时钟** — 顶栏秒级时钟，橙色进度随一天推移铺满整条胶囊，进度区间内有流动的玻璃泡泡
- **🌤️ 本地天气** — 页首 Hero 卡右侧按访客 IP 自动定位城市、展示今日天气，点一下即可重新定位或手动改城市；天空底色随天气与昼夜实时切换，晴出太阳、夜出月亮与星点、雨天落雨丝、雪天飘六角雪花、雷阵雨伴闪电、雾霾起雾带
- **🖼️ 必应壁纸背景** — 页面背景每日自动获取必应壁纸，桌面/移动端按屏幕方向自适应清晰度，当日缓存不重复请求；默认关闭，顶栏一键开启
- **📥 壁纸一键下载与往期浏览** — 必应壁纸卡片内置 1080P / 4K 双尺寸下载；点击卡片图片进入独立幻灯片页，可浏览今日及往期最多 7 张壁纸，支持触摸滑动 / 鼠标拖拽 / 键盘方向键切换，竖屏自动改用竖版构图
- **📱 移动端适配** — 触屏友好控件，响应式布局，顶栏始终两行不溢出
- **🔄 单卡刷新** — 每张卡片右上角可独立刷新，顶栏按钮一键刷新当前分类全部卡片
- **🔗 链接可跳转** — 可点击跳转到来源页面，
- **⚡ 智能加载** — 无参数接口自动加载，有参数接口提供输入控件
- **🗂️ 同源榜单合并** — 同一站点的多个榜单合并为一张卡，卡内下拉切换（猫眼 / 豆瓣 / 百度 / 流媒体 / 网易云 / 免费游戏）；其中网易云的候选榜单由后端榜单清单动态生成，官方有多少个榜就有多少个选项
- **🏆 排行榜样式** — 前三名金银铜渐变色块，热度数值高亮
- **🖼️ 榜单缩略图** — 知乎/头条/百度/36氪/少数派/虎嗅等带图数据源逐条展示封面，单条无图自动回退纯文本布局
- **🎮 2048 小游戏** — 鼠标拖拽 / 触屏滑动 / 键盘方向键三合一操控，最高分本地记忆
- **📅 万年历** — 公历/农历对照，节气、节日与法定节假日「休/班」标注，支持任意月份翻阅
- **🔗 友情链接** — 页脚友链入口，样式随主题自适应

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

Fork本项目，在 [EdgeOne Makers](https://edgeone.ai/pages) 控制台「导入 Git 仓库」，选择本项目。构建配置自动读取 `edgeone.json`，保持默认即可，之后每次 `git push` 自动重新部署。

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

## 📡 API 使用

部署后，根路径 `/` 返回前端面板，`/v2/*` 返回 API 数据。

```bash
# 60 秒读懂世界（JSON，默认）
curl "https://your-domain/v2/60s"

# 纯文本格式
curl "https://your-domain/v2/60s?encoding=text"

# 微博热搜
curl "https://your-domain/v2/weibo"

# 实时天气（query 为城市参数，默认北京）
curl "https://your-domain/v2/weather/realtime?query=北京"

# 按访问 IP 自动定位的实时天气（页首 Hero 天气卡用的就是这个，也可用 query 覆盖城市）
curl "https://your-domain/v2/weather/local"

# 万年历（默认当月，支持 year/month 参数）
curl "https://your-domain/v2/lunar/calendar?year=2026&month=10"

# 掘金热榜（category：backend / frontend / android / ios / ai / tools / life / read）
curl "https://your-domain/v2/juejin?category=frontend"

# QQ 音乐热榜（topid：26 热歌 / 62 飙升 / 27 新歌 / 60 抖音热歌 …，见接口内注释）
curl "https://your-domain/v2/qq-music?topid=62"

# 查看全部接口列表
curl "https://your-domain/endpoints"
```

所有接口支持 `encoding=json`（默认）/ `text` / `markdown` 三种返回格式。

## 🏗️ 技术架构

```
前端面板                          后端 API
┌──────────────────┐            ┌──────────────────────┐
│  单页 HTML/CSS/JS │            │  Oak Framework (TS)   │
│  ├ 必应壁纸背景   │            │  ├ 60+ 模块化接口     │
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
- **数据源**：[vikiboss/60s](https://github.com/vikiboss/60s) + [60s-static-host](https://github.com/vikiboss/60s-static-host) + NodeSeek / V2EX / LowEndTalk RSS + 掘金官方内容 API、Apple Music 官方营销 RSS、QQ 音乐榜单接口 + 凤凰热榜 / 51CTO / IT 之家排行 / GitHub Trending 页面解析 + Invidious / Piped 社区实例（YouTube）
- **部署**：Cloudflare Workers / Docker / EdgeOne Pages / Node.js / Deno / Bun

## 📋 项目结构

```
.
├── public/
│   ├── index.html          # 前端面板（单文件 HTML）
│   ├── wallpaper.html      # 壁纸幻灯片页（今日及往期）
│   ├── app.js              # 前端逻辑（EPS 注册 + 渲染器）
│   ├── style.css           # 样式
│   ├── manifest.json       # PWA 配置
│   ├── sw.js               # Service Worker
│   ├── apple-touch-icon.png # iOS 主屏图标
│   └── logos/              # 数据源品牌图标（SVG）
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
│       ├── kfc/             # 疯狂星期四文案本地补充库
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
