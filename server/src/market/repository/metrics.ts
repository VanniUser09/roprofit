import { COLLECTION } from "../../config"
import { query, queryOne, tx } from "../../db/pool"
import type { CollectorRun, ItemMetrics, LiquidityComponents } from "../types"

/**
 * Repositório de métricas, execuções e agregados globais — em SQL.
 *
 * `item_metrics` deixou de ser "coleção raiz plana para caber em memória": no
 * Postgres o ranking é um índice, o filtro de faixa é um WHERE, e não há mais
 * necessidade de carregar 2.500 documentos para filtrar em JavaScript. A API,
 * porém, mantém a mesma assinatura — `listAllMetrics` continua existindo para
 * o Opportunity Engine, que filtra em memória por conveniência.
 */

type MetricsRow = {
  asset_id: number
  collectible_item_id: string | null
  name: string
  acronym: string | null
  thumbnail_url: string | null
  tier: string
  active: boolean
  liquidity_score: number
  components: LiquidityComponents
  confidence: number
  sales_per_hour: number | null
  sales_per_day_24h: number | null
  sales_per_day_7d: number | null
  sales_per_day_30d: number | null
  sales_total_7d: number | null
  sales_total_30d: number | null
  median_gap_hours: number | null
  p25_gap_hours: number | null
  p75_gap_hours: number | null
  rap: number | null
  value: number | null
  demand: number | null
  trend: number | null
  projected: boolean
  lowest_resale_price: number | null
  avg_price_7d: number | null
  avg_price_30d: number | null
  min_price_7d: number | null
  max_price_7d: number | null
  rap_discount_pct: number | null
  volatility_30d: number | null
  price_trend_7d: number | null
  spread_pct: number | null
  book_depth_10: number | null
  reseller_count: number | null
  asset_stock: number | null
  history_days: number
  computed_at: Date
  data_age_hours: number | null
}

function toMetrics(row: MetricsRow): ItemMetrics {
  return {
    assetId: row.asset_id,
    collectibleItemId: row.collectible_item_id,
    name: row.name,
    acronym: row.acronym,
    thumbnailUrl: row.thumbnail_url,
    tier: row.tier as ItemMetrics["tier"],
    active: row.active,
    liquidityScore: row.liquidity_score,
    components: row.components,
    confidence: row.confidence,
    salesPerHour: row.sales_per_hour,
    salesPerDay24h: row.sales_per_day_24h,
    salesPerDay7d: row.sales_per_day_7d,
    salesPerDay30d: row.sales_per_day_30d,
    salesTotal7d: row.sales_total_7d,
    salesTotal30d: row.sales_total_30d,
    medianGapHours: row.median_gap_hours,
    p25GapHours: row.p25_gap_hours,
    p75GapHours: row.p75_gap_hours,
    rap: row.rap,
    value: row.value,
    demand: row.demand as ItemMetrics["demand"],
    trend: row.trend as ItemMetrics["trend"],
    projected: row.projected,
    lowestResalePrice: row.lowest_resale_price,
    avgPrice7d: row.avg_price_7d,
    avgPrice30d: row.avg_price_30d,
    minPrice7d: row.min_price_7d,
    maxPrice7d: row.max_price_7d,
    rapDiscountPct: row.rap_discount_pct,
    volatility30d: row.volatility_30d,
    priceTrend7d: row.price_trend_7d,
    spreadPct: row.spread_pct,
    bookDepth10: row.book_depth_10,
    resellerCount: row.reseller_count,
    assetStock: row.asset_stock,
    historyDays: row.history_days,
    computedAt: row.computed_at,
    dataAgeHours: row.data_age_hours,
  }
}

const SELECT = "SELECT * FROM item_metrics"

/**
 * Grava métricas, pulando as que não mudaram.
 *
 * O dirty-check virou `IS DISTINCT FROM` sobre os campos significativos, dentro
 * do próprio upsert — o Postgres decide linha a linha se a escrita muda algo e
 * simplesmente não toca o disco quando não muda. Some a leitura prévia de 2.500
 * documentos que o Firestore exigia para fazer o mesmo.
 */
