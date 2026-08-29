import { AlertTriangle, Info, Loader2, TrendingDown, TrendingUp } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { DASH, pct, scoreTone, type ItemMetrics } from "@/lib/market"
import { cn } from "@/lib/utils"

/**
 * Primitivos do painel administrativo.
 *
 * Um painel é operado, não lido de cima a baixo — então estado precisa aparecer
 * na FORMA além do número: barra de score, seta de direção, chip de severidade.
 * Tudo construído sobre os tokens de tema do projeto, sem cor solta.
 */

// ── Tile de métrica ────────────────────────────────────────────────────────

export function Tile({
  label,
  value,
  hint,
  delta,
  tone = "neutral",
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: number | null
  tone?: "neutral" | "good" | "warn" | "bad"
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-primary",
    warn: "text-amber-400",
    bad: "text-red-400",
  }[tone]

  return (
    <div className="flex flex-col gap-1.5 bg-card p-4">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", toneClass)}>
        {value}
      </span>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {delta !== undefined && delta !== null ? <Delta value={delta} /> : null}
        {hint ? <span className="truncate">{hint}</span> : null}
      </div>
    </div>
  )
}

/** Grade de tiles com 1px de separação — sem margens que colapsam. */
export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  )
}

export function Delta({ value }: { value: number }) {
  const positive = value > 0
  const Icon = positive ? TrendingUp : TrendingDown
  if (Math.abs(value) < 0.0005) return <span className="text-muted-foreground">estável</span>

  return (
    <span className={cn("inline-flex items-center gap-1", positive ? "text-primary" : "text-red-400")}>
      <Icon className="size-3" />
      {pct(value, 1, true)}
    </span>
  )
}

// ── Score de liquidez ──────────────────────────────────────────────────────

/**
 * Score com barra.
 *
 * A barra existe porque um número de 0 a 100 numa tabela de 50 linhas não se
 * lê de relance — a largura sim. `confidence` escurece a barra quando o
 * histórico próprio ainda é curto, para o número não parecer mais firme do que é.
 */
export function ScoreBar({
  score,
  confidence,
  className,
}: {
  score: number
  confidence?: number
  className?: string
}) {
  const tone = scoreTone(score)
  const barColor = {
    high: "bg-primary",
    mid: "bg-amber-400",
    low: "bg-red-400",
  }[tone]

  const uncertain = confidence !== undefined && confidence < 0.8

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "w-8 text-right text-sm font-semibold tabular-nums",
          tone === "high" && "text-primary",
          tone === "mid" && "text-amber-400",
          tone === "low" && "text-red-400"
        )}
      >
        {score}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-background">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", barColor, uncertain && "opacity-45")}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
      {uncertain ? (
        <span
          title={`Confiança em ${Math.round((confidence ?? 0) * 100)}% — histórico próprio ainda curto`}
          className="text-[10px] font-medium text-muted-foreground"
        >
          {Math.round((confidence ?? 0) * 100)}%
        </span>
      ) : null}
    </div>
  )
}

// ── Identificação do item ──────────────────────────────────────────────────

export function ItemCell({ item }: { item: Pick<ItemMetrics, "name" | "thumbnailUrl" | "acronym" | "projected"> }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Thumb url={item.thumbnailUrl} alt={item.name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <div className="flex items-center gap-1.5">
          {item.acronym ? (
            <span className="text-[11px] text-muted-foreground">{item.acronym}</span>
          ) : null}
          {item.projected ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
              projected
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Thumb({ url, alt, size = "size-9" }: { url: string | null; alt: string; size?: string }) {
  if (!url) {
    return <div className={cn("shrink-0 rounded-lg border border-border bg-background", size)} />
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn("shrink-0 rounded-lg border border-border bg-background object-contain", size)}
    />
  )
}

// ── Estados de tela ────────────────────────────────────────────────────────

export function PanelLoading({ label = "Carregando dados de mercado..." }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}

/**
 * Estado vazio que diz o que fazer, não só que está vazio.
 *
 * No começo da operação quase toda tela vai cair aqui enquanto os coletores
 * acumulam histórico — então a mensagem precisa distinguir "ainda coletando"
 * de "seu filtro não achou nada".
 */
export function PanelEmpty({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <Info className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  )
}

export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/5 px-6 py-12 text-center">
      <AlertTriangle className="size-5 text-red-400" />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-card"
        >
          Tentar de novo
        </button>
      ) : null}
    </div>
  )
}

// ── Tabela ─────────────────────────────────────────────────────────────────

/** Wrapper com rolagem horizontal própria: o body da página nunca rola lateralmente. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({
  children,
  align = "left",
  className,
  onClick,
  active,
  direction,
}: {
  children: ReactNode
  align?: "left" | "right" | "center"
  className?: string
  onClick?: () => void
  active?: boolean
  direction?: "asc" | "desc"
}) {
  const content = (
    <span className={cn("inline-flex items-center gap-1", active && "text-foreground")}>
      {children}
      {active ? <span aria-hidden>{direction === "asc" ? "↑" : "↓"}</span> : null}
    </span>
  )

  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap border-b border-border bg-card px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        onClick && "cursor-pointer select-none transition-colors hover:text-foreground",
        className
      )}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1">
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  )
}

export function Td({
  children,
  align = "left",
  className,
  numeric,
}: {
  children: ReactNode
  align?: "left" | "right" | "center"
  className?: string
  numeric?: boolean
}) {
  return (
    <td
      className={cn(
        "border-b border-border/60 px-4 py-2.5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        numeric && "tabular-nums",
        className
      )}
    >
      {children}
    </td>
  )
}

/** Valor com sinal: verde quando favorece a compra, vermelho quando não. */
export function SignedPct({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">{DASH}</span>
  const good = invert ? value < 0 : value > 0
  return (
    <span className={cn(Math.abs(value) < 0.0005 ? "text-muted-foreground" : good ? "text-primary" : "text-red-400")}>
      {pct(value, 2, true)}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: "info" | "good" | "warning" | "critical" }) {
  const map = {
    good: { variant: "default" as const, label: "Oportunidade" },
    info: { variant: "info" as const, label: "Informativo" },
    warning: { variant: "warning" as const, label: "Atenção" },
    critical: { variant: "danger" as const, label: "Crítico" },
  }[severity]

  return <Badge variant={map.variant}>{map.label}</Badge>
}
