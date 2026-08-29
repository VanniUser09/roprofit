import { z } from "zod"
import type { Response } from "express"

import { OPERATION_DEFAULTS } from "../../config"
import { scoped } from "../../lib/log"
import { explainScore } from "../liquidity/score"
import { buildBatches } from "../opportunity/batch-builder"
import { applyFilters, PRESETS, type OpportunityQuery } from "../opportunity/filters"
import { planCapacity, simulate } from "../opportunity/simulator"
import { listDailyPoints, listSnapshots, getLimited, countLimiteds } from "../repository/limiteds"
import {
  getMetrics,
  latestRuns,
  listAllMetrics,
  listMarketSnapshots,
  topByLiquidity,
} from "../repository/metrics"
import type { ItemMetrics } from "../types"
import { cached } from "./cache"
import type { AdminRequest } from "./admin-guard"

const log = scoped("api.handlers")

/** Todo payload de entrada passa por zod. Nada chega ao cálculo sem validar. */
const ParamsSchema = z
  .object({
    robloxFeePct: z.number().min(0).max(0.95).optional(),
    buyPricePer1k: z.number().positive().max(10_000).optional(),
    sellPricePer1k: z.number().positive().max(10_000).optional(),
    robuxLimitPerAccount: z.number().positive().max(10_000_000).optional(),
    extraCostsBRL: z.number().min(0).max(1_000_000).optional(),
  })
  .optional()

function ok(res: Response, data: unknown) {
  res.status(200).json(data)
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ error: message })
}

/** Métricas ativas, com cache. Base de quase todo endpoint de leitura. */
function allMetrics(): Promise<ItemMetrics[]> {
  return cached("metrics:all", () => listAllMetrics())
}

// ── Market Overview ────────────────────────────────────────────────────────

export async function overview(_req: AdminRequest, res: Response) {
  const data = await cached("overview", async () => {
    const [metrics, counts, history, runs] = await Promise.all([
      allMetrics(),
      countLimiteds(),
      listMarketSnapshots(2),
      latestRuns(),
    ])

    const scored = metrics.filter((m) => m.confidence > 0)
    const byMove = (direction: 1 | -1) =>
      metrics
        .filter((m) => m.priceTrend7d !== null && Math.sign(m.priceTrend7d) === direction)
        .sort((a, b) => direction * ((b.priceTrend7d ?? 0) - (a.priceTrend7d ?? 0)))
        .slice(0, 8)

    const latest = history.at(-1) as Record<string, number> | undefined
    const previous = history.at(-2) as Record<string, number> | undefined

    return {
      counts,
      totals: {
        trackedItems: metrics.length,
        sales24h: round(sum(metrics.map((m) => m.salesPerDay24h ?? 0))),
        sales7d: round(sum(metrics.map((m) => m.salesTotal7d ?? 0))),
        volume24hRobux: round(
          sum(metrics.map((m) => (m.salesPerDay24h ?? 0) * (m.avgPrice7d ?? m.lowestResalePrice ?? 0)))
        ),
        avgRap: average(metrics.map((m) => m.rap)),
        highLiquidityItems: metrics.filter((m) => m.liquidityScore >= 70).length,
        risingItems: metrics.filter((m) => (m.priceTrend7d ?? 0) > 0.02).length,
        fallingItems: metrics.filter((m) => (m.priceTrend7d ?? 0) < -0.02).length,
        avgLiquidityScore: average(scored.map((m) => m.liquidityScore)),
        // Enquanto a confiança média estiver baixa, o painel avisa que o
        // histórico próprio ainda está se formando em vez de fingir precisão.
        avgConfidence: average(metrics.map((m) => m.confidence)),
      },
      deltas: {
        sales24h: delta(previous?.sales24h, latest?.sales24h),
        volume24hRobux: delta(previous?.volume24hRobux, latest?.volume24hRobux),
        avgRap: delta(previous?.avgRap, latest?.avgRap),
      },
      topOpportunities: applyFilters(metrics, {
        filters: PRESETS[0].filters,
        limit: 8,
      }).items,
      biggestGains: byMove(1),
      biggestDrops: byMove(-1),
      // Idade do dado mais velho entre os coletores: se algum quebrou, o
      // painel mostra antes que alguém tome decisão com número velho.
      collectorHealth: summarizeHealth(runs),
    }
  })

  ok(res, data)
}

