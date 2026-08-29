import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { decimal, robuxShort } from "@/lib/market"

/**
 * Gráficos da ficha do item.
 *
 * Paleta validada contra a superfície escura do produto (#18181b) com o
 * validador de acessibilidade: ΔE 27,5 sob deuteranopia entre as duas séries,
 * dentro da faixa de luminosidade e acima de 3:1 de contraste. O verde é o
 * --primary-hover do tema, então as séries não destoam do resto do painel.
 *
 * Nunca dois eixos Y. Preço e volume têm escalas incompatíveis e vão em
 * gráficos separados — sobrepor os dois num eixo duplo produz cruzamentos que
 * não significam nada.
 */

const SERIES = {
  price: "#16a34a",
  rap: "#3b82f6",
} as const

const AXIS = "#626b66"
const GRID = "#242a26"

type DailyPoint = { date: string; avgPrice: number | null; volume: number | null }
type SnapshotPoint = {
  t: string | null
  rap: number | null
  lowestResalePrice: number | null
  resellerCount: number | null
}

const axisProps = {
  stroke: AXIS,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: AXIS },
} as const

/** Rótulo curto de data: "12 ago". O ano só polui num eixo de 30 dias. */
function shortDate(iso: string) {
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | null; color?: string; dataKey?: string }[]
  label?: string | number
  formatter?: (value: number) => string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-lg shadow-black/40">
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">
        {typeof label === "string" ? shortDate(label) : label}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {/* O texto usa token de tema; a cor identifica a série pelo marcador. */}
          <span className="text-muted-foreground">{entry.name}</span>
          <span className="ml-auto font-medium tabular-nums">
            {entry.value === null || entry.value === undefined
              ? "—"
              : (formatter ?? robuxShort)(entry.value)}
          </span>
        </p>
      ))}
    </div>
  )
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  children,
  empty,
}: {
  title: string
  subtitle?: string
  legend?: { label: string; color: string }[]
  children: React.ReactNode
  empty?: boolean
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {legend && legend.length > 1 ? (
          <ul className="flex items-center gap-3">
            {legend.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {empty ? (
        <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
          Ainda sem dados suficientes para este período.
        </div>
      ) : (
        <div className="h-56 w-full">{children}</div>
      )}
    </section>
  )
}

/** Preço médio das vendas (Roblox) contra o RAP. Duas séries, um eixo. */
export function PriceChart({ data }: { data: DailyPoint[] }) {
  const points = data.filter((p) => p.avgPrice !== null)

  return (
    <ChartFrame
      title="Preço médio de venda"
      subtitle="Média diária das vendas efetivadas, da Roblox"
      legend={[{ label: "Preço médio", color: SERIES.price }]}
      empty={points.length < 2}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.price} stopOpacity={0.28} />
              <stop offset="100%" stopColor={SERIES.price} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} {...axisProps} />
          <YAxis tickFormatter={(v: number) => robuxShort(v)} width={58} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="avgPrice"
            name="Preço médio"
            stroke={SERIES.price}
            strokeWidth={2}
            fill="url(#priceFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#18181b" }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Vendas por dia. Barras, porque volume diário é contagem discreta. */
export function VolumeChart({ data }: { data: DailyPoint[] }) {
  const points = data.filter((p) => p.volume !== null)

  return (
    <ChartFrame
      title="Vendas por dia"
      subtitle="Unidades negociadas — base de toda métrica de velocidade"
      legend={[{ label: "Vendas", color: SERIES.price }]}
      empty={points.length < 2}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} {...axisProps} />
          <YAxis allowDecimals={false} width={40} {...axisProps} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => decimal(v, 0)} />}
            cursor={{ fill: "#ffffff08" }}
          />
          {/* Cantos arredondados só no topo, ancorados na linha de base. */}
          <Bar dataKey="volume" name="Vendas" fill={SERIES.price} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** RAP ao longo do tempo, dos nossos snapshots. */
export function RapChart({ data }: { data: SnapshotPoint[] }) {
  const points = data.filter((p) => p.rap !== null && p.t)

  return (
    <ChartFrame
      title="RAP"
      subtitle="Recent Average Price, observado por nós a cada ciclo"
      legend={[{ label: "RAP", color: SERIES.rap }]}
      empty={points.length < 2}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...axisProps} />
          <YAxis tickFormatter={(v: number) => robuxShort(v)} width={58} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS, strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="rap"
            name="RAP"
            stroke={SERIES.rap}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#18181b" }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/**
 * Profundidade do book ao longo do tempo.
 *
 * Esta é a série que só nós temos: número de ofertas abertas a cada 15 minutos.
 * Quedas aqui indicam vendas — é a base da inferência de velocidade intradiária.
 */
export function BookChart({ data }: { data: SnapshotPoint[] }) {
  const points = data.filter((p) => p.resellerCount !== null && p.t)

  return (
    <ChartFrame
      title="Ofertas abertas"
      subtitle="Nossos snapshots do book — quedas indicam vendas"
      legend={[{ label: "Ofertas", color: SERIES.rap }]}
      empty={points.length < 2}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bookFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.rap} stopOpacity={0.26} />
              <stop offset="100%" stopColor={SERIES.rap} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" tickFormatter={shortDate} minTickGap={28} {...axisProps} />
          <YAxis allowDecimals={false} width={40} {...axisProps} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => decimal(v, 0)} />}
            cursor={{ stroke: AXIS, strokeWidth: 1 }}
          />
          <Area
            type="stepAfter"
            dataKey="resellerCount"
            name="Ofertas"
            stroke={SERIES.rap}
            strokeWidth={2}
            fill="url(#bookFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "#18181b" }}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

export { SERIES }
