import { computePrice, mergeLatest } from "../analytics/price"
import { sanitizePrice } from "../analytics/sanity"
import { compact, mean, sum } from "../analytics/stats"
import { computeVelocity, dataAgeHours, historyDayCount } from "../analytics/velocity"
import { computeLiquidityScore } from "../liquidity/score"
import {
  listDailyPoints,
  listLimiteds,
  listSnapshots,
} from "../repository/limiteds"
import { writeMarketSnapshot, writeMetrics } from "../repository/metrics"
import type { ItemMetrics } from "../types"
import { deadline, runCollector } from "./run"

/**
 * Analytics + Liquidity Engine.
 *
 * Lê o histórico bruto e produz `item_metrics`: uma linha por item, plana e
 * consultável, que é tudo que o painel precisa. Nenhuma página faz conta em
 * cima de série temporal na hora do request.
 */
export async function computeMetrics() {
  await runCollector("computeMetrics", async (ctx) => {
    const items = await listLimiteds({ activeOnly: true })
    const limit = deadline(540)
    const computed: ItemMetrics[] = []

    for (const item of items) {
      if (limit.reached()) {
        ctx.note(`parou em ${ctx.processed}/${items.length}`)
        break
      }
      ctx.processed++

      try {
        const [snapshots, daily] = await Promise.all([
          listSnapshots(item.assetId, 30),
          listDailyPoints(item.assetId, 90),
        ])

        // Item sem nenhum dado ainda: pular em vez de gravar uma linha zerada,
        // que apareceria no ranking como "score 0, péssima liquidez" quando na
        // verdade é "nunca coletamos".
        if (snapshots.length === 0 && daily.length === 0) continue

        const latest = mergeLatest(snapshots)
        const velocity = computeVelocity(daily, snapshots)

        // Gargalo único de preço: todo coletor escreve lowestResalePrice, mas
        // é aqui que ele vira número exibido. Filtrar só no coletor de book
        // deixaria passar o preço do lote de marketplace-items, que traz o
        // mesmo anúncio-piada. Ver analytics/sanity.ts.
        const rapValue = latest.rap ?? null
        const sane = sanitizePrice(latest.lowestResalePrice ?? null, rapValue)
        if (sane.rejected) ctx.note(`${item.name}: ${sane.rejected}`)
        const currentPrice = sane.price
        const price = computePrice(daily, currentPrice, rapValue)
        const historyDays = historyDayCount(snapshots)

        const score = computeLiquidityScore({
          salesPerDay30d: velocity.salesPerDay30d,
          activeDayRatio: velocity.activeDayRatio,
          bookDepth10: latest.bookDepth10 ?? null,
          volatility30d: price.volatility30d,
          spreadPct: latest.spreadPct ?? null,
          assetStock: latest.assetStock ?? item.totalQuantity ?? null,
          projected: latest.projected ?? false,
          historyDays,
        })

        computed.push({
          assetId: item.assetId,
          collectibleItemId: item.collectibleItemId,
          name: item.name,
          acronym: item.acronym ?? null,
          thumbnailUrl: item.thumbnailUrl ?? null,
          tier: item.tier ?? "B",
          active: true,

          liquidityScore: score.liquidityScore,
          components: score.components,
          confidence: score.confidence,

          salesPerHour: velocity.salesPerHour,
          salesPerDay24h: velocity.salesPerDay24h,
          salesPerDay7d: velocity.salesPerDay7d,
          salesPerDay30d: velocity.salesPerDay30d,
          salesTotal7d: velocity.salesTotal7d,
          salesTotal30d: velocity.salesTotal30d,

          medianGapHours: velocity.medianGapHours,
          p25GapHours: velocity.p25GapHours,
          p75GapHours: velocity.p75GapHours,

          rap: rapValue,
          value: latest.value ?? null,
          demand: latest.demand ?? null,
          trend: latest.trend ?? null,
          projected: latest.projected ?? false,
          lowestResalePrice: currentPrice,
          avgPrice7d: price.avgPrice7d,
          avgPrice30d: price.avgPrice30d,
          minPrice7d: price.minPrice7d,
          maxPrice7d: price.maxPrice7d,
          rapDiscountPct: price.rapDiscountPct,
          volatility30d: price.volatility30d,
          priceTrend7d: price.priceTrend7d,
          spreadPct: latest.spreadPct ?? null,
          bookDepth10: latest.bookDepth10 ?? null,
          resellerCount: latest.resellerCount ?? null,
          assetStock: latest.assetStock ?? item.totalQuantity ?? null,

          historyDays,
          computedAt: new Date(),
          dataAgeHours: dataAgeHours(snapshots),
        })
      } catch (error) {
        ctx.fail(error)
      }
    }

    ctx.written = await writeMetrics(computed)
    await writeGlobalSnapshot(computed)
    ctx.note(`${computed.length} itens com métricas`)
  })
}

/**
 * Agregados globais do Market Overview.
 *
 * Gravados como série própria para que a página inicial possa mostrar variação
 * ("volume subiu 12% em 24h") sem varrer 2.500 documentos a cada carregamento.
 */
async function writeGlobalSnapshot(metrics: ItemMetrics[]) {
  if (metrics.length === 0) return

  const raps = compact(metrics, (m) => m.rap)
  const sales24h = compact(metrics, (m) => m.salesPerDay24h)
  const prices = compact(metrics, (m) => m.lowestResalePrice)
  const scored = metrics.filter((m) => m.confidence > 0)

  await writeMarketSnapshot({
    trackedItems: metrics.length,
    mappedItems: metrics.filter((m) => m.collectibleItemId).length,
    tierAItems: metrics.filter((m) => m.tier === "A").length,
    sales24h: sum(sales24h),
    sales7d: sum(compact(metrics, (m) => m.salesTotal7d)),
    // Volume em Robux: vendas do dia multiplicadas pelo preço médio do item.
    volume24hRobux: Math.round(
      sum(
        metrics.map((m) => (m.salesPerDay24h ?? 0) * (m.avgPrice7d ?? m.lowestResalePrice ?? 0))
      )
    ),
    avgRap: mean(raps),
    avgPrice: mean(prices),
    risingItems: metrics.filter((m) => (m.priceTrend7d ?? 0) > 0.02).length,
    fallingItems: metrics.filter((m) => (m.priceTrend7d ?? 0) < -0.02).length,
    highLiquidityItems: metrics.filter((m) => m.liquidityScore >= 70).length,
    avgLiquidityScore: mean(scored.map((m) => m.liquidityScore)),
    // Média de confiança: enquanto estiver baixa, o painel avisa que o
    // histórico próprio ainda está se formando.
    avgConfidence: mean(metrics.map((m) => m.confidence)),
  })
}
