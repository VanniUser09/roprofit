import { ArrowLeft, Calculator, ExternalLink } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router-dom"

import { BookChart, PriceChart, RapChart, VolumeChart } from "@/components/admin/charts"
import {
  PanelEmpty,
  PanelError,
  PanelLoading,
  ScoreBar,
  SignedPct,
  Thumb,
  Tile,
  TileGrid,
} from "@/components/admin/primitives"
import { Badge } from "@/components/ui/badge"
import { useApiGet } from "@/hooks/use-api"
import {
  COMPONENT_LABELS,
  DASH,
  DEMAND_LABELS,
  TREND_LABELS,
  dataAge,
  decimal,
  hoursLabel,
  pct,
  robux,
  type ItemMetrics,
  type LiquidityComponents,
} from "@/lib/market"
import { cn } from "@/lib/utils"

type Detail = {
  metrics: ItemMetrics | null
  limited: { assetId: number; collectibleItemId: string | null; totalQuantity: number | null } | null
  explanation: string | null
  series: {
    daily: { date: string; avgPrice: number | null; volume: number | null }[]
    snapshots: {
      t: string | null
      rap: number | null
      lowestResalePrice: number | null
      resellerCount: number | null
      bookDepth10: number | null
      spreadPct: number | null
    }[]
  }
}

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
]

