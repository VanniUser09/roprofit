import { Radar, RotateCcw, Search } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useApiPost, useDebounced } from "@/hooks/use-api"
import {
  DEMAND_LABELS,
  decimal,
  robux,
  type ItemMetrics,
} from "@/lib/market"
import { cn } from "@/lib/utils"

type Filters = {
  priceMin?: number
  priceMax?: number
  salesPerDayMin?: number
  liquidityScoreMin?: number
  volatilityMax?: number
  rapDiscountMax?: number
  demandMin?: number
  excludeProjected?: boolean
  bookDepthMin?: number
  search?: string
}

type Preset = { id: string; label: string; description: string; filters: Filters }

type Response = {
  items: ItemMetrics[]
  total: number
  universe: number
  presets: Preset[]
}

type SortField =
  | "liquidityScore"
  | "salesPerDay7d"
  | "lowestResalePrice"
  | "rapDiscountPct"
  | "volatility30d"

/**
 * Busca de oportunidades.
 *
 * Os filtros rodam em memória no servidor sobre as ~2.500 métricas, o que
 * permite combinar quantas faixas quiser — o Firestore não faria isso numa
 * query só. O custo de leitura é fixo e o resultado sai atrás de cache de 60s.
 */
function Opportunities() {
  const [filters, setFilters] = useState<Filters>({ excludeProjected: true })
  const [sort, setSort] = useState<SortField>("liquidityScore")
  const [direction, setDirection] = useState<"asc" | "desc">("desc")

  // Sem debounce, digitar "sinister" dispara oito POSTs.
  const debounced = useDebounced(filters, 350)

  const { data, loading, error, reload } = useApiPost<Response>("/admin/market/opportunities", {
    filters: debounced,
    sort,
    direction,
    limit: 200,
  })

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }))

  const toggleSort = (field: SortField) => {
    if (field === sort) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"))
      return
    }
    setSort(field)
    // Preço e volatilidade fazem mais sentido do menor para o maior; os demais
    // o contrário. Sem isto, cada troca de coluna exige um segundo clique.
    setDirection(field === "lowestResalePrice" || field === "volatility30d" ? "asc" : "desc")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Radar className="size-5 text-primary" />
            Oportunidades
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? `${data.total.toLocaleString("pt-BR")} de ${data.universe.toLocaleString("pt-BR")} Limiteds passam nos critérios`
              : "Combine critérios para encontrar candidatos."}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setFilters({ excludeProjected: true })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Limpar
        </button>
      </div>

      {data?.presets ? (
        <div className="flex flex-wrap gap-2">
          {data.presets.slice(0, 3).map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => setFilters({ ...preset.filters })}
              className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}

      <FilterPanel filters={filters} onChange={set} />

      {loading && !data ? <PanelLoading label="Filtrando..." /> : null}
      {error ? <PanelError message={error} onRetry={reload} /> : null}

      {data && data.items.length === 0 ? (
        <PanelEmpty
          title="Nenhum item passou nos critérios"
          description={
            data.universe === 0
              ? "Ainda não há métricas calculadas. Os coletores precisam de algumas horas para o primeiro ciclo completo."
              : "Afrouxe algum filtro — score mínimo e volatilidade máxima costumam ser os mais restritivos."
          }
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <TableWrap>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th align="right" onClick={() => toggleSort("lowestResalePrice")} active={sort === "lowestResalePrice"} direction={direction}>
                Preço
              </Th>
              <Th align="right">RAP</Th>
              <Th align="right" onClick={() => toggleSort("rapDiscountPct")} active={sort === "rapDiscountPct"} direction={direction}>
                vs RAP
              </Th>
              <Th align="right" onClick={() => toggleSort("salesPerDay7d")} active={sort === "salesPerDay7d"} direction={direction}>
                Vendas/dia
              </Th>
              <Th align="right" onClick={() => toggleSort("volatility30d")} active={sort === "volatility30d"} direction={direction}>
                Volatilidade
              </Th>
              <Th align="center">Demanda</Th>
              <Th align="right">Book</Th>
              <Th align="right" onClick={() => toggleSort("liquidityScore")} active={sort === "liquidityScore"} direction={direction}>
                Score
              </Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.assetId} className="transition-colors hover:bg-card/60">
                <Td>
                  <Link to={`/admin/mercado/item/${item.assetId}`} className="block">
                    <ItemCell item={item} />
                  </Link>
                </Td>
                <Td align="right" numeric>
                  {robux(item.lowestResalePrice)}
                </Td>
                <Td align="right" numeric className="text-muted-foreground">
                  {robux(item.rap)}
                </Td>
                <Td align="right" numeric>
                  <SignedPct value={item.rapDiscountPct} invert />
                </Td>
                <Td align="right" numeric>
                  {decimal(item.salesPerDay7d, 1)}
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
                <Td align="center">
                  {item.demand === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge variant={item.demand >= 3 ? "default" : "outline"}>
                      {DEMAND_LABELS[item.demand]}
                    </Badge>
                  )}
                </Td>
                <Td align="right" numeric className="text-muted-foreground">
                  {item.bookDepth10 === null ? "—" : `${item.bookDepth10}`}
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

function FilterPanel({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void
}) {
  const num = (raw: string) => (raw.trim() === "" ? undefined : Number(raw))

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search ?? ""}
          onChange={(e) => onChange("search", e.target.value || undefined)}
          placeholder="Buscar por nome ou sigla"
          className="pl-9"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Preço mínimo" suffix="Robux">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.priceMin ?? ""}
            onChange={(e) => onChange("priceMin", num(e.target.value))}
            placeholder="500"
          />
        </Field>
        <Field label="Preço máximo" suffix="Robux">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.priceMax ?? ""}
            onChange={(e) => onChange("priceMax", num(e.target.value))}
            placeholder="40000"
          />
        </Field>
        <Field label="Vendas/dia mínimo">
          <Input
            type="number"
            inputMode="decimal"
            value={filters.salesPerDayMin ?? ""}
            onChange={(e) => onChange("salesPerDayMin", num(e.target.value))}
            placeholder="3"
          />
        </Field>
        <Field label="Score mínimo" suffix="0 a 100">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.liquidityScoreMin ?? ""}
            onChange={(e) => onChange("liquidityScoreMin", num(e.target.value))}
            placeholder="70"
          />
        </Field>
        <Field label="Volatilidade máxima" suffix="%">
          <Input
            type="number"
            inputMode="decimal"
            value={filters.volatilityMax === undefined ? "" : filters.volatilityMax * 100}
            onChange={(e) => {
              const value = num(e.target.value)
              onChange("volatilityMax", value === undefined ? undefined : value / 100)
            }}
            placeholder="10"
          />
        </Field>
        <Field label="Desconto mínimo vs RAP" suffix="% abaixo">
          <Input
            type="number"
            inputMode="decimal"
            value={filters.rapDiscountMax === undefined ? "" : Math.abs(filters.rapDiscountMax * 100)}
            onChange={(e) => {
              const value = num(e.target.value)
              // Guardado como fração negativa: "5% abaixo" vira -0,05.
              onChange("rapDiscountMax", value === undefined ? undefined : -Math.abs(value) / 100)
            }}
            placeholder="5"
          />
        </Field>
        <Field label="Ofertas no book" suffix="mínimo">
          <Input
            type="number"
            inputMode="numeric"
            value={filters.bookDepthMin ?? ""}
            onChange={(e) => onChange("bookDepthMin", num(e.target.value))}
            placeholder="3"
          />
        </Field>
        <Field label="Demanda mínima">
          <select
            value={filters.demandMin ?? ""}
            onChange={(e) => onChange("demandMin", e.target.value === "" ? undefined : Number(e.target.value))}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Qualquer</option>
            {Object.entries(DEMAND_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={filters.excludeProjected ?? false}
          onChange={(e) => onChange("excludeProjected", e.target.checked || undefined)}
          className="size-4 accent-[var(--primary)]"
        />
        <span className={cn(filters.excludeProjected ? "text-foreground" : "text-muted-foreground")}>
          Excluir itens projected
        </span>
        <span className="text-xs text-muted-foreground">
          preço inflado artificialmente — trava na revenda
        </span>
      </label>
    </div>
  )
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string
  suffix?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {suffix ? <span className="text-[10px] opacity-70">{suffix}</span> : null}
      </span>
      {children}
    </label>
  )
}

export { Opportunities }
