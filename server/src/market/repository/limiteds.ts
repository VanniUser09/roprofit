import { query, queryOne, tx } from "../../db/pool"
import type { DailyPoint, Limited, Snapshot, Tier } from "../types"

/**
 * Repositório do catálogo, dos snapshots e das séries diárias — agora em SQL.
 *
 * As assinaturas são idênticas às da versão Firestore de propósito: as camadas
 * que chamam estas funções (coletores, analytics, API) não mudaram uma linha na
 * migração. O que mudou vive só aqui.
 *
 * Onde antes havia varredura de documentos em JavaScript, agora há uma cláusula
 * WHERE — mais barato e mais claro. E não há mais custo por leitura, então o
 * dirty-check continua (evita I/O e ruído no histórico) mas deixou de ser uma
 * questão de fatura.
 */

// ── Mapeamento linha ↔ objeto do domínio ────────────────────────────────────
//
// O Postgres usa snake_case; o resto do código, camelCase. A tradução fica
// confinada a estas duas funções.

type LimitedRow = {
  asset_id: number
  collectible_item_id: string | null
  name: string
  acronym: string | null
  asset_type: number | null
  thumbnail_url: string | null
  total_quantity: number | null
  created_utc: Date | null
  tier: Tier
  active: boolean
  needs_mapping: boolean
  mapping_priority: number
  source_roblox: boolean
  source_rolimons: boolean
  last_seen_at: Date | null
  resellers_checked_at: Date | null
  daily_checked_at: Date | null
}

function toLimited(row: LimitedRow): Limited {
  return {
    assetId: row.asset_id,
    collectibleItemId: row.collectible_item_id,
    name: row.name,
    acronym: row.acronym,
    assetType: row.asset_type,
    thumbnailUrl: row.thumbnail_url,
    totalQuantity: row.total_quantity,
    createdUtc: row.created_utc ? row.created_utc.toISOString() : null,
    tier: row.tier,
    active: row.active,
    needsMapping: row.needs_mapping,
    mappingPriority: row.mapping_priority,
    sources: { roblox: row.source_roblox, rolimons: row.source_rolimons },
    lastSeenAt: row.last_seen_at,
    resellersCheckedAt: row.resellers_checked_at,
    dailyCheckedAt: row.daily_checked_at,
  }
}

export type LimitedUpsert = Partial<Limited> & { assetId: number }

/**
 * Insere ou atualiza itens do catálogo, em uma transação.
 *
 * COALESCE preserva o que cada coletor não conhece: o do Rolimon's manda nome e
 * sigla e deixa o CIIID nulo; o merge não pode zerar o CIIID que o backfill já
 * gravou. É o equivalente SQL do `merge: true` do Firestore, campo a campo.
 *
 * `touch` carimba `last_seen_at`. Só é passado quando a escrita já ia acontecer
 * — nunca sozinho, que era o vazamento de 603 mil escritas/dia do Firestore.
 */
