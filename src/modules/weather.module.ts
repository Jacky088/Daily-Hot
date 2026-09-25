import { Common, dayjs } from '../common.ts'
import { serviceIP } from './ip.module.ts'
import { cached } from '../cache.ts'
import { fetchUpstream } from '../fetch-upstream.ts'
import type { RouterMiddleware } from '@oak/oak'

// 无法定位（海外 IP、IP 库全挂）或上游城市库查不到时的兜底城市
const FALLBACK_CITY = '北京'

/**
 * 天气主源：UAPI 免费天气接口（返回结构与旧链路不同，由 buildUapiRealtime 归一）。
 *
 * ⚠️ IP 透传：该接口**没有 ip 参数，也不认 X-Forwarded-For / X-Real-IP**（已实测），
 * 它的「自动定位」只认 TCP 连接来源 IP。而本服务部署在 Cloudflare Workers / EdgeOne 上，
 * 服务端 fetch 出去的出口 IP 是 CDN 机房 IP、并非访客真实 IP——空参调用会把天气定位到
 * 机房所在地（访客真实信息被掩盖，定位结果完全错误）。
 *
 * 因此本项目必须由调用方先把访客 IP 解析成中文城市名（复用 /v2/ip 那条 IP 库链路），
 * 再以 ?city= 显式传给上游。这一步就是这里说的「IP 透传」。
 *
 * 参数优先级：adcode > city > 连接来源 IP 自动定位。
 */
const UAPI_WEATHER_URL = 'https://uapis.cn/api/v1/misc/weather'

interface CityInfo {
  name: string
  province: string
  city: string
  county?: string
  code: string
}

interface WeatherObserve {
  degree: string
  humidity: string
  precipitation: string
  pressure: string
  update_time: string
  weather: string
  weather_code: string
  weather_short: string
  wind_direction: string
  wind_power: string
  wind_direction_name: string
  weather_url: string
  weather_color: string[]
}

interface AirQuality {
  aqi: number
  aqi_level: number
  aqi_name: string
  co: string
  no2: string
  o3: string
  pm10: string
  pm25: string
  so2: string
  update_time: string
  rank: number
  total: number
}

interface WeatherIndexItem {
  detail: string
  info: string
  name: string
  url?: string
}

interface WeatherIndex {
  [key: string]: WeatherIndexItem
}

interface WeatherAlarm {
  city: string
  county: string
  detail: string
  info: string
  level_code: string
  level_name: string
  province: string
  type_code: string
  type_name: string
  update_time: string
  url: string
}

interface HourlyForecast {
  degree: string
  update_time: string
  weather: string
  weather_code: string
  weather_short: string
  wind_direction: string
  wind_power: string
  weather_url: string
}

interface DailyForecast {
  day_weather: string
  day_weather_code: string
  day_wind_direction: string
  day_wind_power: string
  min_degree: string
  max_degree: string
  night_weather: string
  night_weather_code: string
  night_wind_direction: string
  night_wind_power: string
  time: string
  aqi: number
  aqi_level: number
  aqi_name: string
  day_weather_url: string
  night_weather_url: string
}

interface SunRise {
  sunrise: string
  sunset: string
  time: string
}

interface CitySearchResponse {
  status: number
  message?: string
  data?: Record<string, string>
}

interface WeatherApiResponse {
  status: number
  message?: string
  data?: {
    observe?: WeatherObserve
    forecast_1h?: HourlyForecast[]
    forecast_24h?: DailyForecast[]
    index?: WeatherIndex
    alarm?: WeatherAlarm[]
    rise?: SunRise[]
    air?: AirQuality
  }
}

// ============ UAPI 主源（uapis.cn）响应结构 ============
// 字段随请求参数分档返回：基础字段 ≈ observe，extended ≈ air，forecast ≈ 今日区间 / 日出日落，
// indices ≈ index，alerts ≈ alarm。全部可选，避免上游改档位时直接抛错。

interface UapiAirPollutants {
  pm25?: number
  pm10?: number
  o3?: number
  no2?: number
  so2?: number
  co?: number
}

interface UapiForecastDay {
  date: string
  week?: string
  temp_max?: number
  temp_min?: number
  weather_day?: string
  weather_night?: string
  wind_dir_day?: string
  wind_dir_night?: string
  wind_scale_day?: string
  wind_scale_night?: string
  humidity?: number
  precip?: number
  pop?: number
  cloud?: number
  uv_index?: number
  sunrise?: string
  sunset?: string
}

interface UapiLifeIndex {
  level?: string
  brief?: string
  advice?: string
}

interface UapiAlert {
  title?: string
  type?: string
  level?: string
  text?: string
  publish_time?: string
  publisher?: string
  guidance?: string[]
}

interface UapiWeatherResponse {
  province?: string
  city?: string
  district?: string
  adcode?: string
  weather?: string
  weather_icon?: string
  temperature?: number
  wind_direction?: string
  wind_power?: string
  humidity?: number
  report_time?: string
  // extended=true
  feels_like?: number
  visibility?: number
  pressure?: number
  uv?: number
  precipitation?: number
  cloud?: number
  aqi?: number
  aqi_level?: number
  aqi_category?: string
  aqi_primary?: string
  air_pollutants?: UapiAirPollutants
  // forecast=true
  temp_max?: number
  temp_min?: number
  forecast?: UapiForecastDay[]
  // indices=true
  life_indices?: Record<string, UapiLifeIndex>
  // 存在有效预警时返回
  alerts?: UapiAlert[]
}

class ServiceWeather {
  private cityCache = new Map<string, CityInfo>()

