import { Bell, Check } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import {
  PanelEmpty,
  PanelError,
  PanelLoading,
  SeverityBadge,
  Thumb,
} from "@/components/admin/primitives"
import { apiPost, apiSend } from "@/lib/admin"
import { useApiGet } from "@/hooks/use-api"
import { decimal, pct, type Alert, type AlertRule } from "@/lib/market"
import { cn } from "@/lib/utils"

type Response = { alerts: Alert[]; rules: AlertRule[] }

const METRIC_LABELS: Record<string, string> = {
  liquidityScore: "Liquidity Score",
  salesPerDay7d: "Vendas por dia",
  rapDiscountPct: "Diferença vs RAP",
  volatility30d: "Volatilidade 30d",
  priceTrend7d: "Tendência de preço 7d",
  salesVolumeChange24h: "Variação de volume 24h",
}

/** Métricas guardadas como fração são exibidas em %. */
const AS_PERCENT = new Set([
  "rapDiscountPct",
  "volatility30d",
  "priceTrend7d",
  "salesVolumeChange24h",
])

function formatThreshold(metric: string, value: number) {
  return AS_PERCENT.has(metric) ? pct(value, 0, true) : decimal(value, 1)
}

function Alerts() {
  const { data, loading, error, reload } = useApiGet<Response>("/admin/market/alerts")
  const [busy, setBusy] = useState(false)

  const markAllRead = async () => {
    setBusy(true)
    try {
      await apiPost("/admin/market/alerts/read-all")
      reload()
    } finally {
      setBusy(false)
    }
  }

  const toggleRule = async (rule: AlertRule) => {
    await apiSend("PATCH", `/admin/market/alert-rules/${rule.id}`, { enabled: !rule.enabled })
    reload()
  }

  if (loading && !data) return <PanelLoading />
  if (error) return <PanelError message={error} onRetry={reload} />
  if (!data) return null

  const unread = data.alerts.filter((alert) => !alert.read).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Bell className="size-5 text-primary" />
            Alertas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unread > 0 ? `${unread} não lido(s)` : "Nenhum alerta pendente"} ·{" "}
            {data.rules.filter((r) => r.enabled).length} de {data.rules.length} regras ativas
          </p>
        </div>

        {unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-card disabled:opacity-50"
          >
            <Check className="size-3.5" />
            Marcar tudo como lido
          </button>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Regras</h2>
        <p className="text-xs text-muted-foreground">
          Cada regra só dispara para itens com confiança suficiente, e respeita um período de
          silêncio por item — alerta repetido vira ruído e ruído é ignorado.
        </p>

        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                aria-label={`${rule.enabled ? "Desativar" : "Ativar"} regra ${rule.label}`}
                onClick={() => toggleRule(rule)}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  rule.enabled ? "bg-primary" : "bg-border"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-4 rounded-full bg-background transition-transform",
                    rule.enabled ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", !rule.enabled && "text-muted-foreground")}>
                  {rule.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {METRIC_LABELS[rule.metric] ?? rule.metric}{" "}
                  {rule.operator === "gt" ? "acima de" : "abaixo de"}{" "}
                  {formatThreshold(rule.metric, rule.threshold)} · confiança mínima{" "}
                  {pct(rule.minConfidence, 0)} · silêncio de {rule.cooldownHours}h
                </p>
              </div>

              <SeverityBadge severity={rule.severity} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Disparos recentes</h2>

        {data.alerts.length === 0 ? (
          <PanelEmpty
            title="Nenhum alerta ainda"
            description="As regras são avaliadas a cada 15 minutos. Enquanto a confiança dos scores estiver baixa, poucos itens qualificam — isso é intencional."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {data.alerts.map((alert) => (
              <li key={alert.id} className={cn("bg-card", alert.read && "opacity-60")}>
                <Link
                  to={`/admin/mercado/item/${alert.assetId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-background"
                >
                  <Thumb url={alert.thumbnailUrl} alt={alert.itemName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.ruleLabel} · limiar {formatThreshold(alert.metric, alert.threshold)}
                    </p>
                  </div>
                  {!alert.read ? (
                    <span aria-label="Não lido" className="size-1.5 shrink-0 rounded-full bg-primary" />
                  ) : null}
                  <SeverityBadge severity={alert.severity} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export { Alerts }
