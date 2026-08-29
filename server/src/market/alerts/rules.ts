import { randomUUID } from "node:crypto"

import { query, queryOne, tx } from "../../db/pool"
import type { ItemMetrics } from "../types"

/**
 * Alertas administrativos configuráveis.
 *
 * O desenho evita o problema clássico de sistema de alerta: virar ruído. Duas
 * defesas — cooldown por item+regra (nada dispara duas vezes no mesmo dia) e
 * exigência de confiança mínima, para não alertar sobre um item do qual só
 * temos dois dias de observação.
 */

export type AlertMetric =
  | "liquidityScore"
  | "salesPerDay7d"
  | "rapDiscountPct"
  | "volatility30d"
  | "priceTrend7d"
  | "salesVolumeChange24h"

export type AlertOperator = "gt" | "lt"

export type AlertRule = {
  id: string
  enabled: boolean
  label: string
  metric: AlertMetric
  operator: AlertOperator
  threshold: number
  /** Só considera itens com pelo menos esta confiança. */
  minConfidence: number
  /** Restringe a uma faixa de preço, quando faz sentido. */
  priceMin?: number | null
  priceMax?: number | null
  severity: "info" | "good" | "warning" | "critical"
  /** Horas de silêncio para o mesmo item nesta regra. */
  cooldownHours: number
  createdAt?: unknown
}

export type Alert = {
  ruleId: string
  ruleLabel: string
  assetId: number
  itemName: string
  thumbnailUrl: string | null
  metric: AlertMetric
  value: number
  threshold: number
  severity: AlertRule["severity"]
  message: string
  read: boolean
  createdAt: unknown
}

/**
 * Regras padrão, criadas na primeira execução.
 *
 * São as do plano, traduzidas em limiares concretos. O admin edita ou desliga
 * qualquer uma — não são fixas no código.
 */
export const DEFAULT_RULES: Omit<AlertRule, "id">[] = [
  {
    enabled: true,
    label: "Liquidez excelente",
    metric: "liquidityScore",
    operator: "gt",
    threshold: 85,
    minConfidence: 0.7,
    priceMin: 500,
    priceMax: 40_000,
    severity: "good",
    cooldownHours: 72,
  },
  {
    enabled: true,
    label: "Abaixo do RAP",
    metric: "rapDiscountPct",
    operator: "lt",
    threshold: -0.10,
    minConfidence: 0.5,
    priceMin: 500,
    priceMax: 40_000,
    severity: "good",
    cooldownHours: 24,
  },
  {
    enabled: true,
    label: "Volume disparou em 24h",
    metric: "salesVolumeChange24h",
    operator: "gt",
    threshold: 0.35,
    minConfidence: 0.5,
    priceMin: null,
    priceMax: null,
    severity: "info",
    cooldownHours: 24,
  },
  {
    enabled: true,
    label: "Preço médio caindo",
    metric: "priceTrend7d",
    operator: "lt",
    threshold: -0.08,
    minConfidence: 0.5,
    priceMin: null,
    priceMax: null,
    severity: "warning",
    cooldownHours: 48,
  },
  {
    enabled: true,
    label: "Volatilidade alta",
    metric: "volatility30d",
    operator: "gt",
    threshold: 0.25,
    minConfidence: 0.5,
    priceMin: 500,
    priceMax: 40_000,
    severity: "critical",
    cooldownHours: 72,
  },
]

type RuleRow = {
  id: string
  enabled: boolean
  label: string
  metric: string
  operator: string
  threshold: number
  min_confidence: number
  price_min: number | null
  price_max: number | null
  severity: string
  cooldown_hours: number
}

function toRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    enabled: row.enabled,
    label: row.label,
    metric: row.metric as AlertMetric,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    minConfidence: row.min_confidence,
    priceMin: row.price_min,
    priceMax: row.price_max,
    severity: row.severity as AlertRule["severity"],
    cooldownHours: row.cooldown_hours,
  }
}

/**
 * Lista as regras; semeia os padrões na primeira vez.
 *
 * A semeadura roda numa transação com ON CONFLICT DO NOTHING, então dois
 * coletores subindo juntos no primeiro boot não criam regras duplicadas — o
 * equivalente seguro do "if empty then seed" que no Firestore tinha corrida.
 */