  private isValidCitySearchResponse(data: unknown): data is CitySearchResponse {
    return typeof data === 'object' && data !== null && typeof (data as any).status === 'number'
  }

  private isValidWeatherResponse(data: unknown): data is WeatherApiResponse {
    return typeof data === 'object' && data !== null && typeof (data as any).status === 'number'
  }

  private safeParseInt(value: string | undefined, fallback = 0): number {
    if (!value) return fallback
    const parsed = Number.parseInt(value, 10)
    return Number.isNaN(parsed) ? fallback : parsed
  }

  private safeParseFloat(value: string | undefined, fallback = 0): number {
    if (!value) return fallback
    const parsed = Number.parseFloat(value)
    return Number.isNaN(parsed) ? fallback : parsed
  }

  handle(): RouterMiddleware<'/weather'> {
    return async (ctx) => {
      try {
        const location = (await Common.getParam('query', ctx.request)) || '北京'

        const city = (await Common.getParam('city', ctx.request)) || ''
        const province = (await Common.getParam('province', ctx.request)) || ''
        const cityInfo = await this.getCityInfo(location, city, province)

        const result = await this.buildRealtime(cityInfo)

        switch (ctx.state.encoding) {
          case 'text':
            ctx.response.body = this.formatWeatherText(result)
            break

          case 'markdown':
            ctx.response.body = this.formatWeatherMarkdown(result)
            break

          case 'json':
          default:
            ctx.response.body = Common.buildJson(result)
            break
        }
      } catch (error) {
        console.error('[weather]', error)
        // 「未找到城市」这条要留着区分 404（对调用方有指导意义），
        // 其余原始 message 一律不回显——底层异常可能带内部地址与库信息
        const notFound = error instanceof Error && error.message.includes('未找到城市')
        ctx.response.body = Common.buildJson(
          null,
          notFound ? 404 : 500,
          notFound ? '未找到该城市' : '天气数据获取失败，请稍后重试',
        )
      }
    }
  }

  handleForecast(): RouterMiddleware<'/weather/forecast'> {
    return async (ctx) => {
      try {
        const location = (await Common.getParam('query', ctx.request)) || '北京'
        // days 归一化：非法/越界值钳制到 1-15，避免 NaN 让 slice(0, NaN) 返回空数组
        const daysRaw = Number.parseInt((await Common.getParam('days', ctx.request)) || '7')
        const days = Number.isNaN(daysRaw) ? 7 : Math.min(Math.max(daysRaw, 1), 15)

        const city = (await Common.getParam('city', ctx.request)) || ''
        const province = (await Common.getParam('province', ctx.request)) || ''
        const cityInfo = await this.getCityInfo(location, city, province)

        const weatherData = await this.fetchCurrentWeather(cityInfo)

        const result = {
          location: {
            name: `${cityInfo.province}${cityInfo.city}${cityInfo.county || ''}`.replace(/省|市/g, ''),
            province: cityInfo.province,
            city: cityInfo.city,
            county: cityInfo.county || '',
          },
          hourly_forecast: Array.isArray(weatherData.forecast_1h)
            ? weatherData.forecast_1h.slice(0, 48).map((hour) => ({
                datetime: this.formatHourlyTime(hour.update_time),
                temperature: this.safeParseInt(hour.degree),
                condition: hour.weather,
                condition_code: hour.weather_code,
                wind_direction: hour.wind_direction,
                wind_power: hour.wind_power,
                weather_icon: hour.weather_url,
              }))
            : [],
          daily_forecast: Array.isArray(weatherData.forecast_24h)
            ? weatherData.forecast_24h.slice(0, Math.min(days, 8)).map((day) => ({
                date: day.time,
                day_condition: day.day_weather,
                day_condition_code: day.day_weather_code,
                night_condition: day.night_weather,
                night_condition_code: day.night_weather_code,
                max_temperature: this.safeParseInt(day.max_degree),
                min_temperature: this.safeParseInt(day.min_degree),
                day_wind_direction: day.day_wind_direction,
                day_wind_power: day.day_wind_power,
                night_wind_direction: day.night_wind_direction,
                night_wind_power: day.night_wind_power,
                aqi: day.aqi,
                aqi_level: day.aqi_level,
                air_quality: day.aqi_name,
                day_weather_icon: day.day_weather_url,
                night_weather_icon: day.night_weather_url,
              }))
            : [],
          sunrise_sunset: Array.isArray(weatherData.rise)
            ? weatherData.rise.slice(0, Math.min(days, 15)).map((day) => {
                const sunriseData = this.formatSunriseTime(day.time, day.sunrise)
                const sunsetData = this.formatSunriseTime(day.time, day.sunset)
                return {
                  sunrise: sunriseData.formatted,
                  sunrise_at: sunriseData.timestamp,
                  sunrise_desc: day.sunrise,
                  sunset: sunsetData.formatted,
                  sunset_at: sunsetData.timestamp,
                  sunset_desc: day.sunset,
                }
              })
            : [],
        }

        switch (ctx.state.encoding) {
          case 'text':
            ctx.response.body = this.formatForecastText(result)
            break

          case 'markdown':
            ctx.response.body = this.formatForecastMarkdown(result)
            break

          case 'json':
          default:
            ctx.response.body = Common.buildJson(result)
            break
        }
      } catch (error) {
        console.error('[weather]', error)
        // 「未找到城市」这条要留着区分 404（对调用方有指导意义），
        // 其余原始 message 一律不回显——底层异常可能带内部地址与库信息
        const notFound = error instanceof Error && error.message.includes('未找到城市')
        ctx.response.body = Common.buildJson(
          null,
          notFound ? 404 : 500,
          notFound ? '未找到该城市' : '天气数据获取失败，请稍后重试',
        )
      }
    }
  }