export async function writeMetrics(metrics: ItemMetrics[]): Promise<number> {
  if (metrics.length === 0) return 0
  let written = 0

  await tx(async (client) => {
    for (const m of metrics) {
      const result = await client.query(
        `INSERT INTO item_metrics (
           asset_id, collectible_item_id, name, acronym, thumbnail_url, tier, active,
           liquidity_score, components, confidence,
           sales_per_hour, sales_per_day_24h, sales_per_day_7d, sales_per_day_30d,
           sales_total_7d, sales_total_30d,
           median_gap_hours, p25_gap_hours, p75_gap_hours,
           rap, value, demand, trend, projected, lowest_resale_price,
           avg_price_7d, avg_price_30d, min_price_7d, max_price_7d,
           rap_discount_pct, volatility_30d, price_trend_7d, spread_pct,
           book_depth_10, reseller_count, asset_stock,
           history_days, computed_at, data_age_hours
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7, $8,$9,$10,
           $11,$12,$13,$14,$15,$16, $17,$18,$19,
           $20,$21,$22,$23,$24,$25, $26,$27,$28,$29,
           $30,$31,$32,$33, $34,$35,$36, $37, now(), $38
         )
         ON CONFLICT (asset_id) DO UPDATE SET
           collectible_item_id = EXCLUDED.collectible_item_id,
           name = EXCLUDED.name, acronym = EXCLUDED.acronym,
           thumbnail_url = EXCLUDED.thumbnail_url, tier = EXCLUDED.tier, active = EXCLUDED.active,
           liquidity_score = EXCLUDED.liquidity_score, components = EXCLUDED.components,
           confidence = EXCLUDED.confidence,
           sales_per_hour = EXCLUDED.sales_per_hour, sales_per_day_24h = EXCLUDED.sales_per_day_24h,
           sales_per_day_7d = EXCLUDED.sales_per_day_7d, sales_per_day_30d = EXCLUDED.sales_per_day_30d,
           sales_total_7d = EXCLUDED.sales_total_7d, sales_total_30d = EXCLUDED.sales_total_30d,
           median_gap_hours = EXCLUDED.median_gap_hours, p25_gap_hours = EXCLUDED.p25_gap_hours,
           p75_gap_hours = EXCLUDED.p75_gap_hours,
           rap = EXCLUDED.rap, value = EXCLUDED.value, demand = EXCLUDED.demand,
           trend = EXCLUDED.trend, projected = EXCLUDED.projected,
           lowest_resale_price = EXCLUDED.lowest_resale_price,
           avg_price_7d = EXCLUDED.avg_price_7d, avg_price_30d = EXCLUDED.avg_price_30d,
           min_price_7d = EXCLUDED.min_price_7d, max_price_7d = EXCLUDED.max_price_7d,
           rap_discount_pct = EXCLUDED.rap_discount_pct, volatility_30d = EXCLUDED.volatility_30d,
           price_trend_7d = EXCLUDED.price_trend_7d, spread_pct = EXCLUDED.spread_pct,
           book_depth_10 = EXCLUDED.book_depth_10, reseller_count = EXCLUDED.reseller_count,
           asset_stock = EXCLUDED.asset_stock, history_days = EXCLUDED.history_days,
           computed_at = now(), data_age_hours = EXCLUDED.data_age_hours
         WHERE
           -- Só reescreve quando um campo significativo mudou. computed_at e
           -- data_age_hours mudam sempre e por isso NÃO entram na comparação.
           item_metrics.liquidity_score   IS DISTINCT FROM EXCLUDED.liquidity_score
        OR item_metrics.confidence        IS DISTINCT FROM EXCLUDED.confidence
        OR item_metrics.lowest_resale_price IS DISTINCT FROM EXCLUDED.lowest_resale_price
        OR item_metrics.rap               IS DISTINCT FROM EXCLUDED.rap
        OR item_metrics.value             IS DISTINCT FROM EXCLUDED.value
        OR item_metrics.demand            IS DISTINCT FROM EXCLUDED.demand
        OR item_metrics.trend             IS DISTINCT FROM EXCLUDED.trend
        OR item_metrics.projected         IS DISTINCT FROM EXCLUDED.projected
        OR item_metrics.sales_per_day_7d  IS DISTINCT FROM EXCLUDED.sales_per_day_7d
        OR item_metrics.sales_per_day_30d IS DISTINCT FROM EXCLUDED.sales_per_day_30d
        OR item_metrics.sales_total_7d    IS DISTINCT FROM EXCLUDED.sales_total_7d
        OR item_metrics.volatility_30d    IS DISTINCT FROM EXCLUDED.volatility_30d
        OR item_metrics.price_trend_7d    IS DISTINCT FROM EXCLUDED.price_trend_7d
        OR item_metrics.rap_discount_pct  IS DISTINCT FROM EXCLUDED.rap_discount_pct
        OR item_metrics.spread_pct        IS DISTINCT FROM EXCLUDED.spread_pct
        OR item_metrics.book_depth_10     IS DISTINCT FROM EXCLUDED.book_depth_10
        OR item_metrics.reseller_count    IS DISTINCT FROM EXCLUDED.reseller_count
        OR item_metrics.asset_stock       IS DISTINCT FROM EXCLUDED.asset_stock
        OR item_metrics.tier              IS DISTINCT FROM EXCLUDED.tier
        OR item_metrics.active            IS DISTINCT FROM EXCLUDED.active
        OR item_metrics.history_days      IS DISTINCT FROM EXCLUDED.history_days`,
        [
          m.assetId, m.collectibleItemId, m.name, m.acronym, m.thumbnailUrl, m.tier, m.active,
          m.liquidityScore, JSON.stringify(m.components), m.confidence,
          m.salesPerHour, m.salesPerDay24h, m.salesPerDay7d, m.salesPerDay30d,
          m.salesTotal7d, m.salesTotal30d,
          m.medianGapHours, m.p25GapHours, m.p75GapHours,
          m.rap, m.value, m.demand, m.trend, m.projected, m.lowestResalePrice,
          m.avgPrice7d, m.avgPrice30d, m.minPrice7d, m.maxPrice7d,
          m.rapDiscountPct, m.volatility30d, m.priceTrend7d, m.spreadPct,
          m.bookDepth10, m.resellerCount, m.assetStock,
          m.historyDays, m.dataAgeHours,
        ]
      )
      written += result.rowCount ?? 0
    }
  })
  return written
}

