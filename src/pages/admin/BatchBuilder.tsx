import { Boxes, Info } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { PanelEmpty, PanelError, PanelLoading, ScoreBar, Thumb } from "@/components/admin/primitives"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useApiPost, useDebounced } from "@/hooks/use-api"
import { brl, decimal, pct, robux, type Batch } from "@/lib/market"
import { cn } from "@/lib/utils"

type Response = {
  target: number
  batches: Batch[]
  candidatesConsidered: number
  note: string | null
}

/**
 * Montador de lotes.
 *
 * Resolve o problema central da operação: não depender de achar um Limited de
 * exatamente 14.286 Robux. Combina itens menores que somam perto do alvo,
 * priorizando liquidez.
 */
function BatchBuilder() {
  const [form, setForm] = useState({
    targetNetRobux: 10_000,
    tolerancePct: 3,
    minItems: 4,
    maxItems: 8,
    maxCapitalBRL: "" as number | "",
    buyPricePer1k: 17,
    sellPricePer1k: 39,
    robloxFeePct: 30,
    robuxLimitPerAccount: 10_000,
  })

  const debounced = useDebounced(form, 400)

  const { data, loading, error, reload } = useApiPost<Response>("/admin/market/batches", {
    targetNetRobux: debounced.targetNetRobux,
    tolerancePct: debounced.tolerancePct / 100,
    minItems: debounced.minItems,
    maxItems: debounced.maxItems,
    maxCapitalBRL: debounced.maxCapitalBRL === "" ? undefined : debounced.maxCapitalBRL,
    params: {
      buyPricePer1k: debounced.buyPricePer1k,
      sellPricePer1k: debounced.sellPricePer1k,
      robloxFeePct: debounced.robloxFeePct / 100,
      robuxLimitPerAccount: debounced.robuxLimitPerAccount,
    },
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Boxes className="size-5 text-primary" />
          Montar lote
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Combina Limiteds menores até chegar perto do alvo de Robux líquidos, priorizando os que
          giram rápido.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Alvo em Robux líquidos" hint="depois da taxa da Roblox">
          <Input
            type="number"
            value={form.targetNetRobux}
            onChange={(e) => set("targetNetRobux", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Tolerância" hint="% em torno do alvo">
          <Input
            type="number"
            value={form.tolerancePct}
            onChange={(e) => set("tolerancePct", Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="Itens por lote" hint="mínimo e máximo">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={form.minItems}
              onChange={(e) => set("minItems", Number(e.target.value) || 1)}
            />
            <Input
              type="number"
              value={form.maxItems}
              onChange={(e) => set("maxItems", Number(e.target.value) || 1)}
            />
          </div>
        </Field>
        <Field label="Capital disponível" hint="R$ — opcional">
          <Input
            type="number"
            placeholder="sem limite"
            value={form.maxCapitalBRL}
            onChange={(e) => set("maxCapitalBRL", e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>

        <Field label="Compra" hint="R$ por 1k Robux">
          <Input
            type="number"
            value={form.buyPricePer1k}
            onChange={(e) => set("buyPricePer1k", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Venda" hint="R$ por 1k Robux">
          <Input
            type="number"
            value={form.sellPricePer1k}
            onChange={(e) => set("sellPricePer1k", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Taxa da Roblox" hint="%">
          <Input
            type="number"
            value={form.robloxFeePct}
            onChange={(e) => set("robloxFeePct", Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Limite por conta" hint="Robux por mês">
          <Input
            type="number"
            value={form.robuxLimitPerAccount}
            onChange={(e) => set("robuxLimitPerAccount", Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      {data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4 shrink-0" />
          Alvo bruto de {robux(data.target)} Robux · {data.candidatesConsidered} itens elegíveis ·{" "}
          {data.batches.length} combinação(ões)
        </p>
      ) : null}

      {loading && !data ? <PanelLoading label="Montando combinações..." /> : null}
      {error ? <PanelError message={error} onRetry={reload} /> : null}

      {data && data.batches.length === 0 ? (
        <PanelEmpty title="Nenhuma combinação encontrada" description={data.note ?? "Ajuste a tolerância ou a faixa de itens."} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {data?.batches.map((batch, index) => (
          <BatchCard key={index} batch={batch} rank={index + 1} target={data.target} />
        ))}
      </div>
    </div>
  )
}

function BatchCard({ batch, rank, target }: { batch: Batch; rank: number; target: number }) {
  const s = batch.simulation
  // Ineficiência de conta: sobra de limite contratado que o lote não usa.
  const wastesAccount = batch.accountEfficiency < 0.75

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-lg bg-primary/12 text-xs font-bold text-primary">
          {rank}
        </span>
        <span className="text-sm font-semibold tabular-nums">{robux(batch.grossRobux)} Robux</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            Math.abs(batch.grossRobux - target) / target < 0.01 ? "text-primary" : "text-muted-foreground"
          )}
        >
          {pct(batch.deviationPct, 2, true)} do alvo
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={s.accountsNeeded === 1 ? "default" : "outline"}>
            {s.accountsNeeded} conta{s.accountsNeeded === 1 ? "" : "s"}
          </Badge>
          <ScoreBar score={batch.quality} />
        </div>
      </div>

      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
        {batch.items.map((item) => (
          <li key={item.assetId}>
            <Link
              to={`/admin/mercado/item/${item.assetId}`}
              className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-background"
            >
              <Thumb url={item.thumbnailUrl} alt={item.name} size="size-8" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {decimal(item.salesPerDay7d, 1)}/dia
              </span>
              <span className="w-20 text-right text-sm font-medium tabular-nums">
                {robux(item.price)}
              </span>
              <span className="w-8 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {item.liquidityScore}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        <Stat label="Líquidos" value={`${robux(s.netRobux)}`} />
        <Stat label="Custo" value={brl(s.costBRL)} />
        <Stat label="Receita" value={brl(s.revenueBRL)} />
        <Stat label="Lucro" value={brl(s.profitBRL)} tone={s.profitBRL > 0 ? "good" : "bad"} />
        <Stat label="ROI" value={pct(s.roi, 1)} />
        <Stat label="Margem" value={pct(s.margin, 1)} />
        <Stat label="Lucro/1k" value={brl(s.profitPer1kBRL)} />
        <Stat label="Empata até" value={`${brl(s.breakEvenBuyPricePer1k)}/1k`} />
      </dl>

      {wastesAccount ? (
        <p className="text-xs text-amber-400/90">
          Usa {pct(batch.accountEfficiency, 0)} do limite de {s.accountsNeeded} conta(s) — sobra
          capacidade ociosa. Um lote um pouco maior aproveitaria melhor.
        </p>
      ) : null}
    </section>
  )
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: string
  tone?: "neutral" | "good" | "bad"
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          tone === "good" && "text-primary",
          tone === "bad" && "text-red-400"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {hint ? <span className="text-[10px] opacity-70">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

export { BatchBuilder }
