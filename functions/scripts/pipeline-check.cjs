/**
 * Pipeline completo contra o emulador do Firestore, com dados REAIS da Roblox.
 * Roblox/Rolimons -> normalizer -> repository -> Firestore -> analytics -> score.
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
process.env.GCLOUD_PROJECT = "roprofit"

const {
  upsertLimiteds,
  writeDailyPoints,
  writeSnapshotIfChanged,
  listSnapshots,
  listDailyPoints,
} = require("../lib/market/repository/limiteds")
const {
  fetchCatalogDetails,
  fetchMarketplaceItems,
  fetchResaleData,
  fetchResellers,
  fetchThumbnails,
} = require("../lib/market/sources/roblox")
const { fetchRolimonsItems } = require("../lib/market/sources/rolimons")
const { computeVelocity, historyDayCount } = require("../lib/market/analytics/velocity")
const { computePrice, mergeLatest } = require("../lib/market/analytics/price")
const { sanitizePrice } = require("../lib/market/analytics/sanity")
const { computeLiquidityScore } = require("../lib/market/liquidity/score")
const { writeMetrics, listAllMetrics } = require("../lib/market/repository/metrics")
const { buildBatches } = require("../lib/market/opportunity/batch-builder")

const ALVOS = [1029025, 1048037, 20573078, 1031429, 1032641, 1076858, 9255011, 1365767]

function pad(value, width, right) {
  const text = String(value)
  return right ? text.padStart(width) : text.padEnd(width)
}

;(async () => {
  console.log("=== 1. Descoberta pelo Rolimons ===")
  const roli = await fetchRolimonsItems()
  const roliById = new Map((roli || []).map((i) => [i.assetId, i]))
  console.log("  " + (roli ? roli.length : 0) + " Limiteds descobertos")

  console.log("")
  console.log("=== 2. Mapeamento + coleta (dados reais da Roblox) ===")
  const mapped = []
  for (const assetId of ALVOS) {
    const cat = await fetchCatalogDetails(assetId)
    if (!cat || !cat.data.collectibleItemId) {
      console.log("  " + assetId + ": sem CIIID, ignorado")
      continue
    }
    mapped.push({
      assetId,
      ciid: cat.data.collectibleItemId,
      name: cat.data.name,
      qty: cat.data.totalQuantity,
      roli: roliById.get(assetId),
    })
  }

  const thumbs = await fetchThumbnails(mapped.map((m) => m.assetId))
  await upsertLimiteds(
    mapped.map((m) => ({
      assetId: m.assetId,
      collectibleItemId: m.ciid,
      name: m.name,
      acronym: m.roli ? m.roli.acronym : null,
      thumbnailUrl: thumbs.get(m.assetId) || null,
      totalQuantity: m.qty,
      tier: "A",
      active: true,
      needsMapping: false,
      mappingPriority: 100,
      sources: { roblox: true, rolimons: Boolean(m.roli) },
    }))
  )
  console.log("  " + mapped.length + " itens gravados no Firestore")

  const batch = await fetchMarketplaceItems(mapped.map((m) => m.ciid))
  console.log(
    "  marketplace-items: " + batch.data.length + " itens | cota restante " + batch.quotaRemaining
  )

  for (const m of mapped) {
    const mi = batch.data.find((x) => x.collectibleItemId === m.ciid)
    const rd = await fetchResaleData(m.ciid)
    const rs = await fetchResellers(m.ciid, 1)

    if (m.roli) {
      await writeSnapshotIfChanged(m.assetId, {
        rap: m.roli.rap,
        value: m.roli.value,
        demand: m.roli.demand,
        trend: m.roli.trend,
        projected: m.roli.projected,
        hyped: m.roli.hyped,
        rare: m.roli.rare,
        lowestResalePrice: null,
        secondLowestPrice: null,
        resellerCount: null,
        bookDepth10: null,
        unitsAvailable: null,
        assetStock: null,
        spreadPct: null,
        source: "rolimons",
      })
    }

    const offers = (rs ? rs.data : []).map((o) => o.price)
    const low = offers.length ? offers[0] : null
    const second = offers.length > 1 ? offers[1] : null

    await writeSnapshotIfChanged(m.assetId, {
      rap: rd ? rd.data.recentAveragePrice : null,
      value: null,
      demand: null,
      trend: null,
      projected: false,
      hyped: false,
      rare: false,
      lowestResalePrice: mi ? mi.lowestResalePrice : low,
      secondLowestPrice: second,
      resellerCount: offers.length || null,
      bookDepth10: offers.length ? offers.filter((p) => p <= offers[0] * 1.1).length : null,
      unitsAvailable: mi ? mi.unitsAvailableForConsumption : null,
      assetStock: mi ? mi.assetStock : null,
      spreadPct: low && second ? (second - low) / low : null,
      source: "roblox",
    })

    if (rd) {
      const byDate = new Map()
      for (const p of rd.data.priceDataPoints) {
        byDate.set(p.date.slice(0, 10), { date: p.date.slice(0, 10), avgPrice: p.value, volume: null })
      }
      for (const p of rd.data.volumeDataPoints) {
        const d = p.date.slice(0, 10)
        const existing = byDate.get(d)
        if (existing) existing.volume = p.value
        else byDate.set(d, { date: d, avgPrice: null, volume: p.value })
      }
      const points = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
      await writeDailyPoints(m.assetId, points.slice(-120))
    }
  }
  console.log("  snapshots e series diarias gravados")

  console.log("")
  console.log("=== 3. Analytics + Liquidity Engine (lendo do Firestore) ===")
  const computed = []
  for (const m of mapped) {
    const results = await Promise.all([listSnapshots(m.assetId, 30), listDailyPoints(m.assetId, 90)])
    const snaps = results[0]
    const daily = results[1]

    const latest = mergeLatest(snaps)
    const vel = computeVelocity(daily, snaps)
    const rap = latest.rap === undefined ? null : latest.rap
    const sane = sanitizePrice(latest.lowestResalePrice === undefined ? null : latest.lowestResalePrice, rap)
    if (sane.rejected) console.log("  ! " + m.name + ": " + sane.rejected)

    const price = computePrice(daily, sane.price, rap)

    // Fixa 14 dias de historico proprio para inspecionar o score maduro; em
    // producao esse numero vem de historyDayCount e comeca baixo de proposito.
    const score = computeLiquidityScore({
      salesPerDay30d: vel.salesPerDay30d,
      activeDayRatio: vel.activeDayRatio,
      bookDepth10: latest.bookDepth10 === undefined ? null : latest.bookDepth10,
      volatility30d: price.volatility30d,
      spreadPct: latest.spreadPct === undefined ? null : latest.spreadPct,
      assetStock: latest.assetStock === undefined ? m.qty : latest.assetStock,
      projected: Boolean(latest.projected),
      historyDays: 14,
    })

    computed.push({
      assetId: m.assetId,
      collectibleItemId: m.ciid,
      name: m.name,
      acronym: m.roli ? m.roli.acronym : null,
      thumbnailUrl: thumbs.get(m.assetId) || null,
      tier: "A",
      active: true,
      liquidityScore: score.liquidityScore,
      components: score.components,
      confidence: score.confidence,
      salesPerHour: vel.salesPerHour,
      salesPerDay24h: vel.salesPerDay24h,
      salesPerDay7d: vel.salesPerDay7d,
      salesPerDay30d: vel.salesPerDay30d,
      salesTotal7d: vel.salesTotal7d,
      salesTotal30d: vel.salesTotal30d,
      medianGapHours: vel.medianGapHours,
      p25GapHours: vel.p25GapHours,
      p75GapHours: vel.p75GapHours,
      rap,
      value: latest.value === undefined ? null : latest.value,
      demand: latest.demand === undefined ? null : latest.demand,
      trend: latest.trend === undefined ? null : latest.trend,
      projected: Boolean(latest.projected),
      lowestResalePrice: sane.price,
      avgPrice7d: price.avgPrice7d,
      avgPrice30d: price.avgPrice30d,
      minPrice7d: price.minPrice7d,
      maxPrice7d: price.maxPrice7d,
      rapDiscountPct: price.rapDiscountPct,
      volatility30d: price.volatility30d,
      priceTrend7d: price.priceTrend7d,
      spreadPct: latest.spreadPct === undefined ? null : latest.spreadPct,
      bookDepth10: latest.bookDepth10 === undefined ? null : latest.bookDepth10,
      resellerCount: latest.resellerCount === undefined ? null : latest.resellerCount,
      assetStock: latest.assetStock === undefined ? m.qty : latest.assetStock,
      historyDays: historyDayCount(snaps),
      computedAt: new Date(),
      dataAgeHours: 0,
    })
  }

  await writeMetrics(computed)
  const stored = await listAllMetrics()
  console.log("  " + stored.length + " documentos em item_metrics")
  console.log("")
  console.log(
    "  " + pad("item", 30) + pad("preco", 10, true) + pad("vnd/dia", 9, true) +
    pad("volat", 8, true) + pad("book", 6, true) + pad("score", 7, true)
  )
  console.log("  " + "-".repeat(70))

  stored.sort((a, b) => b.liquidityScore - a.liquidityScore)
  for (const m of stored) {
    console.log(
      "  " +
        pad(m.name.slice(0, 29), 30) +
        pad(m.lowestResalePrice === null ? "-" : m.lowestResalePrice, 10, true) +
        pad(m.salesPerDay7d === null ? "-" : m.salesPerDay7d.toFixed(1), 9, true) +
        pad(m.volatility30d === null ? "-" : (m.volatility30d * 100).toFixed(1) + "%", 8, true) +
        pad(m.bookDepth10 === null ? "-" : m.bookDepth10, 6, true) +
        pad(m.liquidityScore, 7, true)
    )
  }

  console.log("")
  console.log("=== 4. Montador de lotes sobre os dados reais gravados ===")
  const result = buildBatches(stored, { targetNetRobux: 10000 })
  console.log(
    "  alvo " + Math.round(result.target) + " Robux brutos | " +
    result.candidatesConsidered + " candidatos | " + result.batches.length + " combinacoes"
  )
  if (result.note) console.log("  nota: " + result.note)

  result.batches.slice(0, 2).forEach((b, i) => {
    console.log("")
    console.log(
      "  #" + (i + 1) + "  " + b.grossRobux.toLocaleString("pt-BR") + " Robux (" +
      (b.deviationPct * 100).toFixed(2) + "%) | qualidade " + b.quality + " | " +
      b.simulation.accountsNeeded + " conta(s)"
    )
    b.items.forEach((it) => {
      console.log("      " + pad(it.name.slice(0, 26), 27) + pad(it.price, 8, true) + "   score " + it.liquidityScore)
    })
    console.log(
      "      lucro R$ " + b.simulation.profitBRL.toFixed(2) +
      " | ROI " + (b.simulation.roi * 100).toFixed(1) + "%"
    )
  })
})().catch((e) => {
  console.error("FALHOU:", e.message)
  console.error(e.stack ? e.stack.split("\n").slice(0, 4).join("\n") : "")
  process.exit(1)
})
