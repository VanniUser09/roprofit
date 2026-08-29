import { Calculator } from "lucide-react"
import { useState } from "react"
import { useSearchParams } from "react-router-dom"

import { PanelError, PanelLoading, Tile, TileGrid } from "@/components/admin/primitives"
import { Input } from "@/components/ui/input"
import { useApiPost, useDebounced } from "@/hooks/use-api"
import { brl, pct, robux, type Capacity, type Simulation } from "@/lib/market"
import { cn } from "@/lib/utils"

type Response = { simulation: Simulation | null; capacity: Capacity | null }

/**
 * Simulador de operação.
 *
 * Todos os parâmetros são editáveis — nenhum valor fica cravado. Os defaults
 * refletem os números que a operação usa hoje, mas mudam quando o mercado muda.
 */
function Simulator() {
  const [searchParams] = useSearchParams()
  const assetId = searchParams.get("assetId")

  const [form, setForm] = useState({
    grossRobux: 14_300,
    capitalBRL: 3_500,
    buyPricePer1k: 17,
    sellPricePer1k: 39,
    robloxFeePct: 30,
    robuxLimitPerAccount: 10_000,
    extraCostsBRL: 0,
  })

  const debounced = useDebounced(form, 300)

  const { data, loading, error, reload } = useApiPost<Response>("/admin/market/simulate", {
    // Com assetId na URL, o preço corrente do item vira a entrada.
    ...(assetId ? { assetId: Number(assetId) } : { grossRobux: debounced.grossRobux }),
    capitalBRL: debounced.capitalBRL,
    params: {
      buyPricePer1k: debounced.buyPricePer1k,
      sellPricePer1k: debounced.sellPricePer1k,
      robloxFeePct: debounced.robloxFeePct / 100,
      robuxLimitPerAccount: debounced.robuxLimitPerAccount,
      extraCostsBRL: debounced.extraCostsBRL,
    },
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const s = data?.simulation
  const c = data?.capacity

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Calculator className="size-5 text-primary" />
          Simulador de operação
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {assetId
            ? `Usando o preço de mercado do item ${assetId}.`
            : "Compra do Limited, revenda no Marketplace, venda dos Robux líquidos."}
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        {!assetId ? (
          <Field label="Valor do Limited" hint="Robux brutos">
            <Input
              type="number"
              value={form.grossRobux}
              onChange={(e) => set("grossRobux", Number(e.target.value) || 0)}
            />
          </Field>
        ) : null}
        <Field label="Capital disponível" hint="R$">
          <Input
            type="number"
            value={form.capitalBRL}
            onChange={(e) => set("capitalBRL", Number(e.target.value) || 0)}
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
        <Field label="Custos adicionais" hint="R$ por operação">
          <Input
            type="number"
            value={form.extraCostsBRL}
            onChange={(e) => set("extraCostsBRL", Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      {loading && !data ? <PanelLoading label="Calculando..." /> : null}
      {error ? <PanelError message={error} onRetry={reload} /> : null}

      {s ? (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight">Fluxo da operação</h2>

            <ol className="flex flex-col gap-0">
              <Step
                label="Limited comprado"
                value={`${robux(s.grossRobux)} Robux`}
                detail={`custo de ${brl(s.costBRL)} a ${brl(s.params.buyPricePer1k)}/1k`}
              />
              <Step
                label={`Taxa da Roblox (${pct(s.params.robloxFeePct, 0)})`}
                value={`− ${robux(s.feeRobux)} Robux`}
                tone="bad"
              />
              <Step
                label="Robux líquidos recebidos"
                value={`${robux(s.netRobux)} Robux`}
                detail={`${s.accountsNeeded} conta(s) para movimentar no mês`}
              />
              <Step
                label="Venda dos Robux"
                value={brl(s.revenueBRL)}
                detail={`a ${brl(s.params.sellPricePer1k)}/1k`}
                tone="good"
              />
              {s.extraCostsBRL > 0 ? (
                <Step label="Custos adicionais" value={`− ${brl(s.extraCostsBRL)}`} tone="bad" />
              ) : null}
              <Step
                label="Lucro estimado"
                value={brl(s.profitBRL)}
                tone={s.profitBRL > 0 ? "good" : "bad"}
                emphasis
              />
            </ol>
          </section>

          <TileGrid>
            <Tile label="ROI" value={pct(s.roi, 1)} tone={(s.roi ?? 0) > 0 ? "good" : "bad"} />
            <Tile label="Margem" value={pct(s.margin, 1)} />
            <Tile label="Lucro por 1k" value={brl(s.profitPer1kBRL)} />
            <Tile label="Capital necessário" value={brl(s.capitalRequiredBRL)} />
            <Tile
              label="Preço máximo de compra"
              value={`${brl(s.breakEvenBuyPricePer1k)}/1k`}
              hint="acima disso a operação não empata"
              tone="warn"
            />
            <Tile label="Contas necessárias" value={String(s.accountsNeeded)} hint="limite mensal por conta" />
            {c ? (
              <>
                <Tile
                  label="Lotes no capital"
                  value={String(c.batchesAffordable)}
                  hint={`de ${robux(c.batchTargetGrossRobux)} Robux cada`}
                />
                <Tile
                  label="Lucro com o capital"
                  value={brl(c.projectedProfitBRL)}
                  hint={`${robux(c.affordableGrossRobux)} Robux · ${c.accountsNeeded} contas`}
                  tone="good"
                />
              </>
            ) : null}
          </TileGrid>
        </>
      ) : null}
    </div>
  )
}

/** Linha do fluxo, com conector vertical — deixa a sequência legível de relance. */
function Step({
  label,
  value,
  detail,
  tone = "neutral",
  emphasis,
}: {
  label: string
  value: string
  detail?: string
  tone?: "neutral" | "good" | "bad"
  emphasis?: boolean
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-l-2 border-border py-2 pl-4",
        emphasis && "mt-1 border-l-primary"
      )}
    >
      <span className={cn("text-sm", emphasis ? "font-medium" : "text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "ml-auto tabular-nums",
          emphasis ? "text-lg font-semibold" : "text-sm font-medium",
          tone === "good" && "text-primary",
          tone === "bad" && "text-red-400"
        )}
      >
        {value}
      </span>
      {detail ? <span className="w-full text-xs text-muted-foreground">{detail}</span> : null}
    </li>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

export { Simulator }
