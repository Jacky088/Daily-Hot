import chineseDays from 'chinese-days'
import { Common, dayjs, renderByEncoding } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

const { isHoliday, isWorkday, getDayDetail, getLunarDate, getSolarTerms, getLunarFestivals } = chineseDays

/**
 * 摸鱼日历服务
 * 包含：节假日、工作日、农历、节气、重要节日、周末、倒计时等信息
 * 专为打工人提供摸鱼必备信息
 */
class ServiceMoyu {
  private cache = new Map<string, MoyuCalendar>()
  private lastCacheDate: string = ''

  /**
   * 从 chinese-days 返回的节日名称中提取中文名称
   * chinese-days 返回格式: "New Year's Day,元旦,1"
   * 提取第二部分(中文名称): "元旦"
   */
  private extractChineseName(holidayName: string | null): string | null {
    if (!holidayName) return null
    const parts = holidayName.split(',')
    // 返回第二部分(中文名称),如果不存在则返回原始字符串
    return parts.length >= 2 ? parts[1].trim() : holidayName
  }

  handle(): RouterMiddleware<'/moyu'> {
    return async (ctx) => {
      const dateParam = await Common.getParam('date', ctx.request)
      const data = this.getCalendarInfo(dateParam)

      renderByEncoding(ctx, {
        text: () => {
          let body = '🐟 摸鱼办·打工人日历\n\n'
          body += `📆 ${data.date.gregorian} ${data.date.weekday}\n`
          body += `🌙 农历 ${data.date.lunar.yearCN}年 ${data.date.lunar.monthCN}${data.date.lunar.dayCN}\n`
          body += `🐯 ${data.date.lunar.zodiac}年 ${data.date.lunar.yearGanZhi}\n\n`
          if (data.currentHoliday) {
            body += `🎉 恭喜！您正处于【${this.extractChineseName(data.currentHoliday.name)}】假期中！\n`
            body += `📅 今天是假期的第 ${data.currentHoliday.dayOfHoliday} 天，还剩 ${data.currentHoliday.daysRemaining} 天（含今天）\n`
            body += `💡 好好享受假期吧，打工人！\n\n`
          } else {
            if (data.today.isWeekend) {
              body += `🎉 太好了！今天是周末，可以愉快摸鱼！\n\n`
            } else if (data.today.isHoliday) {
              body += `🎊 耶！今天是节假日【${this.extractChineseName(data.today.holidayName)}】，尽情摸鱼吧！\n\n`
            } else if (data.today.isWorkday) {
              if (data.today.isWeekend) {
                body += `😢 悲报：今天周末要调休上班，但也要坚持摸鱼！\n\n`
              } else {
                body += `💼 今天是工作日，低调摸鱼，注意老板！\n\n`
              }
            }
          }
          if (data.today.solarTerm) {
            body += `🌾 今日节气：${data.today.solarTerm}\n`
          }
          if (data.today.lunarFestivals.length > 0) {
            body += `🏮 农历节日：${data.today.lunarFestivals.join('、')}\n`
          }
          body += `\n⏰ 摸鱼倒计时\n`
          if (data.countdown.toWeekEnd > 0) {
            body += `📅 距离周末：还要熬 ${data.countdown.toWeekEnd} 天\n`
          } else {
            body += `📅 距离周末：今天就是周末！尽情摸鱼！\n`
          }
          if (data.countdown.toFriday > 0) {
            body += `🎊 距离周五：还要熬 ${data.countdown.toFriday} 天\n`
          } else if (data.date.dayOfWeek === 5) {
            body += `🎊 距离周五：今天就是周五！周末近在眼前！\n`
          }
          body += `🗓️ 距离月底：还剩 ${data.countdown.toMonthEnd} 天\n`
          body += `📊 距离年底：还剩 ${data.countdown.toYearEnd} 天\n`
          if (data.nextHoliday) {
            if (data.nextHoliday.until === 0) {
              body += `🎯 距离假期：就是明天啦！收拾行李准备摸鱼！\n`
            } else {
              body += `🎯 距离【${this.extractChineseName(data.nextHoliday.name)}】：还要搬砖 ${data.nextHoliday.until} 天\n`
            }
          }
          body += `\n📊 摸鱼进度条\n`
          body += `▓${'█'.repeat(Math.floor(data.progress.week.percentage / 5))}${'░'.repeat(20 - Math.floor(data.progress.week.percentage / 5))}▓ 本周 ${data.progress.week.percentage}%\n`
          body += `▓${'█'.repeat(Math.floor(data.progress.month.percentage / 5))}${'░'.repeat(20 - Math.floor(data.progress.month.percentage / 5))}▓ 本月 ${data.progress.month.percentage}%\n`
          body += `▓${'█'.repeat(Math.floor(data.progress.year.percentage / 5))}${'░'.repeat(20 - Math.floor(data.progress.year.percentage / 5))}▓ 本年 ${data.progress.year.percentage}%\n`
          if (data.nextHoliday) {
            body += `\n🎯 下一个带薪摸鱼日\n`
            body += `🎊 节日：${this.extractChineseName(data.nextHoliday.name)}\n`
            body += `📅 日期：${data.nextHoliday.date}\n`
            body += `⏱️ 时长：${data.nextHoliday.duration} 天\n`
            if (data.nextHoliday.workdays && data.nextHoliday.workdays.length > 0) {
              body += `💼 调休：需要，${data.nextHoliday.workdays.join('、')}\n`
            } else {
              body += `💼 调休：无需调休，爽！\n`
            }
          }
          body += `\n💬 摸鱼格言\n`
          body += data.moyuQuote + '\n'
          return body
        },
        markdown: () => {
          let body = '# 🐟 摸鱼办·打工人日历\n\n'
          body += `> 专为打工人打造的摸鱼必备工具\n\n`
          body += `## 📆 今日信息\n\n`
          body += `- **公历**: ${data.date.gregorian} ${data.date.weekday}\n`
          body += `- **农历**: ${data.date.lunar.yearCN}年 ${data.date.lunar.monthCN}${data.date.lunar.dayCN}\n`
          body += `- **干支**: ${data.date.lunar.zodiac}年 ${data.date.lunar.yearGanZhi}\n`
          body += `- **月柱**: ${data.date.lunar.monthGanZhi}\n`
          body += `- **日柱**: ${data.date.lunar.dayGanZhi}\n\n`
          body += `## 🎯 摸鱼状态\n\n`
          if (data.currentHoliday) {
            body += `### 🎉 当前假期中\n\n`
            body += `**【${this.extractChineseName(data.currentHoliday.name)}】假期进行中！**\n\n`
            body += `- 📅 今天是假期的第 **${data.currentHoliday.dayOfHoliday}** 天\n`
            body += `- ⏰ 还剩 **${data.currentHoliday.daysRemaining}** 天（含今天）\n`
            body += `- 💡 好好享受假期吧，打工人！\n\n`
          } else {
            if (data.today.isWeekend) {
              body += `🎉 **太好了！今天是周末，可以愉快摸鱼！**\n\n`
            } else if (data.today.isHoliday) {
              body += `🎊 **节假日**: ${this.extractChineseName(data.today.holidayName)}，尽情摸鱼吧！\n\n`
            } else if (data.today.isWorkday) {
              if (data.today.isWeekend) {
                body += `😢 **悲报**: 今天周末要调休上班，但也要坚持摸鱼！\n\n`
              } else {
                body += `💼 **工作日**: 低调摸鱼，注意老板！\n\n`
              }
            }
          }
          if (data.today.solarTerm) {
            body += `🌾 **节气**: ${data.today.solarTerm}\n\n`
          }
          if (data.today.lunarFestivals.length > 0) {
            body += `🏮 **农历节日**: ${data.today.lunarFestivals.join('、')}\n\n`
          }
          body += `## ⏰ 摸鱼倒计时\n\n`
          body += `| 项目 | 倒计时 |\n`
          body += `|------|--------|\n`
          body += `| 📅 距离周末 | ${data.countdown.toWeekEnd === 0 ? '今天就是周末！' : `还要熬 ${data.countdown.toWeekEnd} 天`} |\n`
          if (data.countdown.toFriday >= 0) {
            body += `| 🎊 距离周五 | ${data.countdown.toFriday === 0 ? '今天就是周五！' : `还要熬 ${data.countdown.toFriday} 天`} |\n`
          }
          body += `| 🗓️ 距离月底 | 还剩 ${data.countdown.toMonthEnd} 天 |\n`
          body += `| 📊 距离年底 | 还剩 ${data.countdown.toYearEnd} 天 |\n`
          if (data.nextHoliday) {
            body += `| 🎯 距离假期 | ${data.nextHoliday.until === 0 ? '就是明天啦！' : `还要搬砖 ${data.nextHoliday.until} 天`} |\n`
          }
          body += `\n`
          body += `## 📊 摸鱼进度条\n\n`
          body += `| 维度 | 已摸 | 总共 | 进度 |\n`
          body += `|------|------|------|------|\n`
          body += `| 📅 本周 | ${data.progress.week.passed} 天 | ${data.progress.week.total} 天 | ${data.progress.week.percentage}% |\n`
          body += `| 📆 本月 | ${data.progress.month.passed} 天 | ${data.progress.month.total} 天 | ${data.progress.month.percentage}% |\n`
          body += `| 📊 本年 | ${data.progress.year.passed} 天 | ${data.progress.year.total} 天 | ${data.progress.year.percentage}% |\n\n`
          if (data.nextHoliday) {
            body += `## 🎯 下一个带薪摸鱼日\n\n`
            body += `- **假期名称**: ${this.extractChineseName(data.nextHoliday.name)}\n`
            body += `- **开始日期**: ${data.nextHoliday.date}\n`
            body += `- **倒计时**: ${data.nextHoliday.until === 0 ? '就是明天啦！收拾行李准备摸鱼！' : `再坚持 ${data.nextHoliday.until} 天！`}\n`
            body += `- **可摸时长**: ${data.nextHoliday.duration} 天\n`
            if (data.nextHoliday.workdays && data.nextHoliday.workdays.length > 0) {
              body += `- **调休日期**: ${data.nextHoliday.workdays.join('、')}\n`
            } else {
              body += `- **是否调休**: 无需调休，爽！\n`
            }
            body += `\n`
          }
          body += `## 💬 摸鱼格言\n\n`
          body += `> ${data.moyuQuote}\n\n`
          return body
        },
        json: () => Common.buildJson(data),
      })
    }
  }

