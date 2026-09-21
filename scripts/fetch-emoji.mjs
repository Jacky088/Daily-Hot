// 从 Twemoji 拉取本项目用到的全部 emoji SVG，落到 public/emoji/<codepoints>.svg
// 目的：把系统字体 emoji 换成固定 SVG 资源，消除设备间字形差异（见 public/emoji.js）
// 用法：node scripts/fetch-emoji.mjs
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'emoji')

// Twemoji 维护版（twitter/twemoji 已归档，jdecked/twemoji 是社区维护分支）
const CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/'

const sources = ['public/app.js', 'public/index.html', 'public/style.css', 'public/emoji.js']
const seg = new Intl.Segmenter('zh', { granularity: 'grapheme' })

// 仅收集前端会渲染的 emoji：排除 © 这类非图标符号与 ASCII 字符
const SKIP = new Set(['©', '®', '™'])

const set = new Set()
for (const rel of sources) {
  const abs = join(root, rel)
  if (!existsSync(abs)) continue
  const text = await readFile(abs, 'utf8')
  for (const { segment } of seg.segment(text)) {
    if (!/\p{Emoji}/u.test(segment)) continue
    if (SKIP.has(segment)) continue
    if (/^[\x20-\x7e]+$/.test(segment)) continue // 纯 ASCII（0-9、#、* 等）
    set.add(segment)
  }
}

const cps = (s) => Array.from(s).map((c) => c.codePointAt(0).toString(16))

// Twemoji 资源名：码位小写十六进制用 - 连接；多数变体选择符 FE0F 会被省略，逐个试
function candidates(emoji) {
  const all = cps(emoji)
  const noVs = all.filter((c) => c !== 'fe0f')
  const list = []
  if (noVs.length) list.push(noVs.join('-'))
  list.push(all.join('-'))
  return [...new Set(list)]
}

await mkdir(outDir, { recursive: true })

const map = {}
const failed = []
for (const emoji of [...set].sort()) {
  let done = false
  for (const name of candidates(emoji)) {
    if (done) break
    const url = CDN + name + '.svg'
    const res = await fetch(url)
    if (!res.ok) continue
    const svg = await res.text()
    if (!svg.includes('<svg')) continue
    await writeFile(join(outDir, name + '.svg'), svg, 'utf8')
    map[emoji] = name
    done = true
  }
  if (!done) failed.push(emoji)
}

console.log(`emoji total: ${set.size}, downloaded: ${Object.keys(map).length}`)
if (failed.length) console.log('failed:', failed.map((e) => `${e} (${cps(e).join('-')})`).join(', '))

// 输出映射表，供 public/emoji.js 使用
const entries = Object.entries(map).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
console.log('\n// ---- EMOJI_MAP ----')
console.log('{\n' + entries.join('\n') + '\n}')
