import { db, FieldValue } from "../../lib/firebase"
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

export const rulesRef = db.collection("alert_rules")
export const alertsRef = db.collection("alerts")

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

export async function listRules(): Promise<AlertRule[]> {
  const snap = await rulesRef.get()
  if (snap.empty) return seedDefaults()
  return snap.docs.map((doc) => ({ ...(doc.data() as Omit<AlertRule, "id">), id: doc.id }))
}

async function seedDefaults(): Promise<AlertRule[]> {
  const batch = db.batch()
  const created: AlertRule[] = []

  for (const rule of DEFAULT_RULES) {
    const doc = rulesRef.doc()
    batch.set(doc, { ...rule, createdAt: FieldValue.serverTimestamp() })
    created.push({ ...rule, id: doc.id })
  }

  await batch.commit()
  return created
}

export async function saveRule(id: string | null, data: Partial<AlertRule>): Promise<string> {
  const doc = id ? rulesRef.doc(id) : rulesRef.doc()
  await doc.set(
    { ...data, ...(id ? {} : { createdAt: FieldValue.serverTimestamp() }) },
    { merge: true }
  )
  return doc.id
}

export async function deleteRule(id: string) {
  await rulesRef.doc(id).delete()
}

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