  /**
   * 获取摸鱼日历信息
   */
  private getCalendarInfo(dateStr?: string): MoyuCalendar {
    const targetDate = dateStr ? dayjs(dateStr) : dayjs()
    const today = targetDate.startOf('day')
    const cacheKey = today.format('YYYY-MM-DD')

    // 缓存管理：清除旧缓存
    if (cacheKey !== this.lastCacheDate) {
      this.cache.clear()
      this.lastCacheDate = cacheKey
    }

    // 检查缓存
    const cachedEntry = this.cache.get(cacheKey)
    if (cachedEntry) {
      return cachedEntry
    }

    // 基础日期信息
    const gregorianDate = today.format('YYYY-MM-DD')
    const lunarInfo = getLunarDate(gregorianDate)
    const dayOfWeek = today.day() // 0 = Sunday, 6 = Saturday
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

    // 今日状态
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHolidayToday = isHoliday(gregorianDate)
    const isWorkdayToday = isWorkday(gregorianDate)
    const dayDetail = getDayDetail(gregorianDate)

    // 节气信息
    const solarTermsToday = getSolarTerms(gregorianDate, gregorianDate)
    const solarTermName = solarTermsToday.length > 0 ? solarTermsToday[0].name : null

    // 农历节日
    const lunarFestivalsToday = getLunarFestivals(gregorianDate, gregorianDate)
    const lunarFestivalNames = lunarFestivalsToday.length > 0 ? lunarFestivalsToday[0].name : []

    // 时间进度
    const progress = this.calculateProgress(today)

    // 当前假期状态
    const currentHoliday = this.findCurrentHoliday(today)

    // 下一个假期
    const nextHoliday = this.findNextHoliday(today)

    // 下一个周末
    const nextWeekend = this.findNextWeekend(today)

    // 倒计时
    const countdown = this.calculateCountdown(today)

    // 摸鱼格言
    const moyuQuote = this.getMoyuQuote(today)

    const result: MoyuCalendar = {
      date: {
        gregorian: gregorianDate,
        weekday: weekdays[dayOfWeek],
        dayOfWeek,
        lunar: {
          year: lunarInfo.lunarYear,
          month: lunarInfo.lunarMon,
          day: lunarInfo.lunarDay,
          yearCN: lunarInfo.lunarYearCN,
          monthCN: lunarInfo.lunarMonCN,
          dayCN: lunarInfo.lunarDayCN,
          isLeapMonth: lunarInfo.isLeap,
          yearGanZhi: lunarInfo.yearCyl,
          monthGanZhi: lunarInfo.monCyl,
          dayGanZhi: lunarInfo.dayCyl,
          zodiac: lunarInfo.zodiac,
        },
      },
      today: {
        isWeekend,
        isHoliday: isHolidayToday,
        isWorkday: isWorkdayToday,
        holidayName: isHolidayToday ? this.extractChineseName(dayDetail.name) : null,
        solarTerm: solarTermName,
        lunarFestivals: lunarFestivalNames,
      },
      progress,
      currentHoliday,
      nextHoliday,
      nextWeekend,
      countdown,
      moyuQuote,
    }

    this.cache.set(cacheKey, result)
    return result
  }

