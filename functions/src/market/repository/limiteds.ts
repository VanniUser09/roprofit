import type { DocumentData, Query } from "firebase-admin/firestore"

import { COLLECTION } from "../../config"
import { db, FieldValue, Timestamp } from "../../lib/firebase"
import type { DailyPoint, Limited, Snapshot, Tier } from "../types"

/**
 * Única camada que conhece o Firestore.
 *
 * Analytics, Liquidity e a API falam com estas funções, nunca com `db`. Se um
 * dia trocarmos Firestore por outra coisa (a seção de limitações do plano
 * prevê BigQuery se o histórico crescer), o que muda é este arquivo.
 */

const LIMITEDS = "limiteds"

export const limitedsRef = db.collection(LIMITEDS)

function docRef(assetId: number) {
  return limitedsRef.doc(String(assetId))
}

function ttl(days: number) {
  return Timestamp.fromMillis(Date.now() + days * 86_400_000)
}

/** Firestore limita 500 operações por batch; 400 deixa margem para o TTL. */
const BATCH_SIZE = 400

async function commitInChunks<T>(
  items: T[],
  apply: (batch: FirebaseFirestore.WriteBatch, item: T) => void
): Promise<number> {
  let written = 0
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)
    const batch = db.batch()
    for (const item of chunk) apply(batch, item)
    await batch.commit()
    written += chunk.length
  }
  return written
}

export type LimitedUpsert = Partial<Limited> & { assetId: number }

/**
 * Insere ou atualiza itens do catálogo.
 *
 * `merge: true` porque cada coletor conhece só uma fatia do documento: o
 * Rolimon's traz nome e sigla, o catalog traz o CIIID, o marketplace traz
 * estoque. Sobrescrever o documento inteiro apagaria o trabalho dos outros.
 *
 * NÃO carimba `lastSeenAt` a cada chamada. A versão anterior fazia isso, e como
 * o timestamp muda sempre, toda escrita passava: 603 mil escritas por dia só
 * para atualizar um campo que nada lê. Agora o carimbo só acompanha uma escrita
 * que já ia acontecer por outro motivo — passe `touch: true` para forçá-lo.
 */
export async function upsertLimiteds(
  items: LimitedUpsert[],
  options: { touch?: boolean } = {}
): Promise<number> {
  if (items.length === 0) return 0
  return commitInChunks(items, (batch, item) => {
    batch.set(
      docRef(item.assetId),
      options.touch ? { ...item, lastSeenAt: FieldValue.serverTimestamp() } : item,
      { merge: true }
    )
  })
}

/**
 * Campos cuja mudança justifica uma escrita.
 *
 * Timestamps de controle ficam de fora de propósito: eles mudam a cada ciclo e
 * fariam o filtro deixar tudo passar, que era exatamente o problema.
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

/**
 * Filtra os upserts que realmente mudam alguma coisa.
 *
 * Os coletores já carregam o catálogo inteiro para montar o lote de
 * requisições, então comparar contra o estado atual custa zero leitura extra —
 * e corta a grande maioria das escritas, porque a maior parte dos 2.500
 * Limiteds não muda de nome nem de estoque de 15 em 15 minutos.
 */
export function pickChanged(
  current: Map<number, Limited>,
  candidates: LimitedUpsert[]
): LimitedUpsert[] {
  return candidates.filter((candidate) => {
    const existing = current.get(candidate.assetId)
    if (!existing) return true

    return WRITE_WORTHY.some((field) => {
      if (!(field in candidate)) return false
      const next = candidate[field] ?? null
      const previous = existing[field] ?? null
      return next !== previous
    })
  })
}

export async function getLimited(assetId: number): Promise<Limited | null> {
  const snap = await docRef(assetId).get()
  return snap.exists ? (snap.data() as Limited) : null
}

export async function listLimiteds(options?: {
  tier?: Tier
  activeOnly?: boolean
  limit?: number
}): Promise<Limited[]> {
  let query: Query<DocumentData> = limitedsRef
  if (options?.activeOnly !== false) query = query.where("active", "==", true)
  if (options?.tier) query = query.where("tier", "==", options.tier)
  if (options?.limit) query = query.limit(options.limit)

  const snap = await query.get()
  return snap.docs.map((d) => d.data() as Limited)
}

/**
 * Fila do backfill de CIIID, mais prioritária primeiro.
 *
 * A prioridade é o preço estimado dentro da faixa da operação: itens que a
 * RoProfit realmente compraria são mapeados em minutos, e a cauda longa
 * termina ao longo de algumas horas. Sem isso, o painel ficaria inútil no
 * primeiro dia esperando 2.500 requisições travadas pelo 429 do catalog.
 */
