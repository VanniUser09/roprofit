import { db, FieldValue, Timestamp } from "../../lib/firebase"
import { runCollector } from "../collectors/run"
import { listAllMetrics } from "../repository/metrics"
import {
  alertsRef,
  formatAlertMessage,
  listRules,
  readMetric,
  type Alert,
  type AlertRule,
} from "./rules"

/**
 * Avalia as regras e emite alertas.
 *
 * O maior risco de um sistema de alertas é virar ruído e ser ignorado — aí ele
 * é pior do que não existir, porque dá sensação falsa de cobertura. Três
 * defesas aqui: cooldown por item+regra, exigência de confiança mínima, e teto
 * de alertas por execução.
 */

const MAX_ALERTS_PER_RUN = 40

export async function evaluateAlerts() {
  await runCollector("evaluateAlerts", async (ctx) => {
    const [rules, metrics] = await Promise.all([listRules(), listAllMetrics()])
    const active = rules.filter((rule) => rule.enabled)

    if (active.length === 0) {
      ctx.note("nenhuma regra ativa")
      return
    }

    const recent = await loadRecentAlertKeys()
    const pending: Alert[] = []

    for (const rule of active) {
      for (const item of metrics) {
        if (pending.length >= MAX_ALERTS_PER_RUN) break
        ctx.processed++

        // Alertar sobre item com 2 dias de observação seria afirmar algo que
        // não sabemos. A confiança mínima é a defesa contra isso.
        if (item.confidence < rule.minConfidence) continue

        const price = item.lowestResalePrice
        if (rule.priceMin != null && (price === null || price < rule.priceMin)) continue
        if (rule.priceMax != null && (price === null || price > rule.priceMax)) continue

        const value = readMetric(item, rule.metric)
        if (value === null) continue

        const triggered =
          rule.operator === "gt" ? value > rule.threshold : value < rule.threshold
        if (!triggered) continue

        const key = `${rule.id}:${item.assetId}`
        const lastFired = recent.get(key)
        if (lastFired && Date.now() - lastFired < rule.cooldownHours * 3_600_000) continue

        pending.push(buildAlert(rule, item, value))
        recent.set(key, Date.now())
      }
    }

    if (pending.length === 0) {
      ctx.note("nenhum alerta novo")
      return
    }

    const batch = db.batch()
    for (const alert of pending) {
      batch.set(alertsRef.doc(), {
        ...alert,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
      })
    }
    await batch.commit()

    ctx.written = pending.length
    ctx.note(`${pending.length} alerta(s) emitido(s) de ${active.length} regra(s)`)
  })
}

function buildAlert(rule: AlertRule, item: Parameters<typeof readMetric>[0], value: number): Alert {
  return {
    ruleId: rule.id,
    ruleLabel: rule.label,
    assetId: item.assetId,
    itemName: item.name,
    thumbnailUrl: item.thumbnailUrl,
    metric: rule.metric,
    value,
    threshold: rule.threshold,
    severity: rule.severity,
    message: formatAlertMessage(rule, item, value),
    read: false,
    createdAt: null,
  }
}

/**
 * Chaves regra+item disparadas recentemente, para o cooldown.
 *
 * Uma leitura só de 500 alertas em vez de uma consulta por par avaliado —
 * seriam ~12 mil consultas por execução com 5 regras e 2.500 itens.
 */
async function loadRecentAlertKeys(): Promise<Map<string, number>> {
  const snap = await alertsRef.orderBy("createdAt", "desc").limit(500).get()
  const keys = new Map<string, number>()

  for (const doc of snap.docs) {
    const data = doc.data() as Alert & { createdAt?: { toDate(): Date } }
    const key = `${data.ruleId}:${data.assetId}`
    const at = data.createdAt?.toDate?.().getTime() ?? 0
    if (!keys.has(key)) keys.set(key, at)
  }

  return keys
}

export async function listAlerts(options: { unreadOnly?: boolean; limit?: number } = {}) {
  let query = alertsRef.orderBy("createdAt", "desc").limit(options.limit ?? 60)
  if (options.unreadOnly) query = alertsRef.where("read", "==", false).orderBy("createdAt", "desc")

  const snap = await query.get()
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Alert) }))
}

export async function markAlertRead(id: string) {
  await alertsRef.doc(id).set({ read: true }, { merge: true })
}

export async function markAllAlertsRead(): Promise<number> {
  const snap = await alertsRef.where("read", "==", false).limit(400).get()
  if (snap.empty) return 0

  const batch = db.batch()
  for (const doc of snap.docs) batch.set(doc.ref, { read: true }, { merge: true })
  await batch.commit()

  return snap.size
}