// ── Ranking ────────────────────────────────────────────────────────────────

export async function ranking(req: AdminRequest, res: Response) {
  const limit = clampInt(req.query.limit, 50, 1, 250)
  const items = await cached(`ranking:${limit}`, () => topByLiquidity(limit))
  ok(res, { items, total: items.length })
}

// ── Oportunidades ──────────────────────────────────────────────────────────

const FiltersSchema = z.object({
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  rapMin: z.number().min(0).optional(),
  rapMax: z.number().min(0).optional(),
  valueMin: z.number().min(0).optional(),
  valueMax: z.number().min(0).optional(),
  salesPerDayMin: z.number().min(0).optional(),
  liquidityScoreMin: z.number().min(0).max(100).optional(),
  volatilityMax: z.number().min(0).max(10).optional(),
  rapDiscountMax: z.number().min(-1).max(10).optional(),
  demandMin: z.number().int().min(0).max(4).optional(),
  trend: z.array(z.number().int().min(0).max(4)).optional(),
  excludeProjected: z.boolean().optional(),
  bookDepthMin: z.number().int().min(0).optional(),
  confidenceMin: z.number().min(0).max(1).optional(),
  tier: z.enum(["A", "B"]).optional(),
  search: z.string().max(80).optional(),
})

const OpportunitySchema = z.object({
  filters: FiltersSchema.optional(),
  sort: z
    .enum([
      "liquidityScore",
      "salesPerDay7d",
      "lowestResalePrice",
      "rapDiscountPct",
      "volatility30d",
      "priceTrend7d",
      "name",
    ])
    .optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().min(0).optional(),
})

export async function opportunities(req: AdminRequest, res: Response) {
  const parsed = OpportunitySchema.safeParse(req.body ?? {})
  if (!parsed.success) return badRequest(res, "Filtros inválidos.")

  const metrics = await allMetrics()
  const page = applyFilters(metrics, parsed.data as OpportunityQuery)
  ok(res, { ...page, presets: PRESETS })
}

// ── Ficha do item ──────────────────────────────────────────────────────────

export async function itemDetail(req: AdminRequest, res: Response) {
  const raw = req.params.assetId
  const assetId = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isInteger(assetId)) return badRequest(res, "Item inválido.")

  const rangeDays = clampInt(req.query.range, 30, 1, 90)

  const data = await cached(`item:${assetId}:${rangeDays}`, async () => {
    const [metrics, limited, snapshots, daily] = await Promise.all([
      getMetrics(assetId),
      getLimited(assetId),
      listSnapshots(assetId, Math.min(rangeDays, 90)),
      listDailyPoints(assetId, rangeDays),
    ])

    if (!metrics && !limited) return null

    return {
      metrics,
      limited,
      explanation: metrics
        ? explainScore({
            liquidityScore: metrics.liquidityScore,
            components: metrics.components,
            confidence: metrics.confidence,
            missing: [],
          })
        : null,
      series: {
        // Série diária: preço e volume vindos da Roblox.
        daily: daily.map((point) => ({
          date: point.date,
          avgPrice: point.avgPrice,
          volume: point.volume,
        })),
        // Série intradiária: o que nós mesmos observamos.
        snapshots: snapshots.map((snapshot) => ({
          t: toIso(snapshot.t),
          rap: snapshot.rap,
          lowestResalePrice: snapshot.lowestResalePrice,
          resellerCount: snapshot.resellerCount,
          bookDepth10: snapshot.bookDepth10,
          spreadPct: snapshot.spreadPct,
        })),
      },
    }
  })

  if (!data) {
    res.status(404).json({ error: "Item não encontrado." })
    return
  }
  ok(res, data)
}

// ── Simulador ──────────────────────────────────────────────────────────────

const SimulateSchema = z.object({
  grossRobux: z.number().min(0).max(100_000_000).optional(),
  assetId: z.number().int().optional(),
  capitalBRL: z.number().min(0).max(100_000_000).optional(),
  params: ParamsSchema,
})