  /**
   * 计算时间进度
   */
  private calculateProgress(today: ReturnType<typeof dayjs>) {
    // 本周进度（周一到周日）
    const startOfWeek = today.day() === 0 ? today.subtract(6, 'day') : today.subtract(today.day() - 1, 'day')
    const weekPassed = today.diff(startOfWeek, 'day') + 1
    const weekTotal = 7
    const weekPercentage = Math.round((weekPassed / weekTotal) * 100)

    // 本月进度
    const endOfMonth = today.endOf('month')
    const monthPassed = today.date()
    const monthTotal = endOfMonth.date()
    const monthPercentage = Math.round((monthPassed / monthTotal) * 100)

    // 本年进度
    const startOfYear = today.startOf('year')
    const endOfYear = today.endOf('year')
    const yearPassed = today.diff(startOfYear, 'day') + 1
    const yearTotal = endOfYear.diff(startOfYear, 'day') + 1
    const yearPercentage = Math.round((yearPassed / yearTotal) * 100)

    return {
      week: {
        passed: weekPassed,
        total: weekTotal,
        remaining: weekTotal - weekPassed,
        percentage: weekPercentage,
      },
      month: {
        passed: monthPassed,
        total: monthTotal,
        remaining: monthTotal - monthPassed,
        percentage: monthPercentage,
      },
      year: {
        passed: yearPassed,
        total: yearTotal,
        remaining: yearTotal - yearPassed,
        percentage: yearPercentage,
      },
    }
  }