function ItemDetail() {
  const { assetId } = useParams<{ assetId: string }>()
  const [range, setRange] = useState(30)

  const { data, loading, error, reload } = useApiGet<Detail>(
    assetId ? `/admin/market/item/${assetId}` : null,
    { range }
  )

  if (loading && !data) return <PanelLoading />
  if (error) return <PanelError message={error} onRetry={reload} />
  if (!data) return null

  const m = data.metrics

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/mercado/ranking"
        className="group inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        Voltar ao ranking
      </Link>

      <header className="flex flex-wrap items-start gap-4">
        <Thumb url={m?.thumbnailUrl ?? null} alt={m?.name ?? ""} size="size-16" />

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{m?.name ?? `Item ${assetId}`}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">ID {assetId}</span>
            {m?.acronym ? <span>· {m.acronym}</span> : null}
            {m?.tier === "A" ? (
              <Badge variant="default">coleta a cada 15 min</Badge>
            ) : (
              <Badge variant="outline">coleta padrão</Badge>
            )}
            {m?.projected ? <Badge variant="warning">projected</Badge> : null}
            {m?.dataAgeHours != null ? (
              <span className="text-xs">· dado de {dataAge(m.dataAgeHours)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/admin/mercado/simulador?assetId=${assetId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-card"
          >
            <Calculator className="size-4" />
            Simular
          </Link>
          <a
            href={`https://www.roblox.com/catalog/${assetId}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <ExternalLink className="size-4" />
            Roblox
          </a>
        </div>
      </header>

      {!m ? (
        <PanelEmpty
          title="Item ainda sem métricas"
          description="Este Limited está no catálogo mas ainda não passou por um ciclo completo de coleta."
        />
      ) : (
        <>
          <ScoreCard metrics={m} explanation={data.explanation} />

          <TileGrid>
            <Tile label="Preço atual" value={robux(m.lowestResalePrice)} hint="menor oferta do book" />
            <Tile label="RAP" value={robux(m.rap)} hint="média recente das vendas" />
            <Tile
              label="vs RAP"
              value={<SignedPct value={m.rapDiscountPct} invert />}
              hint={m.rapDiscountPct !== null && m.rapDiscountPct < 0 ? "abaixo do RAP" : "acima do RAP"}
            />
            <Tile
              label="Value"
              value={robux(m.value)}
              hint={m.demand !== null ? `demanda ${DEMAND_LABELS[m.demand].toLowerCase()}` : "Rolimon's"}
            />

            <Tile label="Vendas/hora" value={decimal(m.salesPerHour, 2)} hint="média dos últimos 7 dias" />
            <Tile label="Vendas/dia" value={decimal(m.salesPerDay7d, 1)} hint="últimos 7 dias" />
            <Tile label="Vendas/semana" value={decimal(m.salesTotal7d, 0)} hint="unidades" />
            <Tile
              label="Intervalo entre vendas"
              value={hoursLabel(m.medianGapHours)}
              hint={
                m.p25GapHours !== null && m.p75GapHours !== null
                  ? `p25 ${hoursLabel(m.p25GapHours)} · p75 ${hoursLabel(m.p75GapHours)}`
                  : "requer mais histórico próprio"
              }
            />

            <Tile label="Preço médio 7d" value={robux(m.avgPrice7d)} hint="vendas efetivadas" />
            <Tile label="Menor preço 7d" value={robux(m.minPrice7d)} />
            <Tile label="Maior preço 7d" value={robux(m.maxPrice7d)} />
            <Tile
              label="Volatilidade 30d"
              value={m.volatility30d === null ? DASH : `${decimal(m.volatility30d * 100, 1)}%`}
              tone={m.volatility30d !== null && m.volatility30d > 0.2 ? "warn" : "neutral"}
              hint="coeficiente de variação"
            />

            <Tile
              label="Ofertas no book"
              value={m.resellerCount === null ? DASH : String(m.resellerCount)}
              hint={m.bookDepth10 !== null ? `${m.bookDepth10} até +10% da mínima` : undefined}
            />
            <Tile
              label="Spread"
              value={m.spreadPct === null ? DASH : `${decimal(m.spreadPct * 100, 2)}%`}
              hint="da 1ª para a 2ª oferta"
            />
            <Tile label="Em circulação" value={robux(m.assetStock)} hint="cópias existentes" />
            <Tile
              label="Tendência"
              value={m.trend !== null ? TREND_LABELS[m.trend] : DASH}
              hint={m.priceTrend7d !== null ? <SignedPct value={m.priceTrend7d} /> : "semana a semana"}
            />
          </TileGrid>

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold tracking-tight">Histórico</h2>
            <div className="flex items-center gap-1 rounded-xl border border-border p-1">
              {RANGES.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  onClick={() => setRange(option.days)}
                  className={
                    option.days === range
                      ? "rounded-lg bg-primary/12 px-3 py-1 text-sm font-medium text-primary"
                      : "rounded-lg px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PriceChart data={data.series.daily} />
            <VolumeChart data={data.series.daily} />
            <RapChart data={data.series.snapshots} />
            <BookChart data={data.series.snapshots} />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Score decomposto.
 *
 * Um número de 0 a 100 sozinho não é acionável — o admin precisa saber se o 62
 * veio de pouca velocidade ou de spread ruim, porque as duas coisas levam a
 * decisões diferentes.
 */
function ScoreCard({ metrics, explanation }: { metrics: ItemMetrics; explanation: string | null }) {
  const components = Object.entries(metrics.components) as [keyof LiquidityComponents, number][]

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 lg:flex-row lg:items-center lg:gap-8">
      <div className="flex shrink-0 items-center gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Liquidity Score
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
            {metrics.liquidityScore}
          </p>
        </div>
        <ScoreBar score={metrics.liquidityScore} confidence={metrics.confidence} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {components.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">
                {COMPONENT_LABELS[key]}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-background">
                <div
                  className={cn(
                    "h-full rounded-full",
                    value >= 70 ? "bg-primary" : value >= 40 ? "bg-amber-400" : "bg-red-400"
                  )}
                  style={{ width: `${Math.max(2, value)}%` }}
                />
              </div>
              <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(value)}
              </span>
            </div>
          ))}
        </div>

        {explanation ? (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{explanation}</p>
        ) : null}

        {metrics.confidence < 1 ? (
          <p className="mt-1 text-xs text-amber-400/90">
            Score reduzido de propósito: {metrics.historyDays} dia(s) de histórico próprio de 14
            necessários. Confiança em {pct(metrics.confidence, 0)}.
          </p>
        ) : null}
      </div>
    </section>
  )
}

export { ItemDetail }