export async function simulateOperation(req: AdminRequest, res: Response) {
  const parsed = SimulateSchema.safeParse(req.body ?? {})
  if (!parsed.success) return badRequest(res, "Parâmetros inválidos.")

  const { assetId, capitalBRL, params } = parsed.data
  let grossRobux = parsed.data.grossRobux

  // Simular a partir de um item: usa o preço corrente dele como entrada.
  if (grossRobux === undefined && assetId !== undefined) {
    const metrics = await getMetrics(assetId)
    if (!metrics?.lowestResalePrice) {
      return badRequest(res, "Este item não tem preço de mercado disponível para simular.")
    }
    grossRobux = metrics.lowestResalePrice
  }

  if (grossRobux === undefined && capitalBRL === undefined) {
    return badRequest(res, "Informe o valor em Robux, um item ou o capital disponível.")
  }

  ok(res, {
    defaults: OPERATION_DEFAULTS,
    simulation: grossRobux !== undefined ? simulate({ grossRobux, params }) : null,
    capacity: capitalBRL !== undefined ? planCapacity({ capitalBRL, params }) : null,
  })
}

// ── Montador de lotes ──────────────────────────────────────────────────────

const BatchSchema = z.object({
  targetNetRobux: z.number().min(100).max(10_000_000).optional(),
  targetGrossRobux: z.number().min(100).max(10_000_000).optional(),
  tolerancePct: z.number().min(0.001).max(0.5).optional(),
  minItems: z.number().int().min(1).max(20).optional(),
  maxItems: z.number().int().min(1).max(20).optional(),
  maxCapitalBRL: z.number().min(0).optional(),
  params: ParamsSchema,
})

export async function batches(req: AdminRequest, res: Response) {
  const parsed = BatchSchema.safeParse(req.body ?? {})
  if (!parsed.success) return badRequest(res, "Parâmetros do lote inválidos.")

  const request = parsed.data
  if (
    request.minItems !== undefined &&
    request.maxItems !== undefined &&
    request.minItems > request.maxItems
  ) {
    return badRequest(res, "O mínimo de itens não pode ser maior que o máximo.")
  }

  const metrics = await allMetrics()
  const started = Date.now()
  const result = buildBatches(metrics, request)

  log.info("lotes montados", {
    alvo: Math.round(result.target),
    candidatos: result.candidatesConsidered,
    combinacoes: result.batches.length,
    duracaoMs: Date.now() - started,
  })

  ok(res, result)
}

// ── Saúde dos coletores ────────────────────────────────────────────────────

export async function collectors(_req: AdminRequest, res: Response) {
  const runs = await latestRuns()
  const counts = await countLimiteds()

  ok(res, {
    runs,
    counts,
    health: summarizeHealth(runs),
    mappingProgress: counts.total > 0 ? counts.mapped / counts.total : 0,
  })
}

/**
 * Resume a saúde da coleta numa linha.
 *
 * Existe porque o modo de falha mais perigoso deste sistema não é o erro
 * visível — é o coletor que parou e o painel continuar mostrando números
 * velhos com cara de atuais.
 */
function summarizeHealth(runs: Record<string, { status: string; finishedAt: unknown }>) {
  const entries = Object.entries(runs)
  if (entries.length === 0) {
    return { status: "unknown" as const, message: "Nenhuma execução registrada ainda." }
  }

  const failing = entries.filter(([, run]) => run.status === "error")
  const stale = entries.filter(([, run]) => {
    const finished = toIso(run.finishedAt as never)
    if (!finished) return true
    return Date.now() - Date.parse(finished) > 6 * 3_600_000
  })

  if (failing.length > 0) {
    return {
      status: "error" as const,
      message: `${failing.length} coletor(es) com falha: ${failing.map(([name]) => name).join(", ")}.`,
    }
  }
  if (stale.length > 0) {
    return {
      status: "stale" as const,
      message: `${stale.length} coletor(es) sem execução recente: ${stale.map(([name]) => name).join(", ")}.`,
    }
  }
  return { status: "ok" as const, message: "Todos os coletores em dia." }
}

// ── Utilitários ────────────────────────────────────────────────────────────

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function average(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return valid.length ? sum(valid) / valid.length : null
}

function round(value: number): number {
  return Math.round(value)
}

function delta(previous: number | undefined, current: number | undefined): number | null {
  if (previous === undefined || current === undefined || previous === 0) return null
  return (current - previous) / previous
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object" && "toDate" in value) {
    return (value as { toDate(): Date }).toDate().toISOString()
  }
  return null
}