  /**
   * 按访客 IP 自动定位的实时天气：供页首 Hero 卡「今日天气」使用。
   * 定位完全复用 /v2/ip 的链路（平台 clientIp → 平台注入头 → 反代转发头 → 出口公网 IP 兜底），
   * 得到地名后直接作为 city 传给天气源；定位失败则回退 query 参数或默认城市。
   *
   * 数据源：UAPI 主源 → 腾讯天气兜底。两个源在本服务内被归一成同一套字段结构，
   * 前端与 text / markdown 输出无感知；实际生效的一方由响应里的 source.provider 标注。
   *
   * 定位范围：主源覆盖全球城市，因此海外访客显示自己所在的城市；腾讯兜底只覆盖中国大陆，
   * 走到兜底时海外定位会退回默认城市（source.mode 记为 default，前端据此如实标注）。
   */
  handleLocal(): RouterMiddleware<'/weather/local'> {
    return async (ctx) => {
      try {
        let ip = serviceIP.getClientIP(ctx.request.headers) || ctx.request.ip || ''
        // 本地/内网 IP（本机预览、无反代的自托管）拿不到归属地时，改用服务器出口公网 IP 兜底，
        // 这样本地开发也能验证整条定位链路。线上 Worker 拿到的是访客真实 IP，不会进这个分支。
        // 注意「取不到 IP」也要走这里：原来的 `ip &&` 会让空 IP 直接跳过兜底，
        // 只剩「默认城市」一条路——而这恰是本地/自托管最常见的情形，
        // 表现出来就是「定位突然失效、一直显示默认城市」
        if (!ip || serviceIP.isLocalIP(ip)) {
          const pub = await cached<string>('weather:public-ip', () => serviceIP.getPublicIP(), {
            ttl: 60 * 60 * 1000,
            staleTtl: 6 * 60 * 60 * 1000,
            // 探测失败返回空串，空值绝不能进缓存：否则一次瞬时失败会毒化整小时，
            // 之后每个请求都命中这个空值、一路退回默认城市（"定位失效"的另一半原因）
            cacheIf: (v) => !!v,
          })
          if (pub) ip = pub
        }

        // IP → 中文省市：按 IP 缓存 6 小时，同一访客的定位只查一次 IP 库。
        // preferChinese：天气下游按中文城市名检索，必须避开 ipinfo 对中国 IP 返回的拼音城市名
        const geo = ip
          ? await cached(
              `weather:geo:${ip}`,
              async () => {
                const info = await serviceIP.fetchIpInfo(ip, true)
                return {
                  province: info.prov || '',
                  city: info.city || '',
                  district: info.district || '',
                  countryCode: info.areacode || '',
                }
              },
              { ttl: 6 * 60 * 60 * 1000, staleTtl: 24 * 60 * 60 * 1000 },
            )
          : { province: '', city: '', district: '', countryCode: '' }

        // 手动指定优先于自动定位（也便于本地开发自测：?query=上海）
        const manual = (await Common.getParam('query', ctx.request)) || ''
        // IP 解析出的地名。海外城市同样算数：主源 UAPI 支持国际城市，
        // 海外访客应当看到自己所在城市，而不是被无差别地回退成默认城市
        const detected = geo.city || geo.province
        // 是否为中国大陆定位。只有腾讯兜底链路需要区分——它的城市库仅覆盖中国大陆
        const inChina = geo.countryCode === 'CN'
        const location = manual || detected || FALLBACK_CITY

        // 主源：UAPI。把上面解析出的城市名显式传给它——上游不认转发头，只能这样「透传」IP。
        // 按城市缓存 15 分钟：上游有 4 QPS 限流，而天气本身变化很慢
        let realtime: Record<string, unknown> | null = null
        let provider = 'uapi'
        let usedFallback = false
        try {
          realtime = await cached(`weather:uapi:${location}`, () => this.buildUapiRealtime(location), {
            ttl: 15 * 60 * 1000,
            staleTtl: 6 * 60 * 60 * 1000,
          })
        } catch {
          // 上游超时 / 限流 / 城市名它认不出：整体回落到下面的旧链路，前端无感知
          realtime = null
        }

        // 兜底：原有腾讯链路，其城市库只覆盖中国大陆，因此非中国 IP 的自动定位
        // 直接改用默认城市，不拿海外地名去检索（必然「未找到城市」）
        if (!realtime) {
          provider = 'tencent'
          const tencentLocation = manual || (inChina ? detected : '') || FALLBACK_CITY
          if (!manual && !inChina && detected) usedFallback = true

          // 上游城市库查不到时：自动定位（生僻地名）宁可退回默认城市，
          // 也不要让整个接口 500 让前端整块隐藏天气区。
          // 但手动指定的城市是「明确意图」，查不到必须如实报错——
          // 悄悄换成北京会让用户以为自己输对了，前端也就没法提示改错字
          let cityInfo: CityInfo
          try {
            cityInfo = await this.getCityInfo(tencentLocation, geo.city, geo.province)
          } catch (error) {
            if (manual || tencentLocation === FALLBACK_CITY) throw error
            cityInfo = await this.getCityInfo(FALLBACK_CITY, '', '')
            usedFallback = true
          }
          realtime = await this.buildRealtime(cityInfo)
        }

        const result = {
          ...realtime,
          // 定位来源：前端据此展示识别到的城市，未定位时标注「默认」并附上探测到的 IP 便于排查
          // provider：实际生效的数据源，前端据此如实标注（主源失败回落时不至于谎报）
          source: {
            mode: manual ? 'manual' : detected && !usedFallback ? 'ip' : 'default',
            provider,
            province: geo.province,
            city: geo.city,
            ip,
          },
        }

        switch (ctx.state.encoding) {
          case 'text':
            ctx.response.body = this.formatWeatherText(result)
            break

          case 'markdown':
            ctx.response.body = this.formatWeatherMarkdown(result)
            break

          case 'json':
          default:
            ctx.response.body = Common.buildJson(result)
            break
        }
      } catch (error) {
        console.error('[weather]', error)
        // 「未找到城市」这条要留着区分 404（对调用方有指导意义），
        // 其余原始 message 一律不回显——底层异常可能带内部地址与库信息
        const notFound = error instanceof Error && error.message.includes('未找到城市')
        ctx.response.body = Common.buildJson(
          null,
          notFound ? 404 : 500,
          notFound ? '未找到该城市' : '天气数据获取失败，请稍后重试',
        )
      }
    }
  }

