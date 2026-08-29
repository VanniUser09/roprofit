import type { DailyPoint, Snapshot } from "../types"
import { compact, mean, percentile, sum } from "./stats"

/**
 * Velocidade de venda — a métrica que responde à pergunta central:
 * "se eu comprar esse Limited hoje, consigo revender rápido?"
 *
 * Duas fontes, com naturezas diferentes:
 *
 *  1. Série diária da Roblox (`volumeDataPoints`). Confiável e longa, mas
 *     granular em DIAS. Dá vendas/dia e vendas/semana com precisão, e nunca
 *     vai dar o intervalo real entre duas vendas.
 *
 *  2. Nossos snapshots do book, a cada 15 minutos. É daqui que sai a
 *     distribuição de intervalos entre vendas — mediana, p25, p75. Depende de
 *     ter observado o mercado continuamente, e por isso não existe em nenhum
 *     site concorrente.
 */

export type VelocityMetrics = {
  salesPerHour: number | null
  salesPerDay24h: number | null
  salesPerDay7d: number | null
  salesPerDay30d: number | null
  salesTotal7d: number | null
  salesTotal30d: number | null
  /** Fração de dias com ao menos uma venda em 30d. Alimenta a consistência. */
  activeDayRatio: number | null
  medianGapHours: number | null
  p25GapHours: number | null
  p75GapHours: number | null
  /** Quantos intervalos observamos. Poucos = número pouco confiável. */
  gapSampleSize: number
}

const DAY_MS = 86_400_000

export function computeVelocity(
  daily: DailyPoint[],
  snapshots: Snapshot[]
): VelocityMetrics {
  const gaps = inferSaleGaps(snapshots)

  return {
    ...volumeMetrics(daily),
    medianGapHours: percentile(gaps, 50),
    p25GapHours: percentile(gaps, 25),
    p75GapHours: percentile(gaps, 75),
    gapSampleSize: gaps.length,
  }
}

function volumeMetrics(daily: DailyPoint[]) {
  const today = Date.now()
  const inWindow = (days: number) =>
    daily.filter((point) => {
      const t = Date.parse(point.date)
      return Number.isFinite(t) && today - t <= days * DAY_MS
    })

  const volumes = (points: DailyPoint[]) => compact(points, (p) => p.volume)

  const last24h = volumes(inWindow(1))
  const last7d = volumes(inWindow(7))
  const last30d = volumes(inWindow(30))

  const total7d = last7d.length ? sum(last7d) : null
  const total30d = last30d.length ? sum(last30d) : null

  // Divide pela janela nominal, não pelo número de pontos recebidos: a Roblox
  // omite dias sem venda, e dividir por 3 pontos daria "10 vendas/dia" num item
  // que vendeu 30 vezes em um mês inteiro.
  const perDay7d = total7d === null ? null : total7d / 7
  const perDay30d = total30d === null ? null : total30d / 30
  const perDay24h = last24h.length ? sum(last24h) : null

  // Preferir a janela de 7d como base horária: 24h é ruidoso demais num
  // mercado onde a maioria dos itens vende poucas vezes por semana.
  const hourlyBase = perDay7d ?? perDay30d
  const salesPerHour = hourlyBase === null ? null : hourlyBase / 24

  const activeDays = last30d.filter((v) => v > 0).length
  const activeDayRatio = last30d.length > 0 ? activeDays / 30 : null

  return {
    salesPerHour,
    salesPerDay24h: perDay24h,
    salesPerDay7d: perDay7d,
    salesPerDay30d: perDay30d,
    salesTotal7d: total7d,
    salesTotal30d: total30d,
    activeDayRatio,
  }
}

/**
 * Infere intervalos entre vendas a partir do book.
 *
 * Entre dois snapshots consecutivos, uma queda em `resellerCount` acompanhada
 * de subida no preço mínimo indica que as ofertas mais baratas saíram — quase
 * sempre porque foram compradas.
 *
 * A ressalva honesta: um vendedor que apenas retira o anúncio produz o mesmo
 * sinal. Por isso exigimos as DUAS condições (menos ofertas E preço mínimo
 * subindo) em vez de só a contagem — retirada de anúncio no meio do book não
 * move a mínima. Não elimina o falso positivo, reduz muito. A calibração real
 * vem de cruzar com o volume diário da Roblox, que é o que a página de saúde
 * da coleta expõe.
 */
function inferSaleGaps(snapshots: Snapshot[]): number[] {
  const withBook = snapshots
    .filter((s) => s.resellerCount !== null && s.lowestResalePrice !== null)
    .sort((a, b) => toMillis(a.t) - toMillis(b.t))

  if (withBook.length < 2) return []

  const saleTimes: number[] = []

  for (let i = 1; i < withBook.length; i++) {
    const previous = withBook[i - 1]
    const current = withBook[i]

    const fewerOffers = current.resellerCount! < previous.resellerCount!
    const priceRose = current.lowestResalePrice! > previous.lowestResalePrice!

    if (fewerOffers && priceRose) saleTimes.push(toMillis(current.t))
  }

  if (saleTimes.length < 2) return []

  const gaps: number[] = []
  for (let i = 1; i < saleTimes.length; i++) {
    gaps.push((saleTimes[i] - saleTimes[i - 1]) / 3_600_000)
  }
  return gaps
}

function toMillis(value: Snapshot["t"]): number {
  if (typeof value === "string") return Date.parse(value)
  if (value instanceof Date) return value.getTime()
  if (value && typeof value === "object" && "toDate" in value) return value.toDate().getTime()
  return 0
}

/**
 * Dias distintos cobertos pelo nosso próprio histórico.
 *
 * Alimenta o fator de confiança do Liquidity Score. Contar dias distintos e não
 * o número de snapshots evita que uma rajada de coleta em uma tarde pareça
 * duas semanas de observação.
 */
export function historyDayCount(snapshots: Snapshot[]): number {
  const days = new Set<string>()
  for (const snapshot of snapshots) {
    const millis = toMillis(snapshot.t)
    if (millis > 0) days.add(new Date(millis).toISOString().slice(0, 10))
  }
  return days.size
}

/** Idade do dado mais recente, em horas. O painel mostra isso ao lado de cada número. */
export function dataAgeHours(snapshots: Snapshot[]): number | null {
  const latest = snapshots.reduce((newest, s) => Math.max(newest, toMillis(s.t)), 0)
  if (latest === 0) return null
  return (Date.now() - latest) / 3_600_000
}

export { toMillis }
export type { DailyPoint }

/** Média de preço numa janela de dias, direto da série diária da Roblox. */
export function averagePriceWithin(daily: DailyPoint[], days: number): number | null {
  const cutoff = Date.now() - days * DAY_MS
  const prices = compact(
    daily.filter((p) => Date.parse(p.date) >= cutoff),
    (p) => p.avgPrice
  )
  return mean(prices)
}