export async function getMetrics(assetId: number): Promise<ItemMetrics | null> {
  const row = await queryOne<MetricsRow>(`${SELECT} WHERE asset_id = $1`, [assetId])
  return row ? toMetrics(row) : null
}

export async function listAllMetrics(): Promise<ItemMetrics[]> {
  const rows = await query<MetricsRow>(`${SELECT} WHERE active = TRUE`)
  return rows.map(toMetrics)
}

export async function topByLiquidity(limit: number): Promise<ItemMetrics[]> {
  const rows = await query<MetricsRow>(
    `${SELECT} WHERE active = TRUE ORDER BY liquidity_score DESC LIMIT $1`,
    [limit]
  )
  return rows.map(toMetrics)
}

// ── Observabilidade dos coletores ──────────────────────────────────────────

export async function startRun(collector: string): Promise<string> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO collector_runs (collector, status) VALUES ($1, 'running') RETURNING id`,
    [collector]
  )
  return String(row!.id)
}

export async function finishRun(
  runId: string,
  result: Partial<CollectorRun> & { startedMs: number }
): Promise<void> {
  await query(
    `UPDATE collector_runs SET
       finished_at = now(),
       duration_ms = $2,
       status = $3,
       items_processed = $4,
       items_written = $5,
       request_count = $6,
       errors = $7,
       quota_remaining = $8,
       notes = $9
     WHERE id = $1`,
    [
      Number(runId),
      Date.now() - result.startedMs,
      result.status ?? "ok",
      result.itemsProcessed ?? 0,
      result.itemsWritten ?? 0,
      result.requestCount ?? 0,
      JSON.stringify(result.errors ?? []),
      result.quotaRemaining ?? null,
      result.notes ?? null,
    ]
  )
}

/**
 * Última execução de cada coletor.
 *
 * DISTINCT ON é o idioma do Postgres para "a linha mais recente por grupo" —
 * uma consulta, em vez de buscar 120 e deduplicar em memória como no Firestore.
 */
export async function latestRuns(): Promise<Record<string, CollectorRun>> {
  const rows = await query<{
    collector: string
    started_at: Date
    finished_at: Date | null
    duration_ms: number | null
    status: string
    items_processed: number
    items_written: number
    request_count: number
    errors: { message: string; count: number }[]
    quota_remaining: number | null
    notes: string | null
  }>(
    `SELECT DISTINCT ON (collector) *
     FROM collector_runs
     ORDER BY collector, started_at DESC`
  )

  const out: Record<string, CollectorRun> = {}
  for (const row of rows) {
    out[row.collector] = {
      collector: row.collector,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      status: row.status as CollectorRun["status"],
      itemsProcessed: row.items_processed,
      itemsWritten: row.items_written,
      requestCount: row.request_count,
      errors: row.errors,
      quotaRemaining: row.quota_remaining,
      notes: row.notes,
    }
  }
  return out
}

export async function pruneRuns(olderThanDays: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `WITH del AS (
       DELETE FROM collector_runs WHERE started_at < now() - ($1 || ' days')::interval RETURNING 1
     ) SELECT count(*)::int AS count FROM del`,
    [olderThanDays]
  )
  return rows[0]?.count ?? 0
}

// ── Agregados globais ──────────────────────────────────────────────────────

export async function writeMarketSnapshot(data: Record<string, unknown>): Promise<void> {
  await query(`INSERT INTO market_snapshots (t, data) VALUES (now(), $1)`, [JSON.stringify(data)])
}

export async function listMarketSnapshots(sinceDays: number): Promise<Record<string, unknown>[]> {
  const rows = await query<{ t: Date; data: Record<string, unknown> }>(
    `SELECT t, data FROM market_snapshots
     WHERE t >= now() - ($1 || ' days')::interval
     ORDER BY t ASC`,
    [sinceDays]
  )
  return rows.map((row) => ({ ...row.data, t: row.t }))
}

export { COLLECTION }