  // ============ 主源：UAPI ============

  /**
   * UAPI 主源抓取。
   *
   * 城市名必须由调用方解析好后传进来：上游没有 ip 参数、也不认转发头，
   * 而本服务跑在 CDN 边缘（Worker / EdgeOne），出口 IP 是机房 IP，
   * 空参调用只会定位到机房所在地（见 UAPI_WEATHER_URL 的说明）。
   */
  private async fetchUapiWeather(location: string): Promise<UapiWeatherResponse> {
    const city = location.trim()
    if (!city) throw new Error('未指定城市')

    const url = `${UAPI_WEATHER_URL}?city=${encodeURIComponent(city)}&extended=true&forecast=true&indices=true`

    // fetchUpstream 自带 UA + 5s 超时（按本模块口径）+ 1 次重试；
    // 404/非 ok/200+{error} 的判定语义原样保留
    const response = await fetchUpstream(url, {
      headers: {
        Accept: 'application/json',
      },
      timeoutMs: 5000,
    })

    // 404：城市名上游认不出。沿用旧链路同一句文案，
    // 前端的「未找到城市」提示与错误分支无需区分数据源
    if (response.status === 404) {
      throw new Error(`未找到城市: ${city}。请检查城市名称拼写是否正确`)
    }

    if (!response.ok) {
      throw new Error(`UAPI 天气接口请求失败: ${response.status}`)
    }

    const data = (await response.json()) as UapiWeatherResponse & { error?: string }

    // 上游异常也可能返回 200 + {error}，一并按失败处理以触发兜底
    if (!data || data.error || !data.weather) {
      throw new Error(`UAPI 天气数据异常: ${data?.error || '缺少 weather 字段'}`)
    }

    return data
  }

  /**
   * UAPI 结果组装：字段结构与 buildRealtime 对齐，
   * 前端渲染、text / markdown 三种输出都无需区分数据源。
   */
  private async buildUapiRealtime(location: string) {
    const data = await this.fetchUapiWeather(location)

    const today = data.forecast?.[0]
    const pollutants = data.air_pollutants || {}
    const updated = this.parseUapiReportTime(data.report_time)

    const province = data.province || ''
    const city = data.city || location
    const county = data.district || ''

    // 省市同名时不重复拼接：国际城市（Tokyo/Tokyo）与直辖市（北京市/北京）
    // 直接拼会输出「TokyoTokyo」「北京北京」这类明显异常的地名
    const bare = (value: string) => value.replace(/[省市]$/, '')
    const provinceName = bare(province)
    const cityName = bare(city)

    return {
      location: {
        name:
          provinceName && provinceName !== cityName ? `${provinceName}${cityName}${county}` : `${cityName}${county}`,
        province,
        city,
        county,
      },
      weather: {
        condition: data.weather || '',
        // UAPI 的 weather_icon 是数字图标码（如 "101"），不是图片地址
        condition_code: data.weather_icon || '',
        temperature: this.roundTemperature(data.temperature),
        humidity: this.safeParseInt(String(data.humidity ?? ''), 0),
        pressure: this.safeParseInt(String(data.pressure ?? ''), 0),
        precipitation: data.precipitation ?? 0,
        wind_direction: data.wind_direction || '',
        wind_power: data.wind_power || '',
        // 旧链路这里是图标图片地址，UAPI 不提供：Hero 卡按 condition 文本上色，不依赖它
        weather_icon: '',
        weather_colors: [] as string[],
        updated: updated.formatted,
        updated_at: updated.timestamp,
      },
      today: today
        ? {
            date: today.date,
            day_condition: today.weather_day || '',
            night_condition: today.weather_night || '',
            // 顶层 temp_max/temp_min 是「今天」的，作为逐日数据缺失时的兜底
            max_temperature: today.temp_max ?? data.temp_max ?? null,
            min_temperature: today.temp_min ?? data.temp_min ?? null,
            day_weather_icon: '',
            night_weather_icon: '',
          }
        : null,
      air_quality:
        data.aqi != null
          ? {
              aqi: data.aqi,
              level: data.aqi_level ?? 0,
              quality: data.aqi_category || '',
              pm25: pollutants.pm25 ?? 0,
              pm10: pollutants.pm10 ?? 0,
              co: pollutants.co ?? 0,
              no2: pollutants.no2 ?? 0,
              o3: pollutants.o3 ?? 0,
              so2: pollutants.so2 ?? 0,
              // UAPI 不提供全国排名，置 0 表示无数据（markdown 输出会跳过这一段）
              rank: 0,
              total_cities: 0,
              updated: updated.formatted,
              updated_at: updated.timestamp,
            }
          : null,
      sunrise:
        today?.sunrise && today?.sunset
          ? (() => {
              const sunriseData = this.formatUapiTime(today.date, today.sunrise)
              const sunsetData = this.formatUapiTime(today.date, today.sunset)
              return {
                sunrise: sunriseData.formatted,
                sunrise_at: sunriseData.timestamp,
                sunrise_desc: today.sunrise,
                sunset: sunsetData.formatted,
                sunset_at: sunsetData.timestamp,
                sunset_desc: today.sunset,
              }
            })()
          : null,
      life_indices: this.formatUapiLifeIndices(data.life_indices || {}),
      alerts: Array.isArray(data.alerts)
        ? data.alerts.map((alarm) => {
            const at = alarm.publish_time && dayjs(alarm.publish_time).isValid() ? dayjs(alarm.publish_time) : null
            return {
              type: alarm.type || alarm.title || '',
              level: alarm.level || '',
              level_code: '',
              province,
              city,
              county,
              detail: alarm.text || '',
              updated: at ? at.format('YYYY-MM-DD HH:mm:ss') : updated.formatted,
              updated_at: at ? at.toDate().getTime() : updated.timestamp,
            }
          })
        : [],
    }
  }