  /**
   * 查找当前假期状态
   */
  private findCurrentHoliday(today: ReturnType<typeof dayjs>) {
    const dateStr = today.format('YYYY-MM-DD')

    // 检查今天是否是假期
    if (!isHoliday(dateStr)) {
      return null
    }

    const detail = getDayDetail(dateStr)

    // 查找假期开始日期
    let startDate = today
    while (startDate.subtract(1, 'day').format('YYYY-MM-DD') >= '2000-01-01') {
      const prevDateStr = startDate.subtract(1, 'day').format('YYYY-MM-DD')
      if (!isHoliday(prevDateStr)) {
        break
      }
      startDate = startDate.subtract(1, 'day')
    }

    // 计算假期总天数
    let duration = 0
    let checkDate = startDate
    while (isHoliday(checkDate.format('YYYY-MM-DD'))) {
      duration++
      checkDate = checkDate.add(1, 'day')
    }

    const dayOfHoliday = today.diff(startDate, 'day') + 1
    const daysRemaining = duration - dayOfHoliday + 1

    return {
      name: this.extractChineseName(detail.name) || detail.name,
      dayOfHoliday,
      daysRemaining,
      totalDays: duration,
    }
  }

  /**
   * 查找下一个法定假期（排除周末）
   */
  private findNextHoliday(today: ReturnType<typeof dayjs>) {
    // 使用 chinese-days 来查找接下来365天内的法定假期
    const searchEnd = today.add(365, 'day')
    let currentCheck = today.add(1, 'day')

    while (currentCheck.isBefore(searchEnd)) {
      const dateStr = currentCheck.format('YYYY-MM-DD')
      const dayOfWeek = currentCheck.day()
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6

      // 只查找非周末的节假日，或者是调休后的周末假期
      if (isHoliday(dateStr) && !isWeekendDay) {
        const detail = getDayDetail(dateStr)
        // 找到假期开始日期，计算持续天数
        let duration = 0
        let checkDate = currentCheck
        while (isHoliday(checkDate.format('YYYY-MM-DD'))) {
          duration++
          checkDate = checkDate.add(1, 'day')
        }

        return {
          name: this.extractChineseName(detail.name) || detail.name,
          date: dateStr,
          until: currentCheck.diff(today, 'day'),
          duration,
          workdays: [], // chinese-days 不直接提供这个信息
        }
      }
      currentCheck = currentCheck.add(1, 'day')
    }

    return null
  }

