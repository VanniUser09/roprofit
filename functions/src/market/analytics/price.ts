import type { DailyPoint, Snapshot } from "../types"
import { coefficientOfVariation, compact, max, mean, min, pctChange } from "./stats"

/**
 * Métricas de preço e tendência.
 *
 * A base é a série diária da Roblox (`priceDataPoints`), que é o preço médio
 * das vendas efetivamente realizadas. O book de ofertas entra só para o preço
 * corrente e o spread — ele mostra o que os vendedores PEDEM, que não é o que
 * o mercado PAGA.
 */

const DAY_MS = 86_400_000

export type PriceMetrics = {
  avgPrice7d: number | null
  avgPrice30d: number | null
  minPrice7d: number | null
  maxPrice7d: number | null
  /** Coeficiente de variação em 30d. Adimensional, comparável entre faixas. */
  volatility30d: number | null
  /** Variação do preço médio entre a última semana e a anterior. */
  priceTrend7d: number | null
  /** (preço corrente − RAP) / RAP. Negativo = comprando abaixo do RAP. */
  rapDiscountPct: number | null
}

export function computePrice(
  daily: DailyPoint[],
  currentPrice: number | null,
  rap: number | null
): PriceMetrics {
  const within = (days: number, offsetDays = 0) => {
    const now = Date.now()
    const start = now - (days + offsetDays) * DAY_MS
    const end = now - offsetDays * DAY_MS
    return daily.filter((point) => {
      const t = Date.parse(point.date)
      return Number.isFinite(t) && t >= start && t < end
    })
  }

  const prices7d = compact(within(7), (p) => p.avgPrice)
  const prices30d = compact(within(30), (p) => p.avgPrice)
  const pricesPrevious7d = compact(within(7, 7), (p) => p.avgPrice)

  return {
    avgPrice7d: mean(prices7d),
    avgPrice30d: mean(prices30d),
    minPrice7d: min(prices7d),
    maxPrice7d: max(prices7d),
    volatility30d: coefficientOfVariation(prices30d),
    // Semana contra semana anterior. Comparar com "hoje" seria refém de um
    // único dia de venda atípica.
    priceTrend7d: pctChange(mean(pricesPrevious7d), mean(prices7d)),
    rapDiscountPct: pctChange(rap, currentPrice),
  }
}

/**
 * Consolida o snapshot mais recente de cada campo.
 *
 * Necessário porque cada coletor grava snapshots parciais: o do Rolimon's traz
 * RAP e Value com todo o resto nulo, o do book traz preço e profundidade. Pegar
 * simplesmente "o último snapshot" devolveria um objeto quase todo vazio,
 * dependendo de qual coletor rodou por último.
 */
export function mergeLatest(snapshots: Snapshot[]): Partial<Snapshot> {
  const ordered = [...snapshots].sort((a, b) => millis(b.t) - millis(a.t))
  const merged: Partial<Snapshot> = {}

  const fields: (keyof Snapshot)[] = [
    "rap",
    "value",
    "demand",
    "trend",
    "lowestResalePrice",
    "secondLowestPrice",
    "resellerCount",
    "bookDepth10",
    "unitsAvailable",
    "assetStock",
    "spreadPct",
  ]

  for (const field of fields) {
    for (const snapshot of ordered) {
      const value = snapshot[field]
      if (value !== null && value !== undefined) {
        // @ts-expect-error atribuição por chave dinâmica sobre união de tipos
        merged[field] = value
        break
      }
    }
  }

  // Flags booleanas: `false` é informação, então não dá para usar a mesma
  // varredura de "primeiro não-nulo" — pegamos o snapshot mais recente que
  // realmente carregou dados do Rolimon's.
  const latestRolimons = ordered.find((s) => s.source === "rolimons")
  merged.projected = latestRolimons?.projected ?? false
  merged.hyped = latestRolimons?.hyped ?? false
  merged.rare = latestRolimons?.rare ?? false

  return merged
}

function millis(value: Snapshot["t"]): number {
  if (typeof value === "string") return Date.parse(value)
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === "object" && "toDate" in value) return value.toDate().getTime()
  return 0
}
