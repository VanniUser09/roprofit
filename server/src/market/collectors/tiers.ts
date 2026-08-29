import { COLLECTION } from "../../config"
import { listAllMetrics } from "../repository/metrics"
import { listLimiteds, setTiers } from "../repository/limiteds"
import type { Tier } from "../types"
import { runCollector } from "./run"

/**
 * Reavalia quem merece coleta de alta cadência.
 *
 * O Tier A é caro (uma requisição por item a cada 15 min) e por isso é
 * limitado. O critério não é "os melhores itens do mercado" — é "os itens que
 * a operação da RoProfit realmente compraria": faixa de preço de onde saem os
 * lotes de ~14.300 Robux, com revendedores ativos e venda recente.
 *
 * Um Domino Crown de 5 milhões de Robux pode ter Value altíssimo e nunca
 * entrar aqui. Não é um esquecimento: ele não cabe na operação.
 */
export async function rebuildTiers() {
  await runCollector("rebuildTiers", async (ctx) => {
    const [items, metrics] = await Promise.all([
      listLimiteds({ activeOnly: true }),
      listAllMetrics(),
    ])

    const metricsById = new Map(metrics.map((m) => [m.assetId, m]))
    ctx.processed = items.length

    const candidates = items
      .filter((item) => {
        if (!item.collectibleItemId) return false

        const metric = metricsById.get(item.assetId)
        const price = metric?.lowestResalePrice ?? metric?.rap ?? null
        if (price === null) return false
        if (price < COLLECTION.tierAPriceMin || price > COLLECTION.tierAPriceMax) return false

        // Sem revendedor não há book para fotografar — a coleta cara não
        // renderia nada.
        if ((metric?.resellerCount ?? 0) === 0 && metric?.resellerCount !== null) return false

        // Item parado não vira Tier A por mais bonito que seja o RAP.
        const recentSales = metric?.salesTotal7d ?? null
        if (recentSales !== null && recentSales === 0) return false

        return true
      })
      .sort((a, b) => {
        // Desempate pelo score anterior: quem já provou liquidez continua
        // sendo observado de perto.
        const scoreA = metricsById.get(a.assetId)?.liquidityScore ?? 0
        const scoreB = metricsById.get(b.assetId)?.liquidityScore ?? 0
        return scoreB - scoreA
      })

    const promoted = new Set(
      candidates.slice(0, COLLECTION.tierAMaxItems).map((item) => item.assetId)
    )

    const assignments = items
      .map((item) => ({
        assetId: item.assetId,
        tier: (promoted.has(item.assetId) ? "A" : "B") as Tier,
      }))
      .filter((assignment) => {
        const current = items.find((i) => i.assetId === assignment.assetId)?.tier
        return current !== assignment.tier
      })

    ctx.written = await setTiers(assignments)
    ctx.note(
      `Tier A com ${promoted.size} de ${candidates.length} candidatos · ${assignments.length} mudanças`
    )
  })
}
