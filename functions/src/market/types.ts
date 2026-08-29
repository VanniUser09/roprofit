/**
 * Formato canônico do domínio.
 *
 * Nada acima de `sources/` conhece o formato de nenhuma API externa: o
 * normalizer converte tudo para estes tipos. Se a Roblox mudar um endpoint,
 * o que muda é um source — estes tipos ficam.
 */

/** Item do catálogo. Muda raramente. */
export type Limited = {
  assetId: number
  /** UUID do sistema CollectibleItem. Sem ele não dá para ler o mercado atual. */
  collectibleItemId: string | null
  name: string
  acronym: string | null
  assetType: number | null
  thumbnailUrl: string | null
  /** Cópias em circulação. */
  totalQuantity: number | null
  createdUtc: string | null
  tier: Tier
  active: boolean
  /** true enquanto não temos o collectibleItemId. Alimenta a fila de backfill. */
  needsMapping: boolean
  /** Maior = mapeado antes. Prioriza a faixa de preço da operação. */
  mappingPriority: number
  lastSeenAt: FirestoreDate | null
  resellersCheckedAt: FirestoreDate | null
  dailyCheckedAt: FirestoreDate | null
  sources: { roblox: boolean; rolimons: boolean }
}

export type Tier = "A" | "B"

/** Data em trânsito: Timestamp no Firestore, ISO na API. */
export type FirestoreDate = Date | { toDate(): Date } | string

/** Uma fotografia do mercado num instante. É a nossa série própria. */
export type Snapshot = {
  t: FirestoreDate
  /** Recent Average Price da Roblox. */
  rap: number | null
  /** Value do Rolimon's — curado por humanos, pode estar desatualizado. */
  value: number | null
  demand: DemandCode | null
  trend: TrendCode | null
  projected: boolean
  hyped: boolean
  rare: boolean
  lowestResalePrice: number | null
  secondLowestPrice: number | null
  resellerCount: number | null
  /** Ofertas até +10% da mínima. Mede se dá para SAIR do item. */
  bookDepth10: number | null
  unitsAvailable: number | null
  assetStock: number | null
  /** (2ª mínima − mínima) / mínima. Gap grande = mínima ilusória. */
  spreadPct: number | null
  source: SnapshotSource
}

export type SnapshotSource = "roblox" | "rolimons" | "merged"

/** Ponto diário vindo da Roblox. Granularidade máxima que a fonte oferece. */
export type DailyPoint = {
  date: string
  avgPrice: number | null
  /** Vendas no dia. */
  volume: number | null
}

/** Códigos do Rolimon's. -1 significa "não classificado", não "zero". */
export const DEMAND_LABELS = {
  0: "Terrível",
  1: "Baixa",
  2: "Normal",
  3: "Alta",
  4: "Excelente",
} as const

export const TREND_LABELS = {
  0: "Caindo",
  1: "Instável",
  2: "Estável",
  3: "Subindo",
  4: "Flutuando",
} as const

export type DemandCode = keyof typeof DEMAND_LABELS
export type TrendCode = keyof typeof TREND_LABELS

/** Saída do Analytics + Liquidity Engine. Coleção raiz, plana e consultável. */
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
  /** 0–1. Cresce com dias de histórico próprio. Reduz o score honestamente. */
  confidence: number

  salesPerHour: number | null
  salesPerDay24h: number | null
  salesPerDay7d: number | null
  salesPerDay30d: number | null
  salesTotal7d: number | null
  salesTotal30d: number | null

  /** Derivados do desaparecimento de ofertas no book. Nulos sem histórico. */
  medianGapHours: number | null
  p25GapHours: number | null
  p75GapHours: number | null

  rap: number | null
  value: number | null
  demand: DemandCode | null
  trend: TrendCode | null
  projected: boolean
  lowestResalePrice: number | null
  avgPrice7d: number | null
  avgPrice30d: number | null
  minPrice7d: number | null
  maxPrice7d: number | null
  /** (preço − RAP) / RAP. Negativo = abaixo do RAP. */
  rapDiscountPct: number | null
  /** Coeficiente de variação do preço diário em 30d. */
  volatility30d: number | null
  /** Variação percentual do preço médio entre as duas últimas semanas. */
  priceTrend7d: number | null
  spreadPct: number | null
  bookDepth10: number | null
  resellerCount: number | null
  assetStock: number | null

  /** Dias distintos com dado próprio. Alimenta `confidence`. */
  historyDays: number
  computedAt: FirestoreDate
  /** Idade do dado mais recente que originou estas métricas, em horas. */
  dataAgeHours: number | null
}

export type LiquidityComponents = {
  velocity: number
  consistency: number
  bookDepth: number
  stability: number
  spread: number
  scale: number
}

/** Resultado de uma execução de coletor. Sem isso, uma API quebrada passa dias despercebida. */
export type CollectorRun = {
  collector: string
  startedAt: FirestoreDate
  finishedAt: FirestoreDate | null
  durationMs: number | null
  status: "running" | "ok" | "partial" | "error"
  itemsProcessed: number
  itemsWritten: number
  requestCount: number
  errors: { message: string; count: number }[]
  /** Cota restante lida do header x-ratelimit-remaining, quando disponível. */
  quotaRemaining: number | null
  notes: string | null
}
