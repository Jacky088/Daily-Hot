import { Common } from '../../common.ts'
import commonPasswordsData from './passwords.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

interface PasswordParams {
  length: number
  includeNumbers: boolean
  includeSymbols: boolean
  includeLowercase: boolean
  includeUppercase: boolean
  excludeSimilar: boolean
  excludeAmbiguous: boolean
}

interface PasswordResult {
  password: string
  length: number
  config: {
    include_numbers: boolean
    include_symbols: boolean
    include_lowercase: boolean
    include_uppercase: boolean
    exclude_similar: boolean
    exclude_ambiguous: boolean
  }
  character_sets: {
    lowercase: string
    uppercase: string
    numbers: string
    symbols: string
    used_sets: string[]
  }
  generation_info: {
    entropy: number
    strength: string
    time_to_crack: string
  }
}

interface PasswordStrengthResult {
  password: string
  length: number
  score: number
  strength: string
  entropy: number
  time_to_crack: string
  character_analysis: {
    has_lowercase: boolean
    has_uppercase: boolean
    has_numbers: boolean
    has_symbols: boolean
    has_repeated: boolean
    has_sequential: boolean
    character_variety: number
  }
  recommendations: string[]
  security_tips: string[]
}

// 时长数值：≥10 取整，<10 保留 1 位小数
function formatAmount(value: number): string {
  if (value >= 10) return String(Math.round(value))
  return String(Math.round(value * 10) / 10)
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

function toSuperscript(num: number): string {
  return String(num)
    .split('')
    .map((ch) => SUPERSCRIPT_DIGITS[ch] ?? ch)
    .join('')
}

class ServicePassword {
  private readonly LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
  private readonly UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  private readonly NUMBERS = '0123456789'
  private readonly SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?'

  private readonly SIMILAR_CHARS = 'il1Lo0O'
  private readonly AMBIGUOUS_CHARS = '{}[]()/\\\'"`~,;.<>'

  handle(): RouterMiddleware<'/password'> {
    return async (ctx) => {
      const length = await Common.getParam('length', ctx.request)
      const includeNumbers = await Common.getParam('numbers', ctx.request)
      const includeSymbols = await Common.getParam('symbols', ctx.request)
      const includeLowercase = await Common.getParam('lowercase', ctx.request)
      const includeUppercase = await Common.getParam('uppercase', ctx.request)
      const excludeSimilar = (await Common.getParam('exclude_similar', ctx.request)) || 'true'
      const excludeAmbiguous = (await Common.getParam('exclude_ambiguous', ctx.request)) || 'true'

      const params = this.parsePasswordParams({
        length,
        includeNumbers,
        includeSymbols,
        includeLowercase,
        includeUppercase,
        excludeSimilar,
        excludeAmbiguous,
      })

      if (!this.validateParams(params, ctx)) {
        return
      }

      const result = this.generatePassword(params)

      switch (ctx.state.encoding) {
        case 'text-detail':
          ctx.response.body = this.formatPasswordAsText(result)
          break
        case 'text':
          ctx.response.body = result.password
          break
        case 'markdown':
          ctx.response.body = this.formatPasswordAsMarkdown(result)
          break
        case 'json':
        default:
          ctx.response.body = Common.buildJson(result)
          break
      }
    }
  }

  handleCheck(): RouterMiddleware<'/password/check'> {
    return async (ctx) => {
      const password = await Common.getParam('password', ctx.request)

      if (!password) {
        Common.requireArguments(['password'], ctx.response)
        return
      }

      if (password.length > 128) {
        ctx.response.status = 400
        ctx.response.body = Common.buildJson(null, 400, '密码长度不能超过 128 个字符')
        return
      }

      const result = this.checkPasswordStrength(password)

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = this.formatStrengthAsText(result)
          break
        case 'markdown':
          ctx.response.body = this.formatStrengthAsMarkdown(result)
          break
        case 'json':
        default:
          ctx.response.body = Common.buildJson(result)
          break
      }
    }
  }

  private parsePasswordParams(raw: any): PasswordParams {
    return {
      length: raw.length ? Number.parseInt(raw.length) : 16,
      includeNumbers: raw.includeNumbers !== 'false' && raw.includeNumbers !== '0',
      includeSymbols: raw.includeSymbols === 'true' || raw.includeSymbols === '1',
      includeLowercase: raw.includeLowercase !== 'false' && raw.includeLowercase !== '0',
      includeUppercase: raw.includeUppercase !== 'false' && raw.includeUppercase !== '0',
      excludeSimilar: raw.excludeSimilar === 'true' || raw.excludeSimilar === '1',
      excludeAmbiguous: raw.excludeAmbiguous === 'true' || raw.excludeAmbiguous === '1',
    }
  }

  private validateParams(params: PasswordParams, ctx: any): boolean {
    if (Number.isNaN(params.length) || params.length < 4 || params.length > 128) {
      ctx.response.status = 400
      ctx.response.body = Common.buildJson(null, 400, '密码长度必须在 4-128 之间')
      return false
    }

    if (!params.includeNumbers && !params.includeSymbols && !params.includeLowercase && !params.includeUppercase) {
      ctx.response.status = 400
      ctx.response.body = Common.buildJson(null, 400, '至少需要包含一种字符类型（数字、符号、小写字母、大写字母）')
      return false
    }

    return true
  }

  private generatePassword(params: PasswordParams): PasswordResult {
    let charset = ''
    const usedSets: string[] = []

    let lowercase = this.LOWERCASE
    let uppercase = this.UPPERCASE
    let numbers = this.NUMBERS
    let symbols = this.SYMBOLS

    if (params.excludeSimilar) {
      lowercase = this.removeChars(lowercase, this.SIMILAR_CHARS)
      uppercase = this.removeChars(uppercase, this.SIMILAR_CHARS)
      numbers = this.removeChars(numbers, this.SIMILAR_CHARS)
      symbols = this.removeChars(symbols, this.SIMILAR_CHARS)
    }

    if (params.excludeAmbiguous) {
      symbols = this.removeChars(symbols, this.AMBIGUOUS_CHARS)
    }

    if (params.includeLowercase) {
      charset += lowercase
      usedSets.push('lowercase')
    }
    if (params.includeUppercase) {
      charset += uppercase
      usedSets.push('uppercase')
    }
    if (params.includeNumbers) {
      charset += numbers
      usedSets.push('numbers')
    }
    if (params.includeSymbols) {
      charset += symbols
      usedSets.push('symbols')
    }

    let password = ''

    if (usedSets.length > 1 && params.length >= usedSets.length) {
      if (params.includeLowercase) password += this.getRandomChar(lowercase)
      if (params.includeUppercase) password += this.getRandomChar(uppercase)
      if (params.includeNumbers) password += this.getRandomChar(numbers)
      if (params.includeSymbols) password += this.getRandomChar(symbols)

      for (let i = password.length; i < params.length; i++) {
        password += this.getRandomChar(charset)
      }

      password = this.shuffleString(password)
    } else {
      for (let i = 0; i < params.length; i++) {
        password += this.getRandomChar(charset)
      }
    }

    const entropy = this.calculateEntropy(password, charset.length)
    const strength = this.getPasswordStrength(entropy)
    const timeToCrack = this.getTimeToCrack(entropy)

    return {
      password,
      length: password.length,
      config: {
        include_numbers: params.includeNumbers,
        include_symbols: params.includeSymbols,
        include_lowercase: params.includeLowercase,
        include_uppercase: params.includeUppercase,
        exclude_similar: params.excludeSimilar,
        exclude_ambiguous: params.excludeAmbiguous,
      },
      character_sets: {
        lowercase: params.includeLowercase ? lowercase : '',
        uppercase: params.includeUppercase ? uppercase : '',
        numbers: params.includeNumbers ? numbers : '',
        symbols: params.includeSymbols ? symbols : '',
        used_sets: usedSets,
      },
      generation_info: {
        entropy,
        strength: strength.level,
        time_to_crack: timeToCrack.time,
      },
    }
  }

  private checkPasswordStrength(password: string): PasswordStrengthResult {
    const length = password.length
    const hasLowercase = /[a-z]/.test(password)
    const hasUppercase = /[A-Z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSymbols = /[^a-zA-Z0-9]/.test(password)
    const hasRepeated = this.hasRepeatedChars(password)
    const hasSequential = this.hasSequentialChars(password)

    let characterVariety = 0
    if (hasLowercase) characterVariety += 26
    if (hasUppercase) characterVariety += 26
    if (hasNumbers) characterVariety += 10
    if (hasSymbols) characterVariety += 32

    const entropy = this.calculateEntropy(password, characterVariety)
    const isCommon = this.isCommonPassword(password)
    let score = this.calculatePasswordScore({
      hasLowercase,
      hasUppercase,
      hasNumbers,
      hasSymbols,
      hasRepeated,
      hasSequential,
      length,
    })

    if (hasRepeated) score -= 10
    if (hasSequential) score -= 15
    if (isCommon) score -= 20

    score = Math.max(0, Math.min(100, score))

    // 破解耗时按有效熵估算：常见密码会被字典攻击秒级命中，连续/重复字符也会被规则字典大幅提前尝试，
    // 直接用字符集熵会严重高估人类设置的密码的破解时间（生成接口的密码是真随机，不做此项折减）
    let effectiveEntropy = entropy
    if (hasSequential) effectiveEntropy -= 10
    if (hasRepeated) effectiveEntropy -= 6
    if (isCommon) effectiveEntropy -= 40
    effectiveEntropy = Math.max(effectiveEntropy, 1)

    const strength = this.getStrengthFromScore(score)
    const timeToCrack = this.getTimeToCrack(effectiveEntropy)
    const recommendations = this.getPasswordRecommendations(password, {
      hasLowercase,
      hasUppercase,
      hasNumbers,
      hasSymbols,
      hasRepeated,
      hasSequential,
      length,
      score,
    })

    return {
      password,
      length,
      score,
      strength: strength.level,
      entropy: effectiveEntropy,
      time_to_crack: timeToCrack.time,
      character_analysis: {
        has_lowercase: hasLowercase,
        has_uppercase: hasUppercase,
        has_numbers: hasNumbers,
        has_symbols: hasSymbols,
        has_repeated: hasRepeated,
        has_sequential: hasSequential,
        character_variety: characterVariety,
      },
      recommendations,
      security_tips: this.getSecurityTips(),
    }
  }

  private removeChars(source: string, toRemove: string): string {
    return source
      .split('')
      .filter((char) => !toRemove.includes(char))
      .join('')
  }

  private getRandomChar(charset: string): string {
    return charset[Math.floor(Math.random() * charset.length)]
  }

  private shuffleString(str: string): string {
    return str
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('')
  }

  private calculateEntropy(password: string, charsetSize: number): number {
    if (charsetSize === 0) return 0
    return Math.round(password.length * Math.log2(charsetSize) * 100) / 100
  }

  private getPasswordStrength(entropy: number) {
    if (entropy < 30) {
      return { level: '极弱', description: '密码强度极低，极易被破解' }
    } else if (entropy < 40) {
      return { level: '弱', description: '密码强度较低，容易被破解' }
    } else if (entropy < 50) {
      return { level: '中等', description: '密码强度中等，有一定安全性' }
    } else if (entropy < 60) {
      return { level: '强', description: '密码强度较高，具有良好安全性' }
    } else {
      return { level: '极强', description: '密码强度极高，具有优秀安全性' }
    }
  }

  // 离线快速哈希场景的通用假设（同 zxcvbn 等强度工具）：现代 GPU 集群每秒可尝试 10^10 次
  private static readonly CRACK_ATTEMPTS_PER_SECOND = 1e10

  private getTimeToCrack(entropy: number) {
    // 平均只需尝试一半组合空间；全程用对数运算，避免大熵值下 2^E 溢出为 Infinity
    const log10Seconds =
      (Math.max(entropy, 0) - 1) * Math.log10(2) - Math.log10(ServicePassword.CRACK_ATTEMPTS_PER_SECOND)
    return {
      time: this.formatCrackDuration(log10Seconds),
      description: '暴力破解所需时间（按离线 10¹⁰ 次/秒、平均尝试一半组合空间估算）',
    }
  }

  private formatCrackDuration(log10Seconds: number): string {
    if (log10Seconds < 0) return '< 1秒'
    const log10Year = Math.log10(31536000)
    const units: Array<[number, string]> = [
      [Math.log10(60), '秒'],
      [Math.log10(3600), '分钟'],
      [Math.log10(86400), '小时'],
      [log10Year, '天'],
      [log10Year + 4, '年'],
      [log10Year + 8, '万年'],
      [log10Year + 12, '亿年'],
      [log10Year + 16, '万亿年'],
    ]
    let lower = 0
    for (const [upper, unit] of units) {
      if (log10Seconds < upper) {
        return `${formatAmount(Math.pow(10, log10Seconds - lower))}${unit}`
      }
      lower = upper
    }
    // 超出万亿年的天文数字用科学计数法表示
    const exp = Math.floor(log10Seconds)
    const mantissa = Math.pow(10, log10Seconds - exp)
    return `${formatAmount(mantissa)}×10${toSuperscript(exp)} 年`
  }

  private hasRepeatedChars(password: string): boolean {
    for (let i = 0; i < password.length - 2; i++) {
      if (password[i] === password[i + 1] && password[i] === password[i + 2]) {
        return true
      }
    }
    return false
  }

  private hasSequentialChars(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ]

    for (const seq of sequences) {
      for (let i = 0; i <= seq.length - 3; i++) {
        const subSeq = seq.substring(i, i + 3)
        if (password.includes(subSeq) || password.includes(subSeq.split('').reverse().join(''))) {
          return true
        }
      }
    }
    return false
  }

  private isCommonPassword(password: string): boolean {
    const lowerPassword = password.toLowerCase()

    return (
      commonPasswordsData.keyboard_patterns.some(
        (pattern) => lowerPassword.includes(pattern) || pattern.includes(lowerPassword),
      ) ||
      commonPasswordsData.common_passwords.includes(lowerPassword) ||
      commonPasswordsData.chinese_common_passwords.includes(lowerPassword) ||
      commonPasswordsData.common_names.includes(lowerPassword) ||
      commonPasswordsData.common_words.includes(lowerPassword)
    )
  }

  private calculatePasswordScore(analysis: {
    hasLowercase: boolean
    hasUppercase: boolean
    hasNumbers: boolean
    hasSymbols: boolean
    hasRepeated: boolean
    hasSequential: boolean
    length: number
  }): number {
    let score = 0

    score += analysis.length * 4

    if (analysis.hasLowercase) score += 2
    if (analysis.hasUppercase) score += 2
    if (analysis.hasNumbers) score += 4
    if (analysis.hasSymbols) score += 6

    const varietyCount = [
      analysis.hasLowercase,
      analysis.hasUppercase,
      analysis.hasNumbers,
      analysis.hasSymbols,
    ].filter(Boolean).length
    score += varietyCount * 2

    if (analysis.length >= 8) score += 5
    if (analysis.length >= 12) score += 5
    if (analysis.length >= 16) score += 5

    return score
  }

  private getStrengthFromScore(score: number) {
    if (score < 30) {
      return { level: '极弱', description: '密码过于简单，需要立即改进' }
    } else if (score < 50) {
      return { level: '弱', description: '密码强度不足，建议增强' }
    } else if (score < 70) {
      return { level: '中等', description: '密码强度一般，可以进一步改进' }
    } else if (score < 85) {
      return { level: '强', description: '密码强度良好' }
    } else {
      return { level: '极强', description: '密码强度优秀' }
    }
  }

  private getPasswordRecommendations(
    password: string,
    analysis: {
      hasLowercase: boolean
      hasUppercase: boolean
      hasNumbers: boolean
      hasSymbols: boolean
      hasRepeated: boolean
      hasSequential: boolean
      length: number
      score: number
    },
  ): string[] {
    const recommendations: string[] = []

    if (analysis.length < 8) {
      recommendations.push('建议密码长度至少 8 位')
    } else if (analysis.length < 12) {
      recommendations.push('建议密码长度至少 12 位以获得更好安全性')
    }

    if (!analysis.hasLowercase) {
      recommendations.push('建议包含小写字母')
    }
    if (!analysis.hasUppercase) {
      recommendations.push('建议包含大写字母')
    }
    if (!analysis.hasNumbers) {
      recommendations.push('建议包含数字')
    }
    if (!analysis.hasSymbols) {
      recommendations.push('建议包含特殊符号')
    }

    if (analysis.hasRepeated) {
      recommendations.push('避免连续重复字符')
    }
    if (analysis.hasSequential) {
      recommendations.push('避免使用连续序列字符')
    }

    if (this.isCommonPassword(password)) {
      recommendations.push('避免使用常见密码')
    }

    if (analysis.score >= 85) {
      recommendations.push('密码强度已经很好！')
    }

    return recommendations
  }

  private getSecurityTips(): string[] {
    return [
      '使用密码管理器生成和存储复杂密码',
      '为不同账户使用不同的密码',
      '定期更换重要账户的密码',
      '启用双因素认证（2FA）增强安全性',
      '避免在公共场合输入密码',
      '不要将密码保存在浏览器中（除非使用可信的密码管理器）',
      '避免使用个人信息作为密码',
      '长密码比复杂密码更安全',
    ]
  }

  private formatPasswordAsText(result: PasswordResult): string {
    const usedSets = result.character_sets.used_sets.map((set) => {
      switch (set) {
        case 'lowercase':
          return '小写字母'
        case 'uppercase':
          return '大写字母'
        case 'numbers':
          return '数字'
        case 'symbols':
          return '特殊符号'
        default:
          return set
      }
    })

    return `
🔐 ✨ 随机密码生成 ✨ 🔐

🔑 生成的密码: ${result.password}

📊 密码信息:
• 长度: ${result.length} 位
• 字符类型: ${usedSets.join('、')}
• 熵值: ${result.generation_info.entropy} bits
• 强度: ${result.generation_info.strength}

⏱️ 破解时间: ${result.generation_info.time_to_crack}

⚙️ 生成配置:
• 包含数字: ${result.config.include_numbers ? '是' : '否'}
• 包含符号: ${result.config.include_symbols ? '是' : '否'}
• 包含小写: ${result.config.include_lowercase ? '是' : '否'}
• 包含大写: ${result.config.include_uppercase ? '是' : '否'}
• 排除相似字符: ${result.config.exclude_similar ? '是' : '否'}
• 排除模糊字符: ${result.config.exclude_ambiguous ? '是' : '否'}
    `.trim()
  }

  private formatStrengthAsText(result: PasswordStrengthResult): string {
    const recommendations =
      result.recommendations.length > 0
        ? result.recommendations
            .slice(0, 3)
            .map((r) => `• ${r}`)
            .join('\n')
        : '• 密码强度已经很好！'

    const tips = result.security_tips
      .slice(0, 3)
      .map((t) => `• ${t}`)
      .join('\n')

    return `
🛡️ ✨ 密码强度检测 ✨ 🛡️

🔍 检测密码: ${result.password}

📊 强度评估:
• 评分: ${result.score}/100
• 强度: ${result.strength}
• 熵值: ${result.entropy} bits
• 长度: ${result.length} 位

⏱️ 破解时间: ${result.time_to_crack}

🔍 字符分析:
• 小写字母: ${result.character_analysis.has_lowercase ? '✅' : '❌'}
• 大写字母: ${result.character_analysis.has_uppercase ? '✅' : '❌'}
• 数字: ${result.character_analysis.has_numbers ? '✅' : '❌'}
• 特殊符号: ${result.character_analysis.has_symbols ? '✅' : '❌'}
• 重复字符: ${result.character_analysis.has_repeated ? '⚠️ 有' : '✅ 无'}
• 连续字符: ${result.character_analysis.has_sequential ? '⚠️ 有' : '✅ 无'}

📝 改进建议:
${recommendations}

🔒 安全提示:
${tips}
    `.trim()
  }

  private formatPasswordAsMarkdown(result: PasswordResult): string {
    const usedSets = result.character_sets.used_sets
      .map((set) => {
        switch (set) {
          case 'lowercase':
            return '小写字母'
          case 'uppercase':
            return '大写字母'
          case 'numbers':
            return '数字'
          case 'symbols':
            return '特殊符号'
          default:
            return set
        }
      })
      .join('、')

    return `# 🔐 随机密码生成

## 生成的密码

\`\`\`
${result.password}
\`\`\`

## 📊 密码信息

- **长度**: ${result.length} 位
- **字符类型**: ${usedSets}
- **熵值**: ${result.generation_info.entropy} bits
- **强度**: ${result.generation_info.strength}

## ⏱️ 破解时间

${result.generation_info.time_to_crack}

## ⚙️ 生成配置

| 配置项 | 状态 |
|--------|------|
| 包含数字 | ${result.config.include_numbers ? '✅' : '❌'} |
| 包含符号 | ${result.config.include_symbols ? '✅' : '❌'} |
| 包含小写 | ${result.config.include_lowercase ? '✅' : '❌'} |
| 包含大写 | ${result.config.include_uppercase ? '✅' : '❌'} |
| 排除相似字符 | ${result.config.exclude_similar ? '✅' : '❌'} |
| 排除模糊字符 | ${result.config.exclude_ambiguous ? '✅' : '❌'} |`
  }

  private formatStrengthAsMarkdown(result: PasswordStrengthResult): string {
    const recommendations =
      result.recommendations.length > 0
        ? result.recommendations.map((r) => `- ${r}`).join('\n')
        : '- 密码强度已经很好！'

    const tips = result.security_tips
      .slice(0, 5)
      .map((t) => `- ${t}`)
      .join('\n')

    return `# 🛡️ 密码强度检测

## 检测结果

**评分**: ${result.score}/100 | **强度**: ${result.strength}

**熵值**: ${result.entropy} bits

**破解时间**: ${result.time_to_crack}

## 🔍 字符分析

| 类型 | 状态 |
|------|------|
| 小写字母 | ${result.character_analysis.has_lowercase ? '✅' : '❌'} |
| 大写字母 | ${result.character_analysis.has_uppercase ? '✅' : '❌'} |
| 数字 | ${result.character_analysis.has_numbers ? '✅' : '❌'} |
| 特殊符号 | ${result.character_analysis.has_symbols ? '✅' : '❌'} |
| 重复字符 | ${result.character_analysis.has_repeated ? '⚠️ 有' : '✅ 无'} |
| 连续字符 | ${result.character_analysis.has_sequential ? '⚠️ 有' : '✅ 无'} |

**字符种类数**: ${result.character_analysis.character_variety}

## 📝 改进建议

${recommendations}

## 🔒 安全提示

${tips}`
  }
}

export const servicePassword = new ServicePassword()
