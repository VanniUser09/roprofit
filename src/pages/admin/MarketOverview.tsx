import { AlertTriangle, ArrowRight, CheckCircle2, Clock } from "lucide-react"
import { Link } from "react-router-dom"

import {
  ItemCell,
  PanelError,
  PanelLoading,
  ScoreBar,
  SignedPct,
  Td,
  Th,
  TableWrap,
  Tile,
  TileGrid,
} from "@/components/admin/primitives"
import { useApiGet } from "@/hooks/use-api"
import { decimal, pct, robux, robuxShort, type ItemMetrics, type Overview } from "@/lib/market"
import { cn } from "@/lib/utils"

/**
 * Visão geral do mercado.
 *
 * Ordem deliberada: primeiro o estado da coleta, depois os agregados, depois as
 * oportunidades. O estado da coleta vem antes porque o modo de falha mais
 * perigoso deste painel não é o erro visível — é o coletor parado e os números
 * continuarem parecendo atuais.
 */
function MarketOverview() {
  const { data, loading, error, reload } = useApiGet<Overview>("/admin/market/overview", undefined, {
    refreshMs: 120_000,
  })

  if (loading && !data) return <PanelLoading />
  if (error) return <PanelError message={error} onRetry={reload} />
  if (!data) return null

  const { totals, deltas, counts } = data

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Visão geral do mercado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.mapped.toLocaleString("pt-BR")} de {counts.total.toLocaleString("pt-BR")} Limiteds
          mapeados · {counts.tierA} em coleta de alta cadência
        </p>
      </div>

      <HealthBanner health={data.collectorHealth} confidence={totals.avgConfidence} />

      <TileGrid>
        <Tile
          label="Limiteds monitorados"
          value={totals.trackedItems.toLocaleString("pt-BR")}
          hint={`${counts.tierA} no Tier A`}
        />
        <Tile
          label="Vendas em 24h"
          value={robuxShort(totals.sales24h)}
          delta={deltas.sales24h}
          hint="unidades"
        />
        <Tile
          label="Volume em 24h"
          value={robuxShort(totals.volume24hRobux)}
          delta={deltas.volume24hRobux}
          hint="Robux"
        />
        <Tile
          label="RAP médio"
          value={robuxShort(totals.avgRap)}
          delta={deltas.avgRap}
          hint="Robux"
        />
        <Tile
          label="Alta liquidez"
          value={totals.highLiquidityItems.toLocaleString("pt-BR")}
          hint="score 70 ou mais"
          tone="good"
        />
        <Tile
          label="Em alta"
          value={totals.risingItems.toLocaleString("pt-BR")}
          hint="preço subindo na semana"
          tone="good"
        />
        <Tile
          label="Em queda"
          value={totals.fallingItems.toLocaleString("pt-BR")}
          hint="preço caindo na semana"
          tone="bad"
        />
        <Tile
          label="Score médio"
          value={decimal(totals.avgLiquidityScore, 0)}
          hint={
            totals.avgConfidence !== null
              ? `confiança ${pct(totals.avgConfidence, 0)}`
              : "sem histórico"
          }
        />
      </TileGrid>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Melhores oportunidades agora</h2>
            <p className="text-xs text-muted-foreground">
              Alta liquidez na faixa de preço da operação, sem itens projected.
            </p>
          </div>
          <Link
            to="/admin/mercado/oportunidades"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todas
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {data.topOpportunities.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum item passou nos critérios ainda. Os coletores precisam de alguns dias de
            histórico para o score ficar confiável.
          </p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th align="right">Preço</Th>
                <Th align="right">RAP</Th>
                <Th align="right">vs RAP</Th>
                <Th align="right">Vendas/dia</Th>
                <Th align="right">Score</Th>
              </tr>
            </thead>
            <tbody>
              {data.topOpportunities.map((item) => (
                <ItemRow key={item.assetId} item={item} />
              ))}
            </tbody>
          </TableWrap>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <MoversCard title="Maiores altas" subtitle="Preço médio da semana" items={data.biggestGains} />
        <MoversCard title="Maiores quedas" subtitle="Preço médio da semana" items={data.biggestDrops} />
      </div>
    </div>
  )
}

function ItemRow({ item }: { item: ItemMetrics }) {
  return (
    <tr className="transition-colors hover:bg-card/60">
      <Td>
        <Link to={`/admin/mercado/item/${item.assetId}`} className="block">
          <ItemCell item={item} />
        </Link>
      </Td>
      <Td align="right" numeric>
        {robux(item.lowestResalePrice)}
      </Td>
      <Td align="right" numeric>
        {robux(item.rap)}
      </Td>
      <Td align="right" numeric>
        <SignedPct value={item.rapDiscountPct} invert />
      </Td>
      <Td align="right" numeric>
        {decimal(item.salesPerDay7d, 1)}
      </Td>
      <Td align="right">
        <div className="flex justify-end">
          <ScoreBar score={item.liquidityScore} confidence={item.confidence} />
        </div>
      </Td>
    </tr>
  )
}

function MoversCard({
  title,
  subtitle,
  items,
}: {
  title: string
  subtitle: string
  items: ItemMetrics[]
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Sem movimento relevante.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {items.map((item) => (
            <li key={item.assetId}>
              <Link
                to={`/admin/mercado/item/${item.assetId}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-card"
              >
                <div className="min-w-0 flex-1">
                  <ItemCell item={item} />
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    <SignedPct value={item.priceTrend7d} />
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {robux(item.lowestResalePrice)} Robux
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Estado da coleta, no topo.
 *
 * Dois avisos distintos: coletor quebrado (dado velho passando por atual) e
 * confiança baixa (histórico próprio ainda curto). O segundo não é um erro —
 * é o sistema sendo honesto sobre o que ainda não sabe.
 */
function HealthBanner({
  health,
  confidence,
}: {
  health: Overview["collectorHealth"]
  confidence: number | null
}) {
  if (health.status === "ok" && (confidence === null || confidence >= 0.8)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">{health.message}</span>
      </div>
    )
  }

  const broken = health.status === "error" || health.status === "stale"

  return (
    <div className="flex flex-col gap-2">
      {broken ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
            health.status === "error"
              ? "border-red-500/25 bg-red-500/5"
              : "border-amber-500/25 bg-amber-500/5"
          )}
        >
          <AlertTriangle
            className={cn(
              "size-4 shrink-0",
              health.status === "error" ? "text-red-400" : "text-amber-400"
            )}
          />
          <span className="flex-1 text-muted-foreground">{health.message}</span>
          <Link to="/admin/mercado/coletores" className="text-sm font-medium text-primary hover:underline">
            Ver coleta
          </Link>
        </div>
      ) : null}

      {confidence !== null && confidence < 0.8 ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Confiança média em {pct(confidence, 0)} — os scores estão reduzidos de propósito
            enquanto o histórico próprio se forma. Estabiliza em duas semanas de coleta.
          </span>
        </div>
      ) : null}
    </div>
  )
}

export { MarketOverview }