  /** UAPI 温度是浮点（国际城市如 Tokyo 21.5），旧链路是整数：统一成整数避免精度/类型不一致 */
  private roundTemperature(value: number | undefined): number {
    return Number.isFinite(value) ? Math.round(value as number) : 0
  }

  /**
   * UAPI 的 report_time 格式不统一：国内城市是相对时间（"7 分钟前发布"），
   * 国际城市是绝对时间（"2026-09-16 10:00"），文档写的又是 "2026-02-19 15:25:58"。
   * 三种都解析成时间戳；认不出就退回当前时刻（宁可显示「刚刚」，也不给出错误时间）。
   */
  private parseUapiReportTime(reportTime: string | undefined): { formatted: string; timestamp: number } {
    const now = dayjs()
    const format = (d: ReturnType<typeof dayjs>) => ({
      formatted: d.format('YYYY-MM-DD HH:mm:ss'),
      timestamp: d.toDate().getTime(),
    })

    const raw = (reportTime || '').trim()

    if (raw) {
      const relative = /(\d+)\s*(分钟|小时)前/.exec(raw)
      if (relative) {
        const value = Number(relative[1])
        return format(relative[2] === '小时' ? now.subtract(value, 'hour') : now.subtract(value, 'minute'))
      }

      if (raw.includes('刚刚')) return format(now)

      const absolute = dayjs(raw)
      if (absolute.isValid()) return format(absolute)
    }

    return format(now)
  }

  /** UAPI 的日期是 '2026-09-16'、时间是 '05:43'（旧链路分别是 '20250908' 与 '05:44'，格式不同） */
  private formatUapiTime(date: string, time: string): { formatted: string; timestamp: number } {
    const dateObj = dayjs(`${date} ${time}:00`)
    return dateObj.isValid()
      ? { formatted: dateObj.format('YYYY-MM-DD HH:mm:ss'), timestamp: dateObj.toDate().getTime() }
      : { formatted: '', timestamp: 0 }
  }

  /**
   * UAPI 生活指数用英文 key，这里映射成旧链路的 18 项中文名，
   * 让 text / markdown 输出（按中文名筛选与展示）继续可用。
   */
  private static readonly UAPI_INDEX_NAMES: Record<string, string> = {
    clothing: '穿衣指数',
    uv: '紫外线指数',
    car_wash: '洗车指数',
    drying: '晾晒指数',
    air_conditioner: '空调指数',
    cold_risk: '感冒指数',
    exercise: '运动指数',
    comfort: '舒适度指数',
    travel: '出行指数',
    fishing: '钓鱼指数',
    allergy: '过敏指数',
    sunscreen: '防晒指数',
    mood: '心情指数',
    beer: '啤酒指数',
    umbrella: '雨伞指数',
    traffic: '交通指数',
    air_purifier: '空气净化指数',
    pollen: '花粉指数',
  }

  private formatUapiLifeIndices(
    indices: Record<string, UapiLifeIndex>,
  ): { key: string; name: string; level: string; description: string }[] {
    const result: { key: string; name: string; level: string; description: string }[] = []

    for (const [key, value] of Object.entries(indices)) {
      const name = ServiceWeather.UAPI_INDEX_NAMES[key]
      if (!name || !value) continue

      result.push({
        key,
        name,
        // brief 更适合一句话场景（如「很热」），缺失时退回 level
        level: value.brief || value.level || '',
        description: value.advice || '',
      })
    }

    return result
  }