export async function upsertLimiteds(
  items: LimitedUpsert[],
  options: { touch?: boolean } = {}
): Promise<number> {
  if (items.length === 0) return 0
  const seen = options.touch ? "now()" : "limiteds.last_seen_at"

  await tx(async (client) => {
    for (const item of items) {
      await client.query(
        `INSERT INTO limiteds (
           asset_id, collectible_item_id, name, acronym, asset_type, thumbnail_url,
           total_quantity, created_utc, tier, active, needs_mapping, mapping_priority,
           source_roblox, source_rolimons, last_seen_at,
           resellers_checked_at, daily_checked_at
         ) VALUES (
           $1, $2, COALESCE($3, ''), $4, $5, $6, $7, $8,
           COALESCE($9, 'B'), COALESCE($10, TRUE), COALESCE($11, TRUE), COALESCE($12, 10),
           COALESCE($13, FALSE), COALESCE($14, FALSE), ${options.touch ? "now()" : "NULL"},
           $15, $16
         )
         ON CONFLICT (asset_id) DO UPDATE SET
           collectible_item_id = COALESCE(EXCLUDED.collectible_item_id, limiteds.collectible_item_id),
           name                = COALESCE(NULLIF(EXCLUDED.name, ''), limiteds.name),
           acronym             = COALESCE(EXCLUDED.acronym, limiteds.acronym),
           asset_type          = COALESCE(EXCLUDED.asset_type, limiteds.asset_type),
           thumbnail_url       = COALESCE(EXCLUDED.thumbnail_url, limiteds.thumbnail_url),
           total_quantity      = COALESCE(EXCLUDED.total_quantity, limiteds.total_quantity),
           created_utc         = COALESCE(EXCLUDED.created_utc, limiteds.created_utc),
           tier                = COALESCE(EXCLUDED.tier, limiteds.tier),
           active              = COALESCE(EXCLUDED.active, limiteds.active),
           needs_mapping       = COALESCE(EXCLUDED.needs_mapping, limiteds.needs_mapping),
           mapping_priority    = COALESCE(EXCLUDED.mapping_priority, limiteds.mapping_priority),
           source_roblox       = limiteds.source_roblox OR EXCLUDED.source_roblox,
           source_rolimons     = limiteds.source_rolimons OR EXCLUDED.source_rolimons,
           last_seen_at        = ${seen},
           resellers_checked_at= COALESCE(EXCLUDED.resellers_checked_at, limiteds.resellers_checked_at),
           daily_checked_at    = COALESCE(EXCLUDED.daily_checked_at, limiteds.daily_checked_at)`,
        [
          item.assetId,
          item.collectibleItemId ?? null,
          item.name ?? null,
          item.acronym ?? null,
          item.assetType ?? null,
          item.thumbnailUrl ?? null,
          item.totalQuantity ?? null,
          item.createdUtc ?? null,
          item.tier ?? null,
          item.active ?? null,
          item.needsMapping ?? null,
          item.mappingPriority ?? null,
          item.sources?.roblox ?? null,
          item.sources?.rolimons ?? null,
          item.resellersCheckedAt ?? null,
          item.dailyCheckedAt ?? null,
        ]
      )
    }
  })
  return items.length
}

/**
 * Campos cuja mudança justifica uma escrita.
 *
 * Idêntico à versão Firestore: timestamps de controle ficam de fora porque
 * mudam a cada ciclo e fariam o filtro deixar tudo passar.
 */
const WRITE_WORTHY: (keyof Limited)[] = [
  "collectibleItemId",
  "name",
  "acronym",
  "assetType",
  "thumbnailUrl",
  "totalQuantity",
  "createdUtc",
  "tier",
  "active",
  "needsMapping",
  "mappingPriority",
]

export function pickChanged(
  current: Map<number, Limited>,
  candidates: LimitedUpsert[]
): LimitedUpsert[] {
  return candidates.filter((candidate) => {
    const existing = current.get(candidate.assetId)
    if (!existing) return true
    return WRITE_WORTHY.some((field) => {
      if (!(field in candidate)) return false
      return (candidate[field] ?? null) !== (existing[field] ?? null)
    })
  })
}

export async function getLimited(assetId: number): Promise<Limited | null> {
  const row = await queryOne<LimitedRow>("SELECT * FROM limiteds WHERE asset_id = $1", [assetId])
  return row ? toLimited(row) : null
}

export async function listLimiteds(options?: {
  tier?: Tier
  activeOnly?: boolean
  limit?: number
}): Promise<Limited[]> {
  const where: string[] = []
  const params: unknown[] = []

  if (options?.activeOnly !== false) where.push("active = TRUE")
  if (options?.tier) {
    params.push(options.tier)
    where.push(`tier = $${params.length}`)
  }

  let sql = "SELECT * FROM limiteds"
  if (where.length) sql += " WHERE " + where.join(" AND ")
  if (options?.limit) {
    params.push(options.limit)
    sql += ` LIMIT $${params.length}`
  }

  const rows = await query<LimitedRow>(sql, params)
  return rows.map(toLimited)
}