  /**
   * 查找下一个周末
   */
  private findNextWeekend(today: ReturnType<typeof dayjs>) {
    let currentCheck = today.add(1, 'day')
    const dayOfWeek = currentCheck.day()

    // 如果不是周末，找到下一个周六
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const daysUntilSaturday = 6 - dayOfWeek
      currentCheck = currentCheck.add(daysUntilSaturday, 'day')
    }

    return {
      date: currentCheck.format('YYYY-MM-DD'),
      weekday: currentCheck.day() === 6 ? '星期六' : '星期日',
      daysUntil: currentCheck.diff(today, 'day'),
    }
  }

  /**
   * 计算各种倒计时
   */
  private calculateCountdown(today: ReturnType<typeof dayjs>) {
    const dayOfWeek = today.day()

    // 距离周末（周六）
    let toWeekEnd = 0
    if (dayOfWeek === 0) {
      // 周日，距离下周六还有6天
      toWeekEnd = 6
    } else if (dayOfWeek === 6) {
      // 周六，已经是周末
      toWeekEnd = 0
    } else {
      // 工作日，计算距离本周六的天数
      toWeekEnd = 6 - dayOfWeek
    }

    // 距离周五
    let toFriday = 0
    if (dayOfWeek === 5) {
      // 今天是周五
      toFriday = 0
    } else if (dayOfWeek === 6 || dayOfWeek === 0) {
      // 周末，距离下周五
      toFriday = dayOfWeek === 6 ? 6 : 5
    } else {
      // 工作日
      toFriday = 5 - dayOfWeek
    }

    // 距离月底
    const endOfMonth = today.endOf('month')
    const toMonthEnd = endOfMonth.diff(today, 'day')

    // 距离年底
    const endOfYear = today.endOf('year')
    const toYearEnd = endOfYear.diff(today, 'day')

    return {
      toWeekEnd,
      toFriday,
      toMonthEnd,
      toYearEnd,
    }
  }

  /**
   * 获取摸鱼格言（根据日期随机，但同一天固定）
   */
  private getMoyuQuote(today: ReturnType<typeof dayjs>) {
    const quotes = [
      '工作再累，一天也是24小时；摸鱼再爽，一天也是24小时。既然都是24小时，为什么不选择爽呢？',
      '老板赚的是我们加班的钱，我摸的是老板的鱼。谁占便宜还不一定呢。',
      '认真工作只会让你的老板买上更好的车，而摸鱼会让你的心情更加愉悦。',
      '打工人，打工魂，打工都是人上人。摸鱼人，摸鱼魂，摸鱼才是人上人！',
      '你在认真工作的时候，有人在摸鱼。你在加班的时候，有人在钓鱼。人生苦短，及时摸鱼。',
      '世界上有两种人：一种是在认真工作，一种是在摸鱼。前者为老板打工，后者为自己打工。',
      '别人上班赚工资，我上班只为摸鱼。我们不一样，不一样～',
      '有的人为了工作而活着，有的人为了摸鱼而工作。我显然属于后者。',
      '摸鱼使我快乐，加班令我痛苦。人生在世，当然要追求快乐啊！',
      '钱是老板的，命是自己的。工作做不完还有明天，命没了就真的没了。',
      '今日摸鱼，明日也摸。日日摸鱼，心情大好！',
      '认真上班的人不一定会升职加薪，但会认真摸鱼的人一定会快乐无边。',
      '工作做得再好，老板也只会说：这是你应该做的。但摸鱼带来的快乐，是实实在在的！',
      '我的座右铭：能坐着绝不站着，能躺着绝不坐着，能摸鱼绝不工作。',
      '老板喊你认真干活的时候，请记住：他是在为他自己的梦想买单，而不是你的。',
    ]

    // 使用日期作为种子，保证同一天返回相同的格言
    const dateNum = parseInt(today.format('YYYYMMDD'))
    const index = dateNum % quotes.length

    return quotes[index]
  }
}