  /**
   * 实时天气结果组装：/weather 与 /weather/local 共用同一份字段结构。
   * 顺带带上今日（forecast_24h[0]）的最高/最低温——上游 weather_type 已含 forecast_24h，
   * Hero 天气卡一次请求即可拿全「当前天气 + 今日区间」，不必再调预报接口。
   */
  private async buildRealtime(cityInfo: CityInfo) {
    const [weatherData, airData] = await Promise.all([
      this.fetchCurrentWeather(cityInfo),
      this.fetchAirQuality(cityInfo),
    ])

    const observe = weatherData.observe

    if (!observe) {
      throw new Error('无法获取当前天气观测数据')
    }

    if (!airData) {
      throw new Error('无法获取空气质量数据')
    }

    const today = weatherData.forecast_24h?.[0]

    return {
      location: {
        name: `${cityInfo.province}${cityInfo.city}${cityInfo.county || ''}`.replace(/省|市/g, ''),
        province: cityInfo.province,
        city: cityInfo.city,
        county: cityInfo.county || '',
      },
      weather: {
        condition: observe.weather,
        condition_code: observe.weather_code,
        temperature: this.safeParseInt(observe.degree),
        humidity: this.safeParseInt(observe.humidity),
        pressure: this.safeParseInt(observe.pressure),
        precipitation: this.safeParseFloat(observe.precipitation),
        wind_direction: observe.wind_direction_name,
        wind_power: observe.wind_power,
        weather_icon: observe.weather_url,
        weather_colors: observe.weather_color || [],
        updated: this.formatUpdateTime(observe.update_time),
        updated_at: new Date(this.formatUpdateTime(observe.update_time)).getTime(),
      },
      today: today
        ? {
            date: today.time,
            day_condition: today.day_weather,
            night_condition: today.night_weather,
            max_temperature: this.safeParseInt(today.max_degree),
            min_temperature: this.safeParseInt(today.min_degree),
            day_weather_icon: today.day_weather_url,
            night_weather_icon: today.night_weather_url,
          }
        : null,
      air_quality: airData.air
        ? {
            aqi: airData.air.aqi,
            level: airData.air.aqi_level,
            quality: airData.air.aqi_name,
            pm25: this.safeParseInt(airData.air.pm25),
            pm10: this.safeParseInt(airData.air.pm10),
            co: this.safeParseFloat(airData.air.co),
            no2: this.safeParseInt(airData.air.no2),
            o3: this.safeParseInt(airData.air.o3),
            so2: this.safeParseInt(airData.air.so2),
            rank: airData.air.rank,
            total_cities: airData.air.total,
            updated: this.formatUpdateTime(airData.air.update_time),
            updated_at: new Date(this.formatUpdateTime(airData.air.update_time)).getTime(),
          }
        : null,
      sunrise: weatherData.rise?.[0]
        ? (() => {
            const sunriseData = this.formatSunriseTime(weatherData.rise[0].time, weatherData.rise[0].sunrise)
            const sunsetData = this.formatSunriseTime(weatherData.rise[0].time, weatherData.rise[0].sunset)
            return {
              sunrise: sunriseData.formatted,
              sunrise_at: sunriseData.timestamp,
              sunrise_desc: weatherData.rise[0].sunrise,
              sunset: sunsetData.formatted,
              sunset_at: sunsetData.timestamp,
              sunset_desc: weatherData.rise[0].sunset,
            }
          })()
        : null,
      life_indices: this.formatLifeIndices(weatherData.index || {}),
      alerts: Array.isArray(weatherData.alarm)
        ? weatherData.alarm.map((alarm) => ({
            type: alarm.type_name,
            level: alarm.level_name,
            level_code: alarm.level_code,
            province: alarm.province,
            city: alarm.city,
            county: alarm.county,
            detail: alarm.detail,
            updated: dayjs(alarm.update_time).format('YYYY-MM-DD HH:mm:ss'),
            updated_at: dayjs(alarm.update_time).toDate().getTime(),
          }))
        : [],
    }
  }

  private async getCityInfo(location: string, city: string, province: string): Promise<CityInfo> {
    const cacheKey = location.toLowerCase() + city.toLocaleLowerCase() + province.toLocaleLowerCase()

    if (this.cityCache.has(cacheKey)) {
      return this.cityCache.get(cacheKey)!
    }

    const cityInfo = await this.searchCity(location, city, province)
    this.cityCache.set(cacheKey, cityInfo)
    return cityInfo
  }

  // 城市搜索 / 天气实况 / 空气质量：同属腾讯天气接口族，Referer 必带；
  // fetchUpstream 自带 UA + 8s 超时 + 1 次重试，三处语义一致
  private readonly qqHeaders = {
    Referer: 'https://news.qq.com/',
    Accept: 'application/json',
  } as const

  private async searchCity(location: string, city: string, province: string): Promise<CityInfo> {
    const cleanLocation = location.trim()
    const encodedLocation = encodeURIComponent(cleanLocation)

    const url = `https://i.news.qq.com/city/like?source=pc&city=${encodedLocation}`

    const response = await fetchUpstream(url, {
      headers: { ...this.qqHeaders },
      timeoutMs: 8000,
    })

    if (!response.ok) {
      throw new Error(`城市搜索API请求失败: ${response.status}`)
    }

    const data = await response.json()

    if (!this.isValidCitySearchResponse(data)) {
      throw new Error('城市搜索API返回数据格式错误')
    }

    if (data.status !== 200) {
      throw new Error(`城市搜索失败: ${data.message || '未知错误'}`)
    }

    if (!data.data || Object.keys(data.data).length === 0) {
      throw new Error(`未找到城市: ${location}。请检查城市名称拼写是否正确`)
    }

    const list = Object.entries(data.data)

    const [code, locationStr] = (list.find(
      ([_, str]) => (province && str.includes(province)) || (city && str.includes(city)),
    ) || list[0]) as [string, string]

    const locationParts = locationStr.split(',').map((part) => part.trim())
    const [p, c, county] = locationParts

    return {
      name: cleanLocation,
      province: p + (p.endsWith('省') || p.endsWith('市') ? '' : '省'),
      city: c + (c.endsWith('市') ? '' : '市'),
      county: county || undefined,
      code,
    }
  }