/** Fila do backfill de CIIID, mais prioritária primeiro. */
export async function nextUnmapped(limit: number): Promise<Limited[]> {
  const rows = await query<LimitedRow>(
    `SELECT * FROM limiteds
     WHERE needs_mapping = TRUE
     ORDER BY mapping_priority DESC
     LIMIT $1`,
    [limit]
  )
  return rows.map(toLimited)
}

/** Tier A com book mais desatualizado primeiro (rodízio). */
export async function nextForResellers(limit: number): Promise<Limited[]> {
  const rows = await query<LimitedRow>(
    `SELECT * FROM limiteds
     WHERE active = TRUE AND tier = 'A'
     ORDER BY resellers_checked_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  )
  return rows.map(toLimited)
}

export async function nextForDaily(limit: number): Promise<Limited[]> {
  const rows = await query<LimitedRow>(
    `SELECT * FROM limiteds
     WHERE active = TRUE
     ORDER BY daily_checked_at ASC NULLS FIRST
     LIMIT $1`,
    [limit]
  )
  return rows.map(toLimited)
}

export async function markChecked(
  assetId: number,
  field: "resellersCheckedAt" | "dailyCheckedAt"
): Promise<void> {
  const column = field === "resellersCheckedAt" ? "resellers_checked_at" : "daily_checked_at"
  await query(`UPDATE limiteds SET ${column} = now() WHERE asset_id = $1`, [assetId])
}

/**
 * Grava um snapshot, mas só se algo mudou desde o anterior.
 *
 * A checagem virou um LEFT JOIN LATERAL contra o último snapshot do item, feito
 * dentro do próprio INSERT: uma ida ao banco em vez de duas. `IS DISTINCT FROM`
 * trata null corretamente (null ≠ null seria o comportamento errado aqui).
 */
export async function writeSnapshotIfChanged(
  assetId: number,
  snapshot: Omit<Snapshot, "t">
): Promise<boolean> {
  const rows = await query<{ inserted: boolean }>(
    `WITH prev AS (
       SELECT * FROM snapshots WHERE asset_id = $1 ORDER BY t DESC LIMIT 1
     ), ins AS (
       INSERT INTO snapshots (
         asset_id, t, rap, value, demand, trend, projected, hyped, rare,
         lowest_resale_price, second_lowest_price, reseller_count, book_depth_10,
         units_available, asset_stock, spread_pct, source
       )
       SELECT $1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       WHERE NOT EXISTS (
         SELECT 1 FROM prev WHERE
              prev.rap IS NOT DISTINCT FROM $2
          AND prev.value IS NOT DISTINCT FROM $3
          AND prev.demand IS NOT DISTINCT FROM $4
          AND prev.trend IS NOT DISTINCT FROM $5
          AND prev.projected IS NOT DISTINCT FROM $6
          AND prev.hyped IS NOT DISTINCT FROM $7
          AND prev.rare IS NOT DISTINCT FROM $8
          AND prev.lowest_resale_price IS NOT DISTINCT FROM $9
          AND prev.second_lowest_price IS NOT DISTINCT FROM $10
          AND prev.reseller_count IS NOT DISTINCT FROM $11
          AND prev.book_depth_10 IS NOT DISTINCT FROM $12
          AND prev.units_available IS NOT DISTINCT FROM $13
          AND prev.asset_stock IS NOT DISTINCT FROM $14
       )
       RETURNING 1
     )
     SELECT EXISTS (SELECT 1 FROM ins) AS inserted`,
    [
      assetId,
      snapshot.rap,
      snapshot.value,
      snapshot.demand,
      snapshot.trend,
      snapshot.projected,
      snapshot.hyped,
      snapshot.rare,
      snapshot.lowestResalePrice,
      snapshot.secondLowestPrice,
      snapshot.resellerCount,
      snapshot.bookDepth10,
      snapshot.unitsAvailable,
      snapshot.assetStock,
      snapshot.spreadPct,
      snapshot.source,
    ]
  )
  return rows[0]?.inserted ?? false
}

type SnapshotRow = {
  t: Date
  rap: number | null
  value: number | null
  demand: number | null
  trend: number | null
  projected: boolean
  hyped: boolean
  rare: boolean
  lowest_resale_price: number | null
  second_lowest_price: number | null
  reseller_count: number | null
  book_depth_10: number | null
  units_available: number | null
  asset_stock: number | null
  spread_pct: number | null
  source: string
}

function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    t: row.t,
    rap: row.rap,
    value: row.value,
    demand: row.demand as Snapshot["demand"],
    trend: row.trend as Snapshot["trend"],
    projected: row.projected,
    hyped: row.hyped,
    rare: row.rare,
    lowestResalePrice: row.lowest_resale_price,
    secondLowestPrice: row.second_lowest_price,
    resellerCount: row.reseller_count,
    bookDepth10: row.book_depth_10,
    unitsAvailable: row.units_available,
    assetStock: row.asset_stock,
    spreadPct: row.spread_pct,
    source: row.source as Snapshot["source"],
  }
}

export async function listSnapshots(assetId: number, sinceDays: number): Promise<Snapshot[]> {
  const rows = await query<SnapshotRow>(
    `SELECT * FROM snapshots
     WHERE asset_id = $1 AND t >= now() - ($2 || ' days')::interval
     ORDER BY t ASC`,
    [assetId, sinceDays]
  )
  return rows.map(toSnapshot)
}

/**
 * Grava pontos diários. Id = (item, data), então reprocessar o mesmo período
 * atualiza em vez de duplicar — o ON CONFLICT faz o que o doc-por-data fazia.
 */
export async function writeDailyPoints(assetId: number, points: DailyPoint[]): Promise<number> {
  if (points.length === 0) return 0
  await tx(async (client) => {
    for (const point of points) {
      await client.query(
        `INSERT INTO daily_points (asset_id, date, avg_price, volume)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (asset_id, date) DO UPDATE SET
           avg_price = COALESCE(EXCLUDED.avg_price, daily_points.avg_price),
           volume    = COALESCE(EXCLUDED.volume, daily_points.volume)`,
        [assetId, point.date, point.avgPrice, point.volume]
      )
    }
  })
  return points.length
}

export async function listDailyPoints(assetId: number, sinceDays: number): Promise<DailyPoint[]> {
  const rows = await query<{ date: Date; avg_price: number | null; volume: number | null }>(
    `SELECT date, avg_price, volume FROM daily_points
     WHERE asset_id = $1 AND date >= (now() - ($2 || ' days')::interval)::date
     ORDER BY date ASC`,
    [assetId, sinceDays]
  )
  // A coluna DATE volta como Date; a série trabalha com "YYYY-MM-DD".
  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    avgPrice: row.avg_price,
    volume: row.volume,
  }))
}

export async function setTiers(assignments: { assetId: number; tier: Tier }[]): Promise<number> {
  if (assignments.length === 0) return 0
  await tx(async (client) => {
    for (const a of assignments) {
      await client.query("UPDATE limiteds SET tier = $2 WHERE asset_id = $1", [a.assetId, a.tier])
    }
  })
  return assignments.length
}

export async function countLimiteds(): Promise<{ total: number; mapped: number; tierA: number }> {
  const row = await queryOne<{ total: number; mapped: number; tier_a: number }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE needs_mapping = FALSE)::int AS mapped,
       count(*) FILTER (WHERE tier = 'A')::int AS tier_a
     FROM limiteds`
  )
  return { total: row?.total ?? 0, mapped: row?.mapped ?? 0, tierA: row?.tier_a ?? 0 }
}

/**
 * Apaga snapshots além da janela de retenção.
 *
 * No Firestore isso era o TTL nativo da coleção; no Postgres é um DELETE que o
 * agendador chama uma vez por dia. Barato: o índice em `t` cobre exatamente
 * este predicado.
 */
export async function pruneSnapshots(olderThanDays: number): Promise<number> {
  const rows = await query<{ count: number }>(
    `WITH del AS (
       DELETE FROM snapshots WHERE t < now() - ($1 || ' days')::interval RETURNING 1
     )
     SELECT count(*)::int AS count FROM del`,
    [olderThanDays]
  )
  return rows[0]?.count ?? 0
}
