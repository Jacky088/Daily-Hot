import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

// 数据源由 ChemSpider 切换为 PubChem (NCBI PUG-REST)。
// 原因：ChemSpider 对数据中心/云机房出口 IP 返回反爬挑战页，导致 Makers 等
// 服务端部署下抓取不到 __NUXT_DATA__ 而 500。PubChem 专为程序化访问设计，
// 对云 IP 友好，Worker 与 Makers 均可用。
class ServiceChemical {
  handle(): RouterMiddleware<'/chemical'> {
    return async (ctx) => {
      const id = await Common.getParam('id', ctx.request)

      // id 可作为 PubChem CID (纯数字) 或化合物名称；缺省时随机展示一个化合物
      const compound = id
        ? await this.#fetchCompound(id)
        : await this.#fetchRandomCompound()

      if (!compound) {
        throw new Error(`未找到化合物: ${id || '随机'}`)
      }

      const result = {
        id: compound.cid,
        name: compound.name,
        mass: compound.mass,
        formula: compound.formula,
        image: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${compound.cid}/PNG`,
        monoisotopicMass: compound.monoisotopicMass,
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

  async #fetchRandomCompound(): Promise<Compound | null> {
    for (let i = 0; i < 5; i++) {
      const compound = await this.#fetchCompound(Common.randomInt(1, 100_000_000).toString())
      if (compound) return compound
    }
    return null
  }

  async #fetchCompound(query: string): Promise<Compound | null> {
    const isCid = /^\d+$/.test(query)
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${
      isCid ? 'cid/' + query : 'name/' + encodeURIComponent(query)
    }/property/MolecularFormula,MolecularWeight,MonoisotopicMass,IUPACName,Title/JSON`

    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': Common.chromeUA } })
    } catch {
      return null
    }
    if (!res.ok) return null

    const json = (await res.json()) as { PropertyTable?: { Properties?: CompoundRaw[] } }
    const props = json.PropertyTable?.Properties?.[0]
    if (!props) return null

    return {
      cid: props.CID,
      name: props.Title || props.IUPACName || '',
      formula: props.MolecularFormula || '',
      mass: props.MolecularWeight != null ? toFixedNumber(Number(props.MolecularWeight), 3) : '',
      monoisotopicMass: props.MonoisotopicMass != null ? toFixedNumber(Number(props.MonoisotopicMass), 3) : '',
    }
  }
}

interface Compound {
  cid: number
  name: string
  formula: string
  mass: number | string
  monoisotopicMass: number | string
}

interface CompoundRaw {
  CID: number
  Title?: string
  IUPACName?: string
  MolecularFormula?: string
  MolecularWeight?: string | number
  MonoisotopicMass?: string | number
}

export const serviceChemical = new ServiceChemical()

function toFixedNumber(num: number, fixed: number): number {
  return +num.toFixed(fixed)
}
