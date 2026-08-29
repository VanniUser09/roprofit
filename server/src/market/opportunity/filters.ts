import type { DemandCode, ItemMetrics, TrendCode } from "../types"

/**
 * Página de Oportunidades.
 *
 * Os filtros rodam em memória sobre as ~2.500 métricas, não no Firestore. Não é
 * preguiça: o Firestore não combina dez faixas de valor numa query só, e o
 * conjunto inteiro cabe em ~2 MB. Filtrar aqui dá liberdade total de critério
 * com um custo de leitura fixo e previsível.
 */

export type OpportunityFilters = {
  priceMin?: number
  priceMax?: number
  rapMin?: number
  rapMax?: number
  valueMin?: number
  valueMax?: number
  salesPerDayMin?: number
  liquidityScoreMin?: number
  /** Como fração: 0,10 = no máximo 10% de volatilidade. */
  volatilityMax?: number
  /** Negativo busca desconto: -0,05 = pelo menos 5% abaixo do RAP. */
  rapDiscountMax?: number
  demandMin?: DemandCode
  trend?: TrendCode[]
  /** Excluir itens marcados como projected pelo Rolimon's. */
  excludeProjected?: boolean
  /** Exigir book com pelo menos N ofertas próximas da mínima. */
  bookDepthMin?: number
  /** Score de confiança mínimo, de 0 a 1. */
  confidenceMin?: number
  tier?: "A" | "B"
  search?: string
}

export type SortField =
  | "liquidityScore"
  | "salesPerDay7d"
  | "lowestResalePrice"
  | "rapDiscountPct"
  | "volatility30d"
  | "priceTrend7d"
  | "name"

export type OpportunityQuery = {
  filters?: OpportunityFilters
  sort?: SortField
  direction?: "asc" | "desc"
  limit?: number
  offset?: number
}

export type OpportunityPage = {
  items: ItemMetrics[]
  total: number
  /** Total antes dos filtros — deixa claro quanto o filtro cortou. */
  universe: number
}

export function applyFilters(all: ItemMetrics[], query: OpportunityQuery): OpportunityPage {
  const f = query.filters ?? {}
  const search = f.search?.trim().toLowerCase()

  const filtered = all.filter((item) => {
    // Comparações que envolvem um campo nulo são tratadas como "não passa".
    // Deixar passar seria pior: um item sem dado de volatilidade apareceria
    // num filtro de "volatilidade < 5%" sem nenhuma base para isso.
    if (!within(item.lowestResalePrice, f.priceMin, f.priceMax)) return false
    if (!within(item.rap, f.rapMin, f.rapMax)) return false
    if (!within(item.value, f.valueMin, f.valueMax)) return false

    if (f.salesPerDayMin !== undefined) {
      if (item.salesPerDay7d === null || item.salesPerDay7d < f.salesPerDayMin) return false
    }
    if (f.liquidityScoreMin !== undefined && item.liquidityScore < f.liquidityScoreMin) {
      return false
    }
    if (f.volatilityMax !== undefined) {
      if (item.volatility30d === null || item.volatility30d > f.volatilityMax) return false
    }
    if (f.rapDiscountMax !== undefined) {
      if (item.rapDiscountPct === null || item.rapDiscountPct > f.rapDiscountMax) return false
    }
    if (f.demandMin !== undefined) {
      if (item.demand === null || item.demand < f.demandMin) return false
    }
    if (f.trend?.length) {
      if (item.trend === null || !f.trend.includes(item.trend)) return false
    }
    if (f.excludeProjected && item.projected) return false
    if (f.bookDepthMin !== undefined) {
      if (item.bookDepth10 === null || item.bookDepth10 < f.bookDepthMin) return false
    }
    if (f.confidenceMin !== undefined && item.confidence < f.confidenceMin) return false
    if (f.tier && item.tier !== f.tier) return false

    if (search) {
      const haystack = `${item.name} ${item.acronym ?? ""}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }

    return true
  })

  const sorted = sortItems(filtered, query.sort ?? "liquidityScore", query.direction ?? "desc")
  const offset = query.offset ?? 0
  const limit = query.limit ?? 50

  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    universe: all.length,
  }
}

function within(value: number | null, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true
  if (value === null) return false
  if (min !== undefined && value < min) return false
  if (max !== undefined && value > max) return false
  return true
}

export function sortItems(
  items: ItemMetrics[],
  field: SortField,
  direction: "asc" | "desc"
): ItemMetrics[] {
  const sign = direction === "asc" ? 1 : -1

  return [...items].sort((a, b) => {
    if (field === "name") return sign * a.name.localeCompare(b.name, "pt-BR")

    const left = a[field] as number | null
    const right = b[field] as number | null

    // Nulos sempre no fim, independentemente da direção: um item sem dado não
    // deve liderar uma lista de "menor volatilidade" só por não ter medida.
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1

    return sign * (left - right)
  })
}

/** Presets prontos, alinhados à operação descrita no plano. */
export const PRESETS: { id: string; label: string; description: string; filters: OpportunityFilters }[] =
  [
    {
      id: "giro-rapido",
      label: "Giro rápido",
      description: "Alta liquidez comprovada na faixa de preço da operação.",
      filters: {
        priceMin: 500,
        priceMax: 40_000,
        liquidityScoreMin: 70,
        salesPerDayMin: 3,
        excludeProjected: true,
      },
    },
    {
      id: "abaixo-do-rap",
      label: "Abaixo do RAP",
      description: "Descontos de ao menos 5% com liquidez razoável.",
      filters: {
        rapDiscountMax: -0.05,
        liquidityScoreMin: 50,
        excludeProjected: true,
      },
    },
    {
      id: "montagem-de-lote",
      label: "Bons para lote",
      description: "Itens pequenos e estáveis para compor lotes de ~14.300 Robux.",
      filters: {
        priceMin: 800,
        priceMax: 8_000,
        liquidityScoreMin: 60,
        volatilityMax: 0.15,
        bookDepthMin: 3,
        excludeProjected: true,
      },
    },
    {
      id: "atencao",
      label: "Exigem atenção",
      description: "Volatilidade alta ou marcados como projected.",
      filters: { volatilityMax: undefined, liquidityScoreMin: 0 },
    },
  ]
