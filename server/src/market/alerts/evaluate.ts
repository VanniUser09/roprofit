import { query, tx } from "../../db/pool"
import { runCollector } from "../collectors/run"
import { listAllMetrics } from "../repository/metrics"
import {
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

    await tx(async (client) => {
      for (const alert of pending) {
        await client.query(
          `INSERT INTO alerts
             (rule_id, rule_label, asset_id, item_name, thumbnail_url,
              metric, value, threshold, severity, message, read)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, FALSE)`,
          [alert.ruleId, alert.ruleLabel, alert.assetId, alert.itemName, alert.thumbnailUrl,
           alert.metric, alert.value, alert.threshold, alert.severity, alert.message]
        )
      }
    })

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
  // Última vez que cada par regra+item disparou. DISTINCT ON resolve no banco
  // o que antes era deduplicação de 500 documentos em memória.
  const rows = await query<{ rule_id: string; asset_id: number; created_at: Date }>(
    `SELECT DISTINCT ON (rule_id, asset_id) rule_id, asset_id, created_at
     FROM alerts
     ORDER BY rule_id, asset_id, created_at DESC`
  )
  const keys = new Map<string, number>()
  for (const row of rows) {
    keys.set(`${row.rule_id}:${row.asset_id}`, row.created_at.getTime())
  }
  return keys
}

type AlertRow = {
  id: number
  rule_id: string
  rule_label: string
  asset_id: number
  item_name: string
  thumbnail_url: string | null
  metric: string
  value: number
  threshold: number
  severity: string
  message: string
  read: boolean
}

function toAlert(row: AlertRow): Alert & { id: string } {
  return {
    id: String(row.id),
    ruleId: row.rule_id,
    ruleLabel: row.rule_label,
    assetId: row.asset_id,
    itemName: row.item_name,
    thumbnailUrl: row.thumbnail_url,
    metric: row.metric as Alert["metric"],
    value: row.value,
    threshold: row.threshold,
    severity: row.severity as Alert["severity"],
    message: row.message,
    read: row.read,
    createdAt: null,
  }
}

export async function listAlerts(options: { unreadOnly?: boolean; limit?: number } = {}) {
  const where = options.unreadOnly ? "WHERE read = FALSE" : ""
  const rows = await query<AlertRow>(
    `SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT $1`,
    [options.limit ?? 60]
  )
  return rows.map(toAlert)
}

export async function markAlertRead(id: string): Promise<void> {
  await query("UPDATE alerts SET read = TRUE WHERE id = $1", [Number(id)])
}

export async function markAllAlertsRead(): Promise<number> {
  const rows = await query<{ count: number }>(
    `WITH upd AS (UPDATE alerts SET read = TRUE WHERE read = FALSE RETURNING 1)
     SELECT count(*)::int AS count FROM upd`
  )
  return rows[0]?.count ?? 0
}
