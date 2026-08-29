/**
 * Tipos e formatadores do módulo de Market Intelligence.
 *
 * Os tipos espelham o contrato da API (`functions/src/market/types.ts`).
 * Mantidos separados de propósito: o frontend não deve importar código de
 * servidor, e duplicar ~40 linhas de tipo é mais barato do que acoplar os dois
 * builds.
 */

export type Tier = "A" | "B"

export type LiquidityComponents = {
  velocity: number
  consistency: number
  bookDepth: number
  stability: number
  spread: number
  scale: number
}

export type ItemMetrics = {
  assetId: number
  collectibleItemId: string | null
  name: string
  acronym: string | null
  thumbnailUrl: string | null
  tier: Tier
  active: boolean

  liquidityScore: number
  components: LiquidityComponents
  confidence: number

  salesPerHour: number | null
  salesPerDay24h: number | null
  salesPerDay7d: number | null
  salesPerDay30d: number | null
  salesTotal7d: number | null
  salesTotal30d: number | null

  medianGapHours: number | null
  p25GapHours: number | null
  p75GapHours: number | null

  rap: number | null
  value: number | null
  demand: number | null
  trend: number | null
  projected: boolean
  lowestResalePrice: number | null
  avgPrice7d: number | null
  avgPrice30d: number | null
  minPrice7d: number | null
  maxPrice7d: number | null
  rapDiscountPct: number | null
  volatility30d: number | null
  priceTrend7d: number | null
  spreadPct: number | null
  bookDepth10: number | null
  resellerCount: number | null
  assetStock: number | null

  historyDays: number
  dataAgeHours: number | null
}

export type CollectorHealth = {
  status: "ok" | "stale" | "error" | "unknown"
  message: string
}

export type Overview = {
  counts: { total: number; mapped: number; tierA: number }
  totals: {
    trackedItems: number
    sales24h: number
    sales7d: number
    volume24hRobux: number
    avgRap: number | null
    highLiquidityItems: number
    risingItems: number
    fallingItems: number
    avgLiquidityScore: number | null
    avgConfidence: number | null
  }
  deltas: {
    sales24h: number | null
    volume24hRobux: number | null
    avgRap: number | null
  }
  topOpportunities: ItemMetrics[]
  biggestGains: ItemMetrics[]
  biggestDrops: ItemMetrics[]
  collectorHealth: CollectorHealth
}

export type Simulation = {
  params: {
    robloxFeePct: number
    buyPricePer1k: number
    sellPricePer1k: number
    robuxLimitPerAccount: number
    extraCostsBRL: number
  }
  grossRobux: number
  netRobux: number
  feeRobux: number
  costBRL: number
  revenueBRL: number
  extraCostsBRL: number
  profitBRL: number
  roi: number | null
  margin: number | null
  profitPer1kBRL: number | null
  capitalRequiredBRL: number
  accountsNeeded: number
  breakEvenBuyPricePer1k: number | null
}

export type Capacity = {
  capitalBRL: number
  affordableGrossRobux: number
  affordableNetRobux: number
  accountsNeeded: number
  projectedRevenueBRL: number
  projectedProfitBRL: number
  roi: number | null
  batchesAffordable: number
  batchTargetGrossRobux: number
}

export type BatchItem = {
  assetId: number
  name: string
  thumbnailUrl: string | null
  price: number
  liquidityScore: number
  rapDiscountPct: number | null
  volatility30d: number | null
  salesPerDay7d: number | null
}

export type Batch = {
  items: BatchItem[]
  grossRobux: number
  deviationPct: number
  quality: number
  simulation: Simulation
  accountEfficiency: number
}

export type Alert = {
  id: string
  ruleId: string
  ruleLabel: string
  assetId: number
  itemName: string
  thumbnailUrl: string | null
  metric: string
  value: number
  threshold: number
  severity: "info" | "good" | "warning" | "critical"
  message: string
  read: boolean
}

export type AlertRule = {
  id: string
  enabled: boolean
  label: string
  metric: string
  operator: "gt" | "lt"
  threshold: number
  minConfidence: number
  priceMin?: number | null
  priceMax?: number | null
  severity: Alert["severity"]
  cooldownHours: number
}

// ── Rótulos ────────────────────────────────────────────────────────────────
//
// Códigos do Rolimon's. -1 vira null na normalização do backend, então aqui
// só tratamos 0–4.

export const DEMAND_LABELS: Record<number, string> = {
  0: "Terrível",
  1: "Baixa",
  2: "Normal",
  3: "Alta",
  4: "Excelente",
}

export const TREND_LABELS: Record<number, string> = {
  0: "Caindo",
  1: "Instável",
  2: "Estável",
  3: "Subindo",
  4: "Flutuando",
}

export const COMPONENT_LABELS: Record<keyof LiquidityComponents, string> = {
  velocity: "Velocidade",
  consistency: "Consistência",
  bookDepth: "Profundidade",
  stability: "Estabilidade",
  spread: "Spread",
  scale: "Escala",
}

// ── Formatadores ───────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("pt-BR")
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** Traço em vez de "0" quando não há dado: zero é uma afirmação, ausência não. */
export const DASH = "—"

export function robux(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return nf.format(Math.round(value))
}

/** Forma compacta para tiles: 1,2 mi / 14,3 mil. */
export function robuxShort(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${nf1.format(value / 1_000_000)} mi`
  if (abs >= 10_000) return `${nf1.format(value / 1_000)} mil`
  return nf.format(Math.round(value))
}

export function brl(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return brlFmt.format(value)
}

export function decimal(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(value)
}

/** Percentual a partir de fração. `signed` prefixa + nos positivos. */
export function pct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  const formatted = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits === 2 ? 2 : 0,
  }).format(value * 100)
  const sign = signed && value > 0 ? "+" : ""
  return `${sign}${formatted}%`
}

export function money2(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH
  return nf2.format(value)
}

/** Idade do dado em linguagem natural. Aparece ao lado de todo número exibido. */
export function dataAge(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "sem dado"
  if (hours < 1) return `${Math.round(hours * 60)} min atrás`
  if (hours < 48) return `${Math.round(hours)} h atrás`
  return `${Math.round(hours / 24)} dias atrás`
}

export function hoursLabel(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return DASH
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${nf1.format(hours)} h`
  return `${nf1.format(hours / 24)} d`
}

/**
 * Faixa de cor do Liquidity Score.
 *
 * Usa os tokens de tema do projeto, não cores soltas: verde primário para o
 * que a operação procura, âmbar para atenção, vermelho para descartar.
 */
export function scoreTone(score: number): "high" | "mid" | "low" {
  if (score >= 70) return "high"
  if (score >= 40) return "mid"
  return "low"
}
