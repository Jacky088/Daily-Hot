import { Common } from '../common.ts'
import { cached } from '../cache.ts'
import { env } from '../runtime-env.ts'
import { fetchUpstream } from '../fetch-upstream.ts'
import type { RouterMiddleware } from '@oak/oak'

const xhsApiUrl = 'https://edith.xiaohongshu.com/api/sns/v1/search/hot_list'

// 小红书私有接口凭据（shield 令牌 + 设备指纹 + 会话）会过期，过期后接口整条拉不到。
// 全部支持环境变量覆盖（REDNOTE_SHIELD / REDNOTE_PLATFORM_INFO / REDNOTE_COMMON_PARAMS /
// REDNOTE_UA），下发新值即可热更新，无需改代码重新部署；内置值只作兜底保证开箱可用
const FALLBACK_XHS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.7(0x18000733) NetType/WIFI Language/zh_CN',
  shield:
    'XYAAAAAQAAAAEAAABTAAAAUzUWEe4xG1IYD9/c+qCLOlKGmTtFa+lG434Oe+FTRagxxoaz6rUWSZ3+juJYz8RZqct+oNMyZQxLEBaBEL+H3i0RhOBVGrauzVSARchIWFYwbwkV',
  'xy-platform-info':
    'platform=iOS&version=8.7&build=8070515&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&bundle=com.xingin.discover',
  'xy-common-params':
    'app_id=ECFAAF02&build=8070515&channel=AppStore&deviceId=C323D3A5-6A27-4CE6-AA0E-51C9D4C26A24&device_fingerprint=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_fingerprint1=20230920120211bd7b71a80778509cf4211099ea911000010d2f20f6050264&device_model=phone&fid=1695182528-0-0-63b29d709954a1bb8c8733eb2fb58f29&gid=7dc4f3d168c355f1a886c54a898c6ef21fe7b9a847359afc77fc24ad&identifier_flag=0&lang=zh-Hans&launch_id=716882697&platform=iOS&project_id=ECFAAF&sid=session.1695189743787849952190&t=1695190591&teenager=0&tz=Asia/Shanghai&uis=light&version=8.7',
}

// 每次请求时读取而非模块顶层固化，保证运行时注入的环境变量能生效；
// referer / xy-direction 是固定的协议头，不属于凭据
function getRednoteHeaders() {
  return {
    'User-Agent': env('REDNOTE_UA') || FALLBACK_XHS_HEADERS['User-Agent'],
    referer: 'https://app.xhs.cn/',
    'xy-direction': '22',
    shield: env('REDNOTE_SHIELD') || FALLBACK_XHS_HEADERS.shield,
    'xy-platform-info': env('REDNOTE_PLATFORM_INFO') || FALLBACK_XHS_HEADERS['xy-platform-info'],
    'xy-common-params': env('REDNOTE_COMMON_PARAMS') || FALLBACK_XHS_HEADERS['xy-common-params'],
  }
}

class ServiceRednote {
  handle(): RouterMiddleware<'/rednote'> {
    return async (ctx) => {
      // 榜单按固定键缓存：小红书对带设备指纹的请求风控很敏感，
      // 不缓存等于每个访客都拿同一套指纹去打一次上游，被拉黑后整条接口静默失效
      const hotList = await cached('rednote:hot', () => this.#fetchHotList(), {
        ttl: 5 * 60 * 1000,
        cacheIf: (list) => list.length > 0,
      })

      switch (ctx.state.encoding) {
        case 'text': {
          ctx.response.body = `小红书实时热点\n\n${hotList
            .slice(0, 20)
            .map((e) => `${e.rank}. ${e.title} (${e.score})`)
            .join('\n')}`
          break
        }

        case 'markdown': {
          ctx.response.body = `# 小红书实时热点\n\n${hotList
            .slice(0, 20)
            .map((e) => `${e.rank}. [${e.title}](${e.link}) \`${e.score}\``)
            .join('\n')}`
          break
        }

        case 'json':
        default:
          ctx.response.body = Common.buildJson(hotList)
          break
      }
    }
  }

  // 小红书私有头（shield/xy-*）一个不能少；原来裸 fetch 无超时，hang 住拖整卡，
  // fetchUpstream 给 8s + 1 次重试
  async #fetchHotList(): Promise<RednoteItem[]> {
    const response = await fetchUpstream(xhsApiUrl, {
      method: 'GET',
      headers: getRednoteHeaders(),
    })

    const apiData = (await response.json()) as RednoteRawResponse

    if (!apiData.success || !apiData.data?.items) {
      throw new Error(`小红书接口返回异常：${apiData.msg || '未知错误'}（code: ${apiData.code ?? response.status}）`)
    }

    return apiData.data.items.map((item, idx) => {
      return {
        rank: idx + 1,
        title: item.title,
        score: item.score,
        word_type: item.word_type,
        work_type_icon: item.icon || '',
        link: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(item.title)}&type=51`,
        // type: item.type,
      }
    })
  }
}

export const serviceRednote = new ServiceRednote()

interface RednoteItem {
  title: string
  word_type: string
  score: string
  rank: number
  link: string
  // type: string
}

interface RednoteRawResponse {
  success: boolean
  msg: string
  data: {
    items: {
      word_type: string
      score: string
      rank_change: number
      title_img: string
      title: string
      id: string
      icon?: string
      type: string
    }[]
    is_new_hot_list_exp: boolean
    host: string
    background_color: object
    scene: string
    result: { success: boolean }
    word_request_id: string
    hot_list_id: string
    title: string
  }
  code: number
}
