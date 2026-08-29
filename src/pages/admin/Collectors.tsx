import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react"

import {
  PanelError,
  PanelLoading,
  TableWrap,
  Td,
  Th,
  Tile,
  TileGrid,
} from "@/components/admin/primitives"
import { Badge } from "@/components/ui/badge"
import { useApiGet } from "@/hooks/use-api"
import { DASH, dataAge, decimal, pct, type CollectorHealth } from "@/lib/market"
import { cn } from "@/lib/utils"

type Run = {
  collector: string
  startedAt: { _seconds?: number } | string | null
  finishedAt: { _seconds?: number } | string | null
  durationMs: number | null
  status: "running" | "ok" | "partial" | "error"
  itemsProcessed: number
  itemsWritten: number
  requestCount: number
  errors: { message: string; count: number }[]
  quotaRemaining: number | null
  notes: string | null
}

type Response = {
  runs: Record<string, Run>
  counts: { total: number; mapped: number; tierA: number }
  health: CollectorHealth
  mappingProgress: number
}

/** O que cada coletor faz e por que roda nessa cadência. */
const DESCRIPTIONS: Record<string, string> = {
  collectRolimons: "Catálogo, Value e Demand · a fonte limita a 1 req/min",
  collectMarketplaceItems: "Preço e estoque de todos · 26 requisições cobrem tudo",
  collectResellers: "Book de ofertas do Tier A · a janela intradiária",
  collectDailySales: "Séries diárias · a fonte é diária, buscar mais não adianta",
  backfillCollectibleIds: "Mapeamento de IDs · fila priorizada pela faixa da operação",
  computeMetrics: "Analytics + Liquidity Engine",
  rebuildTiers: "Reavalia quem entra na coleta de alta cadência",
  evaluateAlerts: "Aplica as regras de alerta",
}

const ORDER = Object.keys(DESCRIPTIONS)

/**
 * Saúde da coleta.
 *
 * Esta página não estava no pedido original, mas é a que impede o modo de falha
 * mais perigoso do sistema: um endpoint da Roblox quebrar e o painel continuar
 * exibindo números velhos com cara de atuais — exatamente o que acontece com
 * quem usa o endpoint legado de economy sem checar a data do dado.
 */