export async function nextUnmapped(limit: number): Promise<Limited[]> {
  const snap = await limitedsRef
    .where("needsMapping", "==", true)
    .orderBy("mappingPriority", "desc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => d.data() as Limited)
}

/**
 * Itens do Tier A com book mais desatualizado primeiro.
 *
 * Ordenar por `resellersCheckedAt` faz o coletor rodar em rodízio: se uma
 * execução não vencer a lista toda, a próxima continua de onde parou em vez de
 * reprocessar sempre os mesmos primeiros itens.
 */
export async function nextForResellers(limit: number): Promise<Limited[]> {
  const snap = await limitedsRef
    .where("active", "==", true)
    .where("tier", "==", "A")
    .orderBy("resellersCheckedAt", "asc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => d.data() as Limited)
}

/** Itens cuja série diária está mais velha. Mesma lógica de rodízio. */
export async function nextForDaily(limit: number): Promise<Limited[]> {
  const snap = await limitedsRef
    .where("active", "==", true)
    .orderBy("dailyCheckedAt", "asc")
    .limit(limit)
    .get()
  return snap.docs.map((d) => d.data() as Limited)
}

export async function markChecked(
  assetId: number,
  field: "resellersCheckedAt" | "dailyCheckedAt"
) {
  await docRef(assetId).set({ [field]: FieldValue.serverTimestamp() }, { merge: true })
}

/**
 * Grava um snapshot, mas só se algo mudou desde o anterior.
 *
 * A maioria dos 2.500 Limiteds fica parada a maior parte do dia. Sem este
 * dirty-check seriam ~240 mil escritas/dia, quase todas idênticas à anterior —
 * custo puro, sem informação nova. Com ele, cai para algo em torno de 30%.
 */
export async function writeSnapshotIfChanged(
  assetId: number,
  snapshot: Omit<Snapshot, "t">
): Promise<boolean> {
  const collection = docRef(assetId).collection("snapshots")

  const previous = await collection.orderBy("t", "desc").limit(1).get()
  if (!previous.empty && isSameSnapshot(previous.docs[0].data() as Snapshot, snapshot)) {
    return false
  }

  const now = new Date()
  await collection.doc(now.toISOString()).set({
    ...snapshot,
    t: Timestamp.fromDate(now),
    expiresAt: ttl(COLLECTION.snapshotTtlDays),
  })
  return true
}

/** Compara só os campos que mudam de verdade; `t` e TTL são sempre diferentes. */
function isSameSnapshot(previous: Snapshot, next: Omit<Snapshot, "t">): boolean {
  const watched: (keyof Omit<Snapshot, "t" | "source">)[] = [
    "rap",
    "value",
    "demand",
    "trend",
    "projected",
    "hyped",
    "rare",
    "lowestResalePrice",
    "secondLowestPrice",
    "resellerCount",
    "bookDepth10",
    "unitsAvailable",
    "assetStock",
  ]
  return watched.every((key) => (previous[key] ?? null) === (next[key] ?? null))
}

export async function listSnapshots(assetId: number, sinceDays: number): Promise<Snapshot[]> {
  const since = Timestamp.fromMillis(Date.now() - sinceDays * 86_400_000)
  const snap = await docRef(assetId)
    .collection("snapshots")
    .where("t", ">=", since)
    .orderBy("t", "asc")
    .get()
  return snap.docs.map((d) => d.data() as Snapshot)
}

/**
 * Pontos diários da Roblox. Documento com id igual à data, então reprocessar
 * o mesmo período é idempotente em vez de duplicar a série.
 */
export async function writeDailyPoints(assetId: number, points: DailyPoint[]): Promise<number> {
  const collection = docRef(assetId).collection("daily")
  return commitInChunks(points, (batch, point) => {
    batch.set(collection.doc(point.date), point, { merge: true })
  })
}

export async function listDailyPoints(assetId: number, sinceDays: number): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10)
  const snap = await docRef(assetId)
    .collection("daily")
    .where("date", ">=", since)
    .orderBy("date", "asc")
    .get()
  return snap.docs.map((d) => d.data() as DailyPoint)
}

export async function setTiers(assignments: { assetId: number; tier: Tier }[]): Promise<number> {
  return commitInChunks(assignments, (batch, item) => {
    batch.set(docRef(item.assetId), { tier: item.tier }, { merge: true })
  })
}

export async function countLimiteds(): Promise<{ total: number; mapped: number; tierA: number }> {
  const [total, mapped, tierA] = await Promise.all([
    limitedsRef.count().get(),
    limitedsRef.where("needsMapping", "==", false).count().get(),
    limitedsRef.where("tier", "==", "A").count().get(),
  ])
  return {
    total: total.data().count,
    mapped: mapped.data().count,
    tierA: tierA.data().count,
  }
}