  private async fetchCurrentWeather(cityInfo: CityInfo) {
    const province = encodeURIComponent(cityInfo.province)
    const city = encodeURIComponent(cityInfo.city)
    const county = cityInfo.county ? encodeURIComponent(cityInfo.county) : ''

    const url = `https://i.news.qq.com/weather/common?source=pc&weather_type=observe%7Cforecast_1h%7Cforecast_24h%7Cindex%7Calarm%7Climit%7Ctips%7Crise&province=${province}&city=${city}&county=${county}`

    const response = await fetchUpstream(url, {
      headers: { ...this.qqHeaders },
      timeoutMs: 8000,
    })

    if (!response.ok) {
      throw new Error(`天气数据API请求失败: ${response.status}`)
    }

    const data = await response.json()

    if (!this.isValidWeatherResponse(data)) {
      throw new Error('天气数据API返回数据格式错误')
    }

    if (data.status !== 200) {
      throw new Error(`天气数据获取失败: ${data.message || '未知错误'}`)
    }

    if (!data.data?.observe) {
      throw new Error('未获取到天气观测数据')
    }

    return data.data
  }

  private async fetchAirQuality(cityInfo: CityInfo) {
    const province = encodeURIComponent(cityInfo.province)
    const city = encodeURIComponent(cityInfo.city)

    const url = `https://i.news.qq.com/weather/common?source=pc&weather_type=air%7Crise&province=${province}&city=${city}`

    const response = await fetchUpstream(url, {
      headers: { ...this.qqHeaders },
      timeoutMs: 8000,
    })

    if (!response.ok) {
      throw new Error(`空气质量API请求失败: ${response.status}`)
    }

    const data = await response.json()

    if (!this.isValidWeatherResponse(data)) {
      throw new Error('空气质量API返回数据格式错误')
    }

    if (data.status !== 200) {
      throw new Error(`空气质量数据获取失败: ${data.message || '未知错误'}`)
    }

    return data.data
  }

  private formatUpdateTime(timeStr: string): string {
    if (timeStr.length === 12) {
      const year = timeStr.substring(0, 4)
      const month = timeStr.substring(4, 6)
      const day = timeStr.substring(6, 8)
      const hour = timeStr.substring(8, 10)
      const minute = timeStr.substring(10, 12)
      return dayjs(`${year}-${month}-${day} ${hour}:${minute}:00`).format('YYYY-MM-DD HH:mm:ss')
    }
    return timeStr
  }

  private formatSunriseTime(date: string, time: string): { formatted: string; timestamp: number } {
    // date format: "20250908", time format: "05:44"
    const year = date.substring(0, 4)
    const month = date.substring(4, 6)
    const day = date.substring(6, 8)
    const dateTimeStr = `${year}-${month}-${day} ${time}:00`
    const dateObj = dayjs(dateTimeStr)
    return {
      formatted: dateObj.format('YYYY-MM-DD HH:mm:ss'),
      timestamp: dateObj.toDate().getTime(),
    }
  }

  private formatHourlyTime(timeStr: string): string {
    if (timeStr.length === 14) {
      const year = timeStr.substring(0, 4)
      const month = timeStr.substring(4, 6)
      const day = timeStr.substring(6, 8)
      const hour = timeStr.substring(8, 10)
      const minute = timeStr.substring(10, 12)
      return `${year}-${month}-${day} ${hour}:${minute}`
    }
    return timeStr
  }

  private formatLifeIndices(
    indices: WeatherIndex,
  ): { key: string; name: string; level: string; description: string }[] {
    return Object.entries(indices)
      .filter(([, value]) => value?.name && value?.info && value?.detail)
      .map(([key, value]) => ({
        key,
        name: value.name,
        level: value.info,
        description: value.detail,
      }))
  }

  private formatWeatherText(result: any): string {
    const lines: string[] = []

    // Header with location
    lines.push(`📍 ${result.location.name}`)

    // Current weather - compact format
    const w = result.weather
    lines.push(`🌡️ ${w.condition} ${w.temperature}°C`)
    lines.push(`💨 ${w.humidity}% 🌬️ ${w.wind_direction}${w.wind_power}`)

    // Air quality - simplified
    if (result.air_quality) {
      const aq = result.air_quality
      const aqiEmoji = aq.aqi <= 50 ? '😊' : aq.aqi <= 100 ? '😐' : '😷'
      lines.push(`${aqiEmoji} AQI ${aq.aqi} PM2.5:${aq.pm25}`)
    }

    // Sunrise/sunset - compact
    if (result.sunrise) {
      lines.push(`🌅 ${result.sunrise.sunrise_desc} 🌇 ${result.sunrise.sunset_desc}`)
    }

    // Key life indices - only show important ones
    if (result.life_indices && result.life_indices.length > 0) {
      const important = result.life_indices
        .filter((idx: any) => ['穿衣指数', '运动指数', '洗车指数', '紫外线指数'].includes(idx.name))
        .slice(0, 2)
      important.forEach((idx: any) => {
        const emoji = idx.name.includes('穿衣')
          ? '👕'
          : idx.name.includes('运动')
            ? '🏃'
            : idx.name.includes('洗车')
              ? '🚗'
              : '☀️'
        lines.push(`${emoji} ${idx.name}:${idx.level}`)
      })
    }

    // Alerts - compact
    if (result.alerts && result.alerts.length > 0) {
      result.alerts.forEach((alert: any) => {
        lines.push(`⚠️ ${alert.type}${alert.level}`)
      })
    }

    return lines.join('\n')
  }

