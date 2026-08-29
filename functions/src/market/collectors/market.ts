import { COLLECTION, LIQUIDITY_TUNING } from "../../config"
import { sanitizeBook } from "../analytics/sanity"
import {
  listLimiteds,
  listSnapshots,
  markChecked,
  pickChanged,
  nextForDaily,
  nextForResellers,
  upsertLimiteds,
  writeDailyPoints,
  writeSnapshotIfChanged,
  type LimitedUpsert,
} from "../repository/limiteds"
import { fetchMarketplaceItems, fetchResaleData, fetchResellers } from "../sources/roblox"
import type { DailyPoint } from "../types"
import { deadline, runCollector } from "./run"

/**
 * Preço mínimo, estoque e revendedores de TODO o catálogo, em lote.
 *
 * O coletor mais barato do sistema: 26 requisições cobrem ~2.500 itens. Por
 * isso roda a cada 15 minutos sem pesar no orçamento diário.
 */
export async function collectMarketplaceItems() {
  await runCollector("collectMarketplaceItems", async (ctx) => {
    const items = await listLimiteds({ activeOnly: true })
    const byCiid = new Map(
      items.filter((i) => i.collectibleItemId).map((i) => [i.collectibleItemId!, i])
    )

    if (byCiid.size === 0) {
      ctx.note("nenhum item mapeado ainda — aguardando o backfill de CIIID")
      return
    }

    const result = await fetchMarketplaceItems([...byCiid.keys()])
    ctx.requests = Math.ceil(byCiid.size / COLLECTION.marketplaceItemsBatchSize)
    ctx.quotaRemaining = result.quotaRemaining
    ctx.processed = result.data.length

    const upserts: LimitedUpsert[] = []
    let snapshots = 0

    for (const entry of result.data) {
      const known = byCiid.get(entry.collectibleItemId)
      if (!known) continue

      // errorCode preenchido significa item inacessível, não item de graça.
      // Sem esta guarda ele entraria no ranking como "preço 0, ótima oferta".
      if (entry.errorCode) {
        ctx.fail(new Error(`item com errorCode ${entry.errorCode}`))
        continue
      }

      upserts.push({
        assetId: known.assetId,
        totalQuantity: entry.assetStock ?? known.totalQuantity ?? null,
        name: entry.name ?? known.name,
      })

      const changed = await writeSnapshotIfChanged(known.assetId, {
        rap: null,
        value: null,
        demand: null,
        trend: null,
        projected: false,
        hyped: false,
        rare: false,
        lowestResalePrice: entry.lowestResalePrice ?? entry.lowestPrice ?? null,
        secondLowestPrice: null,
        resellerCount: null,
        bookDepth10: null,
        unitsAvailable: entry.unitsAvailableForConsumption ?? null,
        assetStock: entry.assetStock ?? null,
        spreadPct: null,
        source: "roblox",
      })
      if (changed) snapshots++
    }

    // Só grava quem realmente mudou. `items` já está na memória por causa do
    // lote de requisições, então o filtro não custa nenhuma leitura extra.
    const current = new Map(items.map((item) => [item.assetId, item]))
    const changed = pickChanged(current, upserts)
    ctx.written = await upsertLimiteds(changed, { touch: true })
    ctx.note(
      `${snapshots} snapshots novos · ${changed.length} de ${upserts.length} itens alterados`
    )
  })
}

/**
 * Book de ofertas do Tier A.
 *
 * A parte mais valiosa da coleta. A Roblox só publica volume DIÁRIO — não há
 * como saber, pela fonte, quantas vendas aconteceram nas últimas 3 horas.
 * Fotografando o book a cada 15 minutos, listagens que desaparecem entre dois
 * snapshots indicam vendas com essa resolução. É o dado que nenhum site
 * concorrente tem, porque depende de ter observado o mercado continuamente.
 */
export async function collectResellers() {
  await runCollector("collectResellers", async (ctx) => {
    const items = await nextForResellers(COLLECTION.tierAMaxItems)
    if (items.length === 0) {
      ctx.note("Tier A vazio — rebuildTiers ainda não rodou")
      return
    }

    const limit = deadline(540)

    for (const item of items) {
      if (limit.reached()) {
        ctx.note(`parou em ${ctx.processed}/${items.length}; o rodízio continua na próxima`)
        break
      }
      if (!item.collectibleItemId) continue

      ctx.processed++
      try {
        const result = await fetchResellers(item.collectibleItemId)
        ctx.requests++
        ctx.quotaRemaining = result?.quotaRemaining ?? ctx.quotaRemaining

        // Marca como visitado mesmo sem ofertas: senão o rodízio trava neste
        // item para sempre, e nenhum outro do Tier A é atualizado.
        await markChecked(item.assetId, "resellersCheckedAt")
        if (!result) continue

        // Descarta anúncios-piada antes de qualquer cálculo. Sem isto, uma
        // oferta a 68 bilhões de Robux vira "preço atual" e o item lidera a
        // página de Oportunidades. Ver analytics/sanity.ts.
        const rap = await lastKnownRap(item.assetId)
        const prices = sanitizeBook(result.data.map((o) => o.price), rap)
        const discarded = result.data.length - prices.length
        if (discarded > 0) ctx.note(`${discarded} oferta(s) irreal(is) descartada(s) em ${item.name}`)

        const offers = prices.map((price) => ({ price }))
        const lowest = offers[0]?.price ?? null
        const second = offers[1]?.price ?? null

        const changed = await writeSnapshotIfChanged(item.assetId, {
          rap: null,
          value: null,
          demand: null,
          trend: null,
          projected: false,
          hyped: false,
          rare: false,
          lowestResalePrice: lowest,
          secondLowestPrice: second,
          resellerCount: offers.length,
          bookDepth10: countWithinBand(offers.map((o) => o.price), LIQUIDITY_TUNING.bookDepthBandPct),
          unitsAvailable: null,
          assetStock: null,
          spreadPct: lowest && second ? (second - lowest) / lowest : null,
          source: "roblox",
        })
        if (changed) ctx.written++
      } catch (error) {
        ctx.fail(error)
      }
    }
  })
}