function Collectors() {
  const { data, loading, error, reload } = useApiGet<Response>(
    "/admin/market/collectors",
    undefined,
    { refreshMs: 60_000 }
  )

  if (loading && !data) return <PanelLoading />
  if (error) return <PanelError message={error} onRetry={reload} />
  if (!data) return null

  const runs = ORDER.map((name) => [name, data.runs[name]] as const)
  const totalRequests = Object.values(data.runs).reduce((sum, run) => sum + (run?.requestCount ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Activity className="size-5 text-primary" />
          Saúde da coleta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Última execução de cada coletor, cota consumida e cobertura do mapeamento.
        </p>
      </div>

      <HealthLine health={data.health} />

      <TileGrid>
        <Tile
          label="Limiteds no catálogo"
          value={data.counts.total.toLocaleString("pt-BR")}
          hint="descobertos pelo Rolimon's"
        />
        <Tile
          label="Mapeados"
          value={data.counts.mapped.toLocaleString("pt-BR")}
          hint={`${pct(data.mappingProgress, 0)} com CollectibleItemId`}
          tone={data.mappingProgress > 0.9 ? "good" : "warn"}
        />
        <Tile label="Tier A" value={String(data.counts.tierA)} hint="coleta a cada 15 min" />
        <Tile
          label="Requisições no último ciclo"
          value={totalRequests.toLocaleString("pt-BR")}
          hint="de ~24.400/dia projetadas"
        />
      </TileGrid>

      {data.mappingProgress < 0.95 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Backfill de mapeamento em andamento</span>
            <span className="tabular-nums text-muted-foreground">{pct(data.mappingProgress, 1)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${Math.max(1, data.mappingProgress * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Sem o CollectibleItemId não há acesso ao mercado atual de um item. A fila prioriza a
            faixa de preço da operação, então os itens relevantes ficam prontos primeiro.
          </p>
        </div>
      ) : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Coletor</Th>
            <Th align="center">Status</Th>
            <Th align="right">Última execução</Th>
            <Th align="right">Duração</Th>
            <Th align="right">Processados</Th>
            <Th align="right">Gravados</Th>
            <Th align="right">Requisições</Th>
            <Th align="right">Cota</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map(([name, run]) => (
            <tr key={name} className="align-top transition-colors hover:bg-card/60">
              <Td>
                <p className="font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{DESCRIPTIONS[name]}</p>
                {run?.notes ? (
                  <p className="mt-1 text-xs text-muted-foreground/80">{run.notes}</p>
                ) : null}
                {run?.errors?.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {run.errors.slice(0, 3).map((err) => (
                      <li key={err.message} className="text-xs text-red-400/90">
                        {err.count}× {err.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Td>
              <Td align="center">
                <StatusBadge status={run?.status} />
              </Td>
              <Td align="right" numeric className="text-muted-foreground">
                {run ? dataAge(hoursSince(run.finishedAt ?? run.startedAt)) : "nunca"}
              </Td>
              <Td align="right" numeric className="text-muted-foreground">
                {run?.durationMs != null ? `${decimal(run.durationMs / 1000, 1)}s` : DASH}
              </Td>
              <Td align="right" numeric>
                {run?.itemsProcessed?.toLocaleString("pt-BR") ?? DASH}
              </Td>
              <Td align="right" numeric>
                {run?.itemsWritten?.toLocaleString("pt-BR") ?? DASH}
              </Td>
              <Td align="right" numeric className="text-muted-foreground">
                {run?.requestCount?.toLocaleString("pt-BR") ?? DASH}
              </Td>
              <Td align="right" numeric>
                {run?.quotaRemaining == null ? (
                  <span className="text-muted-foreground">{DASH}</span>
                ) : (
                  <span className={run.quotaRemaining < 10 ? "text-amber-400" : "text-muted-foreground"}>
                    {run.quotaRemaining}
                  </span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  )
}

function StatusBadge({ status }: { status?: Run["status"] }) {
  if (!status) return <Badge variant="outline">nunca rodou</Badge>

  const map = {
    ok: { variant: "default" as const, label: "ok" },
    // "partial" é o caso mais comum de verdade: funcionou para 190 de 200 itens.
    partial: { variant: "warning" as const, label: "parcial" },
    error: { variant: "danger" as const, label: "erro" },
    running: { variant: "info" as const, label: "rodando" },
  }[status]

  return <Badge variant={map.variant}>{map.label}</Badge>
}

function HealthLine({ health }: { health: CollectorHealth }) {
  const config = {
    ok: { Icon: CheckCircle2, className: "border-primary/25 bg-primary/5", iconClass: "text-primary" },
    stale: { Icon: Clock, className: "border-amber-500/25 bg-amber-500/5", iconClass: "text-amber-400" },
    error: { Icon: AlertTriangle, className: "border-red-500/25 bg-red-500/5", iconClass: "text-red-400" },
    unknown: { Icon: Clock, className: "border-border bg-card", iconClass: "text-muted-foreground" },
  }[health.status]

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm", config.className)}>
      <config.Icon className={cn("size-4 shrink-0", config.iconClass)} />
      <span className="text-muted-foreground">{health.message}</span>
    </div>
  )
}

/** Timestamps do Firestore chegam serializados como { _seconds }. */
function hoursSince(value: Run["startedAt"]): number | null {
  if (!value) return null
  const millis =
    typeof value === "string"
      ? Date.parse(value)
      : typeof value._seconds === "number"
        ? value._seconds * 1000
        : NaN
  if (!Number.isFinite(millis)) return null
  return (Date.now() - millis) / 3_600_000
}

export { Collectors }