export async function listRules(): Promise<AlertRule[]> {
  const rows = await query<RuleRow>("SELECT * FROM alert_rules ORDER BY created_at ASC")
  if (rows.length > 0) return rows.map(toRule)
  return seedDefaults()
}

async function seedDefaults(): Promise<AlertRule[]> {
  const created: AlertRule[] = []
  await tx(async (client) => {
    for (const rule of DEFAULT_RULES) {
      const id = randomUUID()
      await client.query(
        `INSERT INTO alert_rules
           (id, enabled, label, metric, operator, threshold, min_confidence,
            price_min, price_max, severity, cooldown_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [id, rule.enabled, rule.label, rule.metric, rule.operator, rule.threshold,
         rule.minConfidence, rule.priceMin ?? null, rule.priceMax ?? null,
         rule.severity, rule.cooldownHours]
      )
      created.push({ ...rule, id })
    }
  })
  return created
}

const COLUMN: Record<string, string> = {
  enabled: "enabled", label: "label", metric: "metric", operator: "operator",
  threshold: "threshold", minConfidence: "min_confidence", priceMin: "price_min",
  priceMax: "price_max", severity: "severity", cooldownHours: "cooldown_hours",
}

export async function saveRule(id: string | null, data: Partial<AlertRule>): Promise<string> {
  if (id) {
    // Update parcial: monta o SET só com os campos enviados, para não zerar o
    // que o formulário não mandou.
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, column] of Object.entries(COLUMN)) {
      if (key in data) {
        params.push((data as Record<string, unknown>)[key])
        sets.push(`${column} = $${params.length}`)
      }
    }
    if (sets.length > 0) {
      params.push(id)
      await query(`UPDATE alert_rules SET ${sets.join(", ")} WHERE id = $${params.length}`, params)
    }
    return id
  }

  const newId = randomUUID()
  await query(
    `INSERT INTO alert_rules
       (id, enabled, label, metric, operator, threshold, min_confidence,
        price_min, price_max, severity, cooldown_hours)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [newId, data.enabled ?? true, data.label ?? "Regra", data.metric ?? "liquidityScore",
     data.operator ?? "gt", data.threshold ?? 0, data.minConfidence ?? 0.5,
     data.priceMin ?? null, data.priceMax ?? null, data.severity ?? "info",
     data.cooldownHours ?? 24]
  )
  return newId
}

export async function deleteRule(id: string): Promise<void> {
  await query("DELETE FROM alert_rules WHERE id = $1", [id])
}

export { query, queryOne }

export function readMetric(item: ItemMetrics, metric: AlertMetric): number | null {
  switch (metric) {
    case "liquidityScore":
      return item.liquidityScore
    case "salesPerDay7d":
      return item.salesPerDay7d
    case "rapDiscountPct":
      return item.rapDiscountPct
    case "volatility30d":
      return item.volatility30d
    case "priceTrend7d":
      return item.priceTrend7d
    case "salesVolumeChange24h": {
      // Vendas de ontem contra a média da semana. Comparar com o mesmo dia da
      // semana anterior seria melhor, mas exige histórico que ainda não temos.
      const recent = item.salesPerDay24h
      const baseline = item.salesPerDay7d
      if (recent === null || baseline === null || baseline === 0) return null
      return (recent - baseline) / baseline
    }
  }
}

export function formatAlertMessage(rule: AlertRule, item: ItemMetrics, value: number): string {
  const name = item.name

  switch (rule.metric) {
    case "liquidityScore":
      return `${name} está com Liquidity Score ${Math.round(value)}.`
    case "salesPerDay7d":
      return `${name} está vendendo ${value.toFixed(1)} unidades por dia.`
    case "rapDiscountPct":
      return `${name} está ${Math.abs(value * 100).toFixed(1)}% abaixo do RAP.`
    case "volatility30d":
      return `${name} está com volatilidade de ${(value * 100).toFixed(1)}% em 30 dias.`
    case "priceTrend7d":
      return value < 0
        ? `${name} caiu ${Math.abs(value * 100).toFixed(1)}% no preço médio da semana.`
        : `${name} subiu ${(value * 100).toFixed(1)}% no preço médio da semana.`
    case "salesVolumeChange24h":
      return `${name} teve variação de ${(value * 100).toFixed(0)}% no volume de vendas em 24h.`
  }
}
