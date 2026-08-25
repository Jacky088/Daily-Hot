import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceChemical {
  handle(): RouterMiddleware<'/chemical'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      const finalId = id || Common.randomInt(1, 60_000_000).toString()

      const res = await fetch(`https://www.chemspider.com/Chemical-Structure.${finalId}.html`, {
        headers: { 'User-Agent': Common.chromeUA, Referer: 'https://www.chemspider.com/' },
      })
      const html = await res.text()
      const data = JSON.parse(/id="__NUXT_DATA__"[^>]*>([^<]*)</.exec(html)?.[1] || '[]')

      // NUXT 序列化格式: 对象的值为数组的下标, 动态定位化合物字段索引表, 避免页面结构变化导致下标漂移
      const compound = (data as any[]).find(
        (item) =>
          item && typeof item === 'object' && !Array.isArray(item) && 'ChemSpiderId' in item && 'MolecularFormula' in item,
      ) as Record<string, number> | undefined

      if (!compound) {
        throw new Error(`未找到 ID 为 ${finalId} 的化合物数据`)
      }

      const massMap = (data as any[])[compound.MolecularMass] as Record<string, number> | undefined

      const result = {
        id: +finalId,
        name: (data as any[])[compound.Title] || '',
        mass: massMap?.AverageMass != null ? toFixedNumber((data as any[])[massMap.AverageMass], 3) : '',
        formula: (data as any[])[compound.MolecularFormula] || '',
        image: `https://legacy.chemspider.com/ImagesHandler.ashx?id=${finalId}`,
        monoisotopicMass: massMap?.MonoisotopicMass != null ? toFixedNumber((data as any[])[massMap.MonoisotopicMass], 3) : '',
      }

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `化学元素信息\n名称: ${result.name}\n分子式: ${result.formula}\n质量: ${result.mass}\n单同位素质量: ${result.monoisotopicMass}`
          break

        case 'markdown':
          ctx.response.body = `# 🧪 化学物质信息\n\n## ${result.name}\n\n**分子式**: ${result.formula}\n\n**质量**: ${result.mass}\n\n**单同位素质量**: ${result.monoisotopicMass}\n\n![结构式](${result.image})\n\n*ID: ${result.id}*`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(result)
          break
      }
    }
  }
}

export const serviceChemical = new ServiceChemical()

function toFixedNumber(num: number, fixed: number): number {
  return +num.toFixed(fixed)
}