export const serviceMoyu = new ServiceMoyu()

// ==================== 类型定义 ====================

/**
 * 摸鱼日历信息响应
 */
interface MoyuCalendar {
  /**
   * 日期信息
   */
  date: {
    /**
     * 公历日期 YYYY-MM-DD
     */
    gregorian: string
    /**
     * 星期几（中文）
     */
    weekday: string
    /**
     * 星期几（数字 0-6，0 为周日）
     */
    dayOfWeek: number
    /**
     * 农历信息
     */
    lunar: {
      /**
       * 农历年份（数字）
       */
      year: number
      /**
       * 农历月份（数字）
       */
      month: number
      /**
       * 农历日期（数字）
       */
      day: number
      /**
       * 农历年份（中文）
       */
      yearCN: string
      /**
       * 农历月份（中文）
       */
      monthCN: string
      /**
       * 农历日期（中文）
       */
      dayCN: string
      /**
       * 是否闰月
       */
      isLeapMonth: boolean
      /**
       * 年柱（天干地支）
       */
      yearGanZhi: string
      /**
       * 月柱（天干地支）
       */
      monthGanZhi: string
      /**
       * 日柱（天干地支）
       */
      dayGanZhi: string
      /**
       * 生肖
       */
      zodiac: string
    }
  }
  /**
   * 今日状态
   */
  today: {
    /**
     * 是否周末
     */
    isWeekend: boolean
    /**
     * 是否节假日
     */
    isHoliday: boolean
    /**
     * 是否工作日
     */
    isWorkday: boolean
    /**
     * 节假日名称（如果是节假日）
     */
    holidayName: string | null
    /**
     * 节气名称（如果当天是节气）
     */
    solarTerm: string | null
    /**
     * 农历节日列表
     */
    lunarFestivals: string[]
  }
  /**
   * 时间进度
   */
  progress: {
    /**
     * 本周进度
     */
    week: TimeProgress
    /**
     * 本月进度
     */
    month: TimeProgress
    /**
     * 本年进度
     */
    year: TimeProgress
  }
  /**
   * 当前假期信息（如果正在假期中）
   */
  currentHoliday: CurrentHoliday | null
  /**
   * 下一个假期
   */
  nextHoliday: NextHoliday | null
  /**
   * 下一个周末
   */
  nextWeekend: NextWeekend | null
  /**
   * 倒计时信息
   */
  countdown: Countdown
  /**
   * 摸鱼格言
   */
  moyuQuote: string
}

/**
 * 时间进度
 */
interface TimeProgress {
  /**
   * 已过天数
   */
  passed: number
  /**
   * 总天数
   */
  total: number
  /**
   * 剩余天数
   */
  remaining: number
  /**
   * 进度百分比
   */
  percentage: number
}

/**
 * 下一个假期
 */
interface NextHoliday {
  /**
   * 假期名称
   */
  name: string
  /**
   * 假期开始日期 YYYY-MM-DD
   */
  date: string
  /**
   * 距离假期的天数
   */
  until: number
  /**
   * 假期持续天数
   */
  duration: number
  /**
   * 调休工作日列表
   */
  workdays: string[]
}

/**
 * 下一个周末
 */
interface NextWeekend {
  /**
   * 周末日期 YYYY-MM-DD
   */
  date: string
  /**
   * 星期几
   */
  weekday: string
  /**
   * 距离周末的天数
   */
  daysUntil: number
}

/**
 * 当前假期信息
 */
interface CurrentHoliday {
  /**
   * 假期名称
   */
  name: string
  /**
   * 假期的第几天
   */
  dayOfHoliday: number
  /**
   * 还剩几天（含今天）
   */
  daysRemaining: number
  /**
   * 假期总天数
   */
  totalDays: number
}

/**
 * 倒计时信息
 */
interface Countdown {
  /**
   * 距离周末（周六）的天数
   */
  toWeekEnd: number
  /**
   * 距离周五的天数
   */
  toFriday: number
  /**
   * 距离月底的天数
   */
  toMonthEnd: number
  /**
   * 距离年底的天数
   */
  toYearEnd: number
}
