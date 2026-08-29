import { db, FieldValue, Timestamp } from "../../lib/firebase"
import { COLLECTION } from "../../config"
import type { CollectorRun, ItemMetrics } from "../types"

/**
 * `item_metrics` é coleção RAIZ, não subcoleção de `limiteds`.
 *
 * Ranking e Oportunidades precisam ordenar e filtrar ENTRE itens. Como
 * subcoleção isso exigiria collection group query com índices frágeis. Plana,
 * são ~2.500 documentos pequenos que cabem inteiros na memória de uma Function
 * (~2 MB) — o que também resolve o limite de desigualdades do Firestore:
 * filtramos por faixa de preço no banco e o resto em memória.
 */

export const metricsRef = db.collection("item_metrics")
export const runsRef = db.collection("collector_runs")
export const snapshotsRef = db.collection("market_snapshots")

const BATCH_SIZE = 400

/**
 * Campos que decidem se vale reescrever a métrica.
 *
 * `computedAt` e `dataAgeHours` mudam a cada execução por construção, então
 * ficam de fora: incluí-los faria o filtro deixar passar os 2.500 documentos
 * toda vez, que é o custo que ele existe para evitar.
 */
const SIGNIFICANT: (keyof ItemMetrics)[] = [
  "liquidityScore",
  "confidence",
  "lowestResalePrice",
  "rap",
  "value",
  "demand",
  "trend",
  "projected",
  "salesPerDay7d",
  "salesPerDay30d",
  "salesTotal7d",
  "volatility30d",
  "priceTrend7d",
  "rapDiscountPct",
  "spreadPct",
  "bookDepth10",
  "resellerCount",
  "assetStock",
  "tier",
  "active",
  "historyDays",
]

function metricsChanged(previous: ItemMetrics | undefined, next: ItemMetrics): boolean {
  if (!previous) return true
  return SIGNIFICANT.some((field) => (previous[field] ?? null) !== (next[field] ?? null))
}

/**
 * Grava métricas, pulando as que não mudaram.
 *
 * O mercado de Limiteds é lento: a maior parte dos itens tem o mesmo preço e a
 * mesma velocidade de venda de um ciclo para o outro. Reescrever os 2.500
 * documentos a cada 15 minutos custaria 241 mil escritas por dia para gravar
 * exatamente o que já estava lá.
 *
 * A leitura prévia não é desperdício: no Firestore uma leitura custa um terço
 * de uma escrita, então a troca compensa a partir de ~33% de documentos
 * inalterados — e na prática a fração inalterada é muito maior que isso.
 */
export async function writeMetrics(metrics: ItemMetrics[]): Promise<number> {
  if (metrics.length === 0) return 0

  const existing = new Map<number, ItemMetrics>()
  const snap = await metricsRef.get()
  for (const doc of snap.docs) {
    const data = doc.data() as ItemMetrics
    existing.set(data.assetId, data)
  }

  const pending = metrics.filter((item) => metricsChanged(existing.get(item.assetId), item))

  let written = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const item of chunk) {
      batch.set(metricsRef.doc(String(item.assetId)), item, { merge: true })
    }
    await batch.commit()
    written += chunk.length
  }
  return written
}

export async function getMetrics(assetId: number): Promise<ItemMetrics | null> {
  const snap = await metricsRef.doc(String(assetId)).get()
  return snap.exists ? (snap.data() as ItemMetrics) : null
}

/**
 * Carrega o universo inteiro de métricas ativas.
 *
 * Parece caro e não é: ~2.500 documentos pequenos, servidos atrás de um cache
 * de 60s na API. Em troca, o Opportunity Engine pode aplicar dez filtros de
 * faixa combinados — algo que o Firestore não faz numa query só.
 */
export async function listAllMetrics(): Promise<ItemMetrics[]> {
  const snap = await metricsRef.where("active", "==", true).get()
  return snap.docs.map((d) => d.data() as ItemMetrics)
}

export async function topByLiquidity(limit: number): Promise<ItemMetrics[]> {
  const snap = await metricsRef
    .where("active", "==", true)
    .orderBy("liquidityScore", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => d.data() as ItemMetrics)
}

// ── Observabilidade dos coletores ──────────────────────────────────────────
//
// Sem isto, um endpoint da Roblox pode quebrar e o painel continua exibindo
// números velhos com cara de atuais — exatamente o erro que o endpoint legado
// de `economy` induz em quem não checa a data do dado.

export async function startRun(collector: string): Promise<string> {
  const doc = runsRef.doc()
  const run: Partial<CollectorRun> = {
    collector,
    startedAt: FieldValue.serverTimestamp() as unknown as Date,
    finishedAt: null,
    durationMs: null,
    status: "running",
    itemsProcessed: 0,
    itemsWritten: 0,
    requestCount: 0,
    errors: [],
    quotaRemaining: null,
    notes: null,
  }
  await doc.set({
    ...run,
    expiresAt: Timestamp.fromMillis(Date.now() + COLLECTION.collectorRunTtlDays * 86_400_000),
  })
  return doc.id
}

export async function finishRun(
  runId: string,
  result: Partial<CollectorRun> & { startedMs: number }
) {
  const { startedMs, ...rest } = result
  await runsRef.doc(runId).set(
    {
      ...rest,
      finishedAt: FieldValue.serverTimestamp(),
      durationMs: Date.now() - startedMs,
    },
    { merge: true }
  )
}

/** Última execução de cada coletor — alimenta a página de saúde da coleta. */
export async function latestRuns(): Promise<Record<string, CollectorRun>> {
  const snap = await runsRef.orderBy("startedAt", "desc").limit(120).get()
  const latest: Record<string, CollectorRun> = {}
  for (const doc of snap.docs) {
    const run = doc.data() as CollectorRun
    if (!latest[run.collector]) latest[run.collector] = run
  }
  return latest
}

export async function writeMarketSnapshot(data: Record<string, unknown>) {
  const now = new Date()
  await snapshotsRef.doc(now.toISOString()).set({ ...data, t: Timestamp.fromDate(now) })
}

export async function listMarketSnapshots(sinceDays: number) {
  const since = Timestamp.fromMillis(Date.now() - sinceDays * 86_400_000)
  const snap = await snapshotsRef.where("t", ">=", since).orderBy("t", "asc").get()
  return snap.docs.map((d) => d.data())
}
