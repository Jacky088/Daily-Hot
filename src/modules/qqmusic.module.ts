import { Common } from '../common.ts'
import { cached } from '../cache.ts'

import type { RouterMiddleware } from '@oak/oak'

// QQ 音乐排行榜。
// 官方没有开放接口，但站点自己的榜单接口是公开可用的（免登录、免密钥），
// 需要带 Referer: https://y.qq.com/（不带会被判为非法来源）：
//   https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=26&song_begin=0&song_num=20&format=json
// topid 清单来自官方的榜单列表接口 fcg_myqq_toplist.fcg
const QQ_TOPLIST_API = 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 30
// 实测上限是 100，留点余量按 50 取
const MAX_FETCH = 50

const TOPID_MAP: Record<string, string> = {
  '26': '热歌榜',
  '62': '飙升榜',
  '27': '新歌榜',
  '60': '抖音热歌榜',
  '3': '欧美榜',
  '17': '日本榜',
  '16': '韩国榜',
  '59': '香港地区榜',
  '61': '台湾地区榜',
  '58': '说唱榜',
  '57': '电音榜',
  '78': '国乐榜',
}

class ServiceQQMusic {
  handle(): RouterMiddleware<'/qq-music'> {
    return async (ctx) => {
      const topid = ctx.request.url.searchParams.get('topid') || '26'

      if (!TOPID_MAP[topid]) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, `暂不支持 ${topid} 榜单，可选值：${Object.keys(TOPID_MAP).join('、')}`)
        return
      }

      let limit = Number.parseInt(ctx.request.url.searchParams.get('limit') || '') || DEFAULT_LIMIT
      limit = Math.min(limit, MAX_LIMIT)

      const data = (await cached(`qq-music-${topid}`, () => this.#fetch(topid))).slice(0, limit)
      const title = TOPID_MAP[topid]

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `QQ 音乐${title}\n\n${data
            .map((e, idx) => `${idx + 1}. ${e.title} - ${e.artist}\n   ${e.link}`)
            .join('\n\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# QQ 音乐${title}\n\n${data
            .map(
              (e, idx) =>
                `### ${idx + 1}. [${e.title}](${e.link})\n\n${e.cover ? `![${e.title}](${e.cover})\n\n` : ''}**${e.artist}**${e.album ? ` · 专辑《${e.album}》` : ''}\n\n---\n`,
            )
            .join('\n')}`
          break
        }

        case 'json':
        default: {
          ctx.response.body = Common.buildJson(data)
          break
        }
      }
    }
  }

  async #fetch(topid: string): Promise<QQMusicItem[]> {
    const url =
      `${QQ_TOPLIST_API}?topid=${topid}&song_begin=0&song_num=${MAX_FETCH}` +
      '&format=json&platform=yqq&needNewCode=1'

    const response = await fetch(url, {
      headers: {
        'User-Agent': Common.chromeUA,
        Accept: '*/*',
        // 缺了 Referer 会被上游拒绝，必须带
        Referer: 'https://y.qq.com/',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch qq music toplist: HTTP ${response.status}`)
    }

    const body = (await response.json()) as { code: number; date?: string; songlist?: QQMusicRawItem[] }

    if (body.code !== 0) {
      throw new Error(`Failed to fetch qq music toplist: code ${body.code}`)
    }

    const items = (body.songlist || [])
      .map((row, idx): QQMusicItem => {
        const song = row.data || {}
        // 专辑封面走 gtimg 固定规则，由 albummid 拼出来
        const cover = song.albummid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${song.albummid}.jpg` : ''

        const artist = (song.singer || []).map((s) => s.name).filter(Boolean).join(' / ')
        // interval 是秒数，顺手转成 mm:ss
        const duration = this.#formatDuration(song.interval || 0)

        return {
          rank: idx + 1,
          id: song.songmid || String(song.songid || ''),
          title: (song.songname || '').trim(),
          artist,
          album: (song.albumname || '').trim(),
          cover,
          link: song.songmid ? `https://y.qq.com/n/ryqq/songDetail/${song.songmid}` : '',
          duration,
          meta: [artist, duration].filter(Boolean).join(' · '),
          update_date: body.date || '',
        }
      })
      .filter((e) => e.title && e.link)

    if (!items.length) {
      throw new Error('Failed to parse qq music toplist: empty songlist')
    }

    return items
  }

  #formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) return ''
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
}

interface QQMusicRawItem {
  data?: {
    songid?: number
    songmid?: string
    songname?: string
    albumname?: string
    albummid?: string
    interval?: number
    singer?: { name?: string }[]
  }
}

export interface QQMusicItem {
  rank: number
  id: string
  title: string
  artist: string
  album: string
  cover: string
  link: string
  duration: string
  meta: string
  update_date: string
}

export const serviceQQMusic = new ServiceQQMusic()
