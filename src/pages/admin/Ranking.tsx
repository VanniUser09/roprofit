import { Flame } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import {
  ItemCell,
  PanelEmpty,
  PanelError,
  PanelLoading,
  ScoreBar,
  SignedPct,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/primitives"
import { useApiGet } from "@/hooks/use-api"
import { decimal, hoursLabel, robux, type ItemMetrics } from "@/lib/market"

/**
 * Ranking dos Limiteds mais líquidos.
 *
 * Ordenado pelo Liquidity Score no servidor (índice composto em item_metrics).
 * A coluna "Intervalo" mostra a mediana do tempo entre vendas — o número que
 * responde diretamente "quanto tempo meu capital fica parado".
 */
function Ranking() {
  const [limit, setLimit] = useState(50)
  const { data, loading, error, reload } = useApiGet<{ items: ItemMetrics[] }>(
    "/admin/market/ranking",
    { limit },
    { refreshMs: 120_000 }
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Flame className="size-5 text-primary" />
            Limiteds mais líquidos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Atualizado a cada 15 minutos pelo Liquidity Engine.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-border p-1">
          {[25, 50, 100, 250].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLimit(option)}
              className={
                option === limit
                  ? "rounded-lg bg-primary/12 px-3 py-1 text-sm font-medium text-primary"
                  : "rounded-lg px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? <PanelLoading /> : null}
      {error ? <PanelError message={error} onRetry={reload} /> : null}

      {data && data.items.length === 0 ? (
        <PanelEmpty
          title="Nenhum item pontuado ainda"
          description="O ranking aparece assim que os coletores acumularem histórico. O backfill de mapeamento leva cerca de duas horas na primeira execução."
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th className="w-10" align="right">
                #
              </Th>
              <Th>Item</Th>
              <Th align="right">RAP</Th>
              <Th align="right">Preço</Th>
              <Th align="right">vs RAP</Th>
              <Th align="right">Vendas/dia</Th>
              <Th align="right">Intervalo</Th>
              <Th align="right">Volatilidade</Th>
              <Th align="right">Score</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={item.assetId} className="transition-colors hover:bg-card/60">
                <Td align="right" numeric className="text-muted-foreground">
                  {index + 1}
                </Td>
                <Td>
                  <Link to={`/admin/mercado/item/${item.assetId}`} className="block">
                    <ItemCell item={item} />
                  </Link>
                </Td>
                <Td align="right" numeric>
                  {robux(item.rap)}
                </Td>
                <Td align="right" numeric>
                  {robux(item.lowestResalePrice)}
                </Td>
                <Td align="right" numeric>
                  <SignedPct value={item.rapDiscountPct} invert />
                </Td>
                <Td align="right" numeric>
                  {decimal(item.salesPerDay7d, 1)}
                </Td>
                <Td align="right" numeric className="text-muted-foreground">
                  {/* Mediana do tempo entre vendas — vem dos nossos snapshots
                      do book, não da Roblox, que só publica volume diário. */}
                  {hoursLabel(item.medianGapHours)}
                </Td>
                <Td align="right" numeric>
                  {item.volatility30d === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={item.volatility30d > 0.2 ? "text-amber-400" : undefined}>
                      {decimal(item.volatility30d * 100, 1)}%
                    </span>
                  )}
                </Td>
                <Td align="right">
                  <div className="flex justify-end">
                    <ScoreBar score={item.liquidityScore} confidence={item.confidence} />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      ) : null}
    </div>
  )
}

export { Ranking }
