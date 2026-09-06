import { Common } from '../../common.ts'
import questionsData from './awesome-js.json' with { type: 'json' }

import type { RouterMiddleware } from '@oak/oak'

interface JavaScriptQuestion {
  id: number
  question: string
  code?: string
  options: string[]
  answer: string
  explanation: string
}

class ServiceAwesomeJs {
  handle(): RouterMiddleware<'/awesome-js'> {
    return async (ctx) => {
      const request = ctx.request
      const id = await Common.getParam('id', request)

      let result: JavaScriptQuestion

      if (id) {
        const questionId = Common.parseId(id)
        if (questionId == null) {
          ctx.response.status = 400
          ctx.response.body = Common.buildJson(null, 400, '参数 id 必须是非负整数')
          return
        }
        const question = questionsData.find((q) => q.id === questionId)

        if (!question) {
          ctx.response.status = 404
          ctx.response.body = Common.buildJson(null, 404, `未找到 ID 为 ${questionId} 的问题`)
          return
        }

        result = question
      } else {
        result = Common.randomItem(questionsData)
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = this.formatQuestionText(result)
          break

        case 'markdown':
          ctx.response.body = this.formatQuestionMarkdown(result)
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(result)
          break
      }
    }
  }

  private formatQuestionText(question: JavaScriptQuestion): string {
    let text = `${question.question}\n\n`

    if (question.code) {
      text += `代码:\n${question.code}\n\n`
    }

    text += '选项:\n'
    question.options.forEach((option) => {
      text += `${option}\n`
    })

    text += `\n答案: ${question.answer}\n\n`
    text += `解释: ${question.explanation}`

    return text
  }

  private formatQuestionMarkdown(question: JavaScriptQuestion): string {
    let md = `# 💻 JavaScript 面试题 #${question.id}\n\n## ${question.question}\n\n`

    if (question.code) {
      md += `\`\`\`javascript\n${question.code}\n\`\`\`\n\n`
    }

    md += `### 选项\n\n`
    question.options.forEach((option) => {
      md += `- ${option}\n`
    })

    md += `\n### ✅ 答案\n\n**${question.answer}**\n\n### 💡 解释\n\n${question.explanation}`

    return md
  }
}

export const serviceAwesomeJs = new ServiceAwesomeJs()