/**
 * RAP conhecido do item, para servir de régua ao filtro de sanidade.
 *
 * Vem do snapshot mais recente que tenha RAP — normalmente o do Rolimon's ou o
 * de collectDailySales. Sem RAP, `sanitizeBook` aceita tudo em vez de inventar
 * um limite arbitrário.
 */
async function lastKnownRap(assetId: number): Promise<number | null> {
  const recent = await listSnapshots(assetId, 7)
  for (let i = recent.length - 1; i >= 0; i--) {
    const rap = recent[i].rap
    if (rap !== null && rap !== undefined && rap > 0) return rap
  }
  return null
}

/**
 * Quantas ofertas estão dentro de uma banda acima da mínima.
 *
 * Mede se dá para SAIR do item, não só entrar. Um Limited com uma oferta a
 * 10.000 e a seguinte a 25.000 tem "preço 10.000" no papel e nenhuma liquidez
 * de saída real.
 */
function countWithinBand(prices: number[], bandPct: number): number {
  if (prices.length === 0) return 0
  const ceiling = prices[0] * (1 + bandPct)
  return prices.filter((p) => p <= ceiling).length
}

/**
 * Séries diárias de preço e volume.
 *
 * Roda a cada 6 horas e não de hora em hora por um motivo simples: a fonte é
 * diária. Buscar com mais frequência traria exatamente o mesmo número e
 * queimaria cota que o book de ofertas usa melhor.
 */
export async function collectDailySales() {
  await runCollector("collectDailySales", async (ctx) => {
    // Fatia o catálogo em 4 execuções por dia: cada uma pega os mais velhos.
    const slice = Math.ceil(2600 / 4)
    const items = await nextForDaily(slice)
    const limit = deadline(540)

    for (const item of items) {
      if (limit.reached()) {
        ctx.note(`parou em ${ctx.processed}/${items.length}; o rodízio continua`)
        break
      }
      if (!item.collectibleItemId) continue

      ctx.processed++
      try {
        const result = await fetchResaleData(item.collectibleItemId)
        ctx.requests++
        ctx.quotaRemaining = result?.quotaRemaining ?? ctx.quotaRemaining

        await markChecked(item.assetId, "dailyCheckedAt")
        if (!result) continue

        const points = mergeDailySeries(
          result.data.priceDataPoints,
          result.data.volumeDataPoints
        )
        // Só os últimos 120 dias: o histórico antigo já está gravado e
        // reescrevê-lo a cada ciclo seria custo puro.
        const recent = points.slice(-120)
        ctx.written += await writeDailyPoints(item.assetId, recent)

        if (result.data.recentAveragePrice !== null) {
          await writeSnapshotIfChanged(item.assetId, {
            rap: result.data.recentAveragePrice,
            value: null,
            demand: null,
            trend: null,
            projected: false,
            hyped: false,
            rare: false,
            lowestResalePrice: null,
            secondLowestPrice: null,
            resellerCount: null,
            bookDepth10: null,
            unitsAvailable: null,
            assetStock: null,
            spreadPct: null,
            source: "roblox",
          })
        }
      } catch (error) {
        ctx.fail(error)
      }
    }
  })
}

/**
 * Junta as duas séries pela data.
 *
 * Elas vêm separadas e nem sempre alinhadas: um dia pode ter volume sem preço
 * médio. Indexar por data evita casar por posição, que silenciosamente
 * atribuiria o volume de um dia ao preço de outro.
 */
function mergeDailySeries(
  prices: { value: number; date: string }[],
  volumes: { value: number; date: string }[]
): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()

  for (const point of prices) {
    const date = point.date.slice(0, 10)
    byDate.set(date, { date, avgPrice: point.value, volume: null })
  }
  for (const point of volumes) {
    const date = point.date.slice(0, 10)
    const existing = byDate.get(date)
    if (existing) existing.volume = point.value
    else byDate.set(date, { date, avgPrice: null, volume: point.value })
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