  private formatForecastText(result: any): string {
    const lines: string[] = []

    // Header
    lines.push(`📍 ${result.location.name} 🔮 预报`)

    // Today's hourly (next 6 hours)
    if (result.hourly_forecast && result.hourly_forecast.length > 0) {
      lines.push('🕰️ 今日逐时:')
      result.hourly_forecast.slice(0, 6).forEach((hour: any) => {
        const time = hour.datetime.split(' ')[1].slice(0, 5)
        lines.push(`${time} ${hour.condition} ${hour.temperature}°`)
      })
    }

    // Daily forecast - very compact
    if (result.daily_forecast && result.daily_forecast.length > 0) {
      lines.push('\n📅 未来几日:')
      result.daily_forecast.forEach((day: any) => {
        const date = day.date.slice(-2) + '日'
        const temp = `${day.min_temperature}-${day.max_temperature}°`
        const aqi = day.aqi <= 50 ? '😊' : day.aqi <= 100 ? '😐' : '😷'
        lines.push(`${date} ${day.day_condition} ${temp} ${aqi}${day.aqi}`)
      })
    }

    return lines.join('\n')
  }

  private formatWeatherMarkdown(result: any): string {
    const sections: string[] = []

    // Header
    sections.push(`# 🌤️ ${result.location.name} 天气`)

    // Current weather
    const w = result.weather
    sections.push(
      `## 当前天气\n\n**${w.condition}** ${w.temperature}°C\n\n- 💧 **湿度**: ${w.humidity}%\n- 🌬️ **风向风力**: ${w.wind_direction} ${w.wind_power}\n- 🌡️ **气压**: ${w.pressure}hPa\n- 🌧️ **降水量**: ${w.precipitation}mm\n\n*更新时间: ${w.updated}*`,
    )

    // Air quality
    if (result.air_quality) {
      const aq = result.air_quality
      const aqiEmoji = aq.aqi <= 50 ? '😊' : aq.aqi <= 100 ? '😐' : aq.aqi <= 150 ? '😟' : aq.aqi <= 200 ? '😷' : '🤢'
      // 全国排名只有腾讯源提供；UAPI 源置 0，此时整段略去而不是显示 0/0
      const rank = aq.rank > 0 ? ` (全国排名 ${aq.rank}/${aq.total_cities})` : ''
      sections.push(
        `## 空气质量 ${aqiEmoji}\n\n**${aq.quality}** AQI: **${aq.aqi}**${rank}\n\n| 指标 | 数值 |\n|------|------|\n| PM2.5 | ${aq.pm25} μg/m³ |\n| PM10 | ${aq.pm10} μg/m³ |\n| NO₂ | ${aq.no2} μg/m³ |\n| SO₂ | ${aq.so2} μg/m³ |\n| O₃ | ${aq.o3} μg/m³ |\n| CO | ${aq.co} mg/m³ |\n\n*更新时间: ${aq.updated}*`,
      )
    }

    // Sunrise/sunset
    if (result.sunrise) {
      sections.push(
        `## 日出日落 🌅\n\n- 🌄 **日出**: ${result.sunrise.sunrise_desc}\n- 🌆 **日落**: ${result.sunrise.sunset_desc}`,
      )
    }

    // Life indices
    if (result.life_indices && result.life_indices.length > 0) {
      sections.push(
        `## 生活指数\n\n${result.life_indices.map((idx: any) => `### ${idx.name}\n\n**${idx.level}**\n\n${idx.description}`).join('\n\n')}`,
      )
    }

    // Alerts
    if (result.alerts && result.alerts.length > 0) {
      sections.push(
        `## ⚠️ 预警信息\n\n${result.alerts.map((alert: any) => `### ${alert.type} ${alert.level}\n\n**地区**: ${alert.province} ${alert.city} ${alert.county}\n\n${alert.detail}\n\n*发布时间: ${alert.updated}*`).join('\n\n---\n\n')}`,
      )
    }

    return sections.join('\n\n')
  }

  private formatForecastMarkdown(result: any): string {
    const sections: string[] = []

    // Header
    sections.push(`# 🔮 ${result.location.name} 天气预报`)

    // Hourly forecast
    if (result.hourly_forecast && result.hourly_forecast.length > 0) {
      sections.push(
        `## 逐小时预报\n\n| 时间 | 天气 | 温度 | 风向风力 |\n|------|------|------|----------|\n${result.hourly_forecast
          .slice(0, 12)
          .map(
            (hour: any) =>
              `| ${hour.datetime.split(' ')[1].slice(0, 5)} | ${hour.condition} | ${hour.temperature}°C | ${hour.wind_direction}${hour.wind_power} |`,
          )
          .join('\n')}`,
      )
    }

    // Daily forecast
    if (result.daily_forecast && result.daily_forecast.length > 0) {
      sections.push(
        `## 未来${result.daily_forecast.length}天预报\n\n${result.daily_forecast
          .map((day: any) => {
            const aqiEmoji = day.aqi <= 50 ? '😊' : day.aqi <= 100 ? '😐' : day.aqi <= 150 ? '😟' : '😷'
            return `### ${day.date}\n\n**白天**: ${day.day_condition} | **夜间**: ${day.night_condition}\n\n🌡️ **${day.min_temperature}°C ~ ${day.max_temperature}°C**\n\n- 💨 **白天风力**: ${day.day_wind_direction}${day.day_wind_power}\n- 🌙 **夜间风力**: ${day.night_wind_direction}${day.night_wind_power}\n- ${aqiEmoji} **空气质量**: ${day.air_quality} (AQI ${day.aqi})`
          })
          .join('\n\n---\n\n')}`,
      )
    }

    // Sunrise/sunset table
    if (result.sunrise_sunset && result.sunrise_sunset.length > 0) {
      sections.push(
        `## 日出日落时间\n\n| 日出 🌄 | 日落 🌆 |\n|---------|----------|\n${result.sunrise_sunset.map((day: any) => `| ${day.sunrise_desc} | ${day.sunset_desc} |`).join('\n')}`,
      )
    }

    return sections.join('\n\n')
  }
}

export const serviceWeather = new ServiceWeather()
