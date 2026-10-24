# CSS 死样式审计报告

> 一次性审计产物（脚本为临时文件，未入库），生成于 2026-10-24T02:09:57.198Z
> 语料：public/{app.js,index.html,wallpaper.html,sw.js,emoji.js} 源码（非 dist）
> 方法：CSS 类选择器 vs 语料词法片段；含「模板字符串前缀」二次校验（t${v} / 'top' + 1 这类运行时拼接）

| 类别 | 数量 | 占比 |
|---|---|---|
| CSS 类选择器总数 | 955 | 100% |
| 语料精确命中 | 841 | 88.1% |
| 动态拼接命中（含前缀证据） | 95 | 9.9% |
| 死样式候选（无任何命中） | 19 | 2.0% |

## 死样式候选（19 个）

以下类在全部前端源码中无任何词法命中，也没有模板拼接证据。
**删除前仍需人工确认**（主要风险：由数据驱动的枚举类名、或仅在特定状态下出现的类）：

- `.bubble`
- `.fail`
- `.hc-i`
- `.hw-cloud`
- `.hw-cloud-s1`
- `.hw-cloud-s2`
- `.hw-cloud-s3`
- `.hw-cloud-shape`
- `.hw-sep`
- `.mn`
- `.mono`
- `.pomo-ring-bar`
- `.pomo-ring-bg`
- `.pomo-ring-track`
- `.rn`
- `.rt-pulse`
- `.wc-t1`
- `.wc-t2`
- `.wc-t3`

### 已人工复核的结论（本次审计附带）

- `.pomo-ring-bar` / `.pomo-ring-bg` / `.pomo-ring-track`：确认死亡。app.js 的番茄钟模块存在且使用 `pomo-leaf`/`pomo-tomato`/`pomo-svg-ring` 等类，但整个文件无任何 `ring-` 拼接痕迹——应是环形 UI 被番茄/树形设计替代后的遗留。
- `.hw-cloud*` / `.hw-sep`：天气卡已改用 3D 拟态 PNG（sun-3d.png 等），云朵装饰类无引用。
- `.wc-t1`~`.wc-t3`：确认死亡。热词云档位现用 `wc-peach`/`wc-orange`/`wc-amber`/`wc-purple`/`wc-slate`（app.js 8578 行），`wc-t` 前缀无任何拼接痕迹。
- `.t4`~`.t2048`、`.d1`~`.d4`、`.top1`~`.top3` 为动态拼接（`t${v}`、`d${n}`、`'top' + n`），已从死样式候选中排除。
- 其余候选（bubble / fail / mn / mono / rn / rt-pulse / hc-i）建议逐个全局搜索确认后再删。
