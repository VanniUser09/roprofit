/**
 * Montador de lotes sobre um universo REAL.
 *
 * Escolhe Limiteds na faixa de preço da operação direto do Rolimons, coleta os
 * dados de mercado da Roblox, calcula o score e monta os lotes. É o cenário de
 * uso real da ferramenta, do começo ao fim.
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
process.env.GCLOUD_PROJECT = "roprofit"

const {
  fetchCatalogDetails,
  fetchMarketplaceItems,
  fetchResaleData,
  fetchResellers,
} = require("../lib/market/sources/roblox")
const { fetchRolimonsItems } = require("../lib/market/sources/rolimons")
const { computeVelocity } = require("../lib/market/analytics/velocity")
const { computePrice } = require("../lib/market/analytics/price")
const { sanitizePrice } = require("../lib/market/analytics/sanity")
const { computeLiquidityScore } = require("../lib/market/liquidity/score")
const { buildBatches } = require("../lib/market/opportunity/batch-builder")

const PRICE_MIN = 700
const PRICE_MAX = 8000
const SAMPLE = 26

function pad(v, w, right) {
  const t = String(v)
  return right ? t.padStart(w) : t.padEnd(w)
}

;(async () => {
  const roli = await fetchRolimonsItems()
  if (!roli) throw new Error("Rolimons indisponivel")

  // Amostra estratificada ao longo da faixa inteira. Pegar so os de maior
  // demanda enviesa para o topo do intervalo, e ai a soma minima de 4 itens ja
  // estoura o alvo — foi o que aconteceu na primeira rodada deste teste.
  const naFaixa = roli
    .filter((i) => i.rap >= PRICE_MIN && i.rap <= PRICE_MAX && !i.projected)
    .sort((a, b) => a.rap - b.rap)

  const passo = Math.max(1, Math.floor(naFaixa.length / SAMPLE))
  const candidatos = []
  for (let i = 0; i < naFaixa.length && candidatos.length < SAMPLE; i += passo) {
    candidatos.push(naFaixa[i])
  }

  console.log(
    "Universo: " + candidatos.length + " Limiteds entre " + PRICE_MIN + " e " + PRICE_MAX + " Robux"
  )
  console.log("Coletando dados de mercado reais (respeitando os rate limits)...")
  console.log("")

  const metrics = []
  for (const item of candidatos) {
    const cat = await fetchCatalogDetails(item.assetId)
    if (!cat || !cat.data.collectibleItemId) continue
    const ciid = cat.data.collectibleItemId

    const rd = await fetchResaleData(ciid)
    const rs = await fetchResellers(ciid, 1)
    const mi = await fetchMarketplaceItems([ciid])
    const entry = mi.data[0]

    const byDate = new Map()
    if (rd) {
      for (const p of rd.data.priceDataPoints) {
        byDate.set(p.date.slice(0, 10), { date: p.date.slice(0, 10), avgPrice: p.value, volume: null })
      }
      for (const p of rd.data.volumeDataPoints) {
        const d = p.date.slice(0, 10)
        const e = byDate.get(d)
        if (e) e.volume = p.value
        else byDate.set(d, { date: d, avgPrice: null, volume: p.value })
      }
    }
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))

    const offers = (rs ? rs.data : []).map((o) => o.price)
    const low = offers.length ? offers[0] : null
    const second = offers.length > 1 ? offers[1] : null
    const rap = rd ? rd.data.recentAveragePrice : item.rap

    const sane = sanitizePrice(entry ? entry.lowestResalePrice : low, rap)
    const vel = computeVelocity(daily, [])
    const price = computePrice(daily, sane.price, rap)

    const score = computeLiquidityScore({
      salesPerDay30d: vel.salesPerDay30d,
      activeDayRatio: vel.activeDayRatio,
      bookDepth10: offers.length ? offers.filter((p) => p <= offers[0] * 1.1).length : null,
      volatility30d: price.volatility30d,
      spreadPct: low && second ? (second - low) / low : null,
      assetStock: entry ? entry.assetStock : cat.data.totalQuantity,
      projected: item.projected,
      historyDays: 14,
    })

    metrics.push({
      assetId: item.assetId,
      name: item.name,
      thumbnailUrl: null,
      liquidityScore: score.liquidityScore,
      lowestResalePrice: sane.price,
      rapDiscountPct: price.rapDiscountPct,
      volatility30d: price.volatility30d,
      salesPerDay7d: vel.salesPerDay7d,
      projected: item.projected,
    })

    process.stdout.write(".")
  }

  console.log("")
  console.log("")
  console.log("  " + pad("item", 30) + pad("preco", 9, true) + pad("vnd/dia", 9, true) + pad("vs RAP", 9, true) + pad("score", 7, true))
  console.log("  " + "-".repeat(64))
  for (const m of metrics.slice().sort((a, b) => b.liquidityScore - a.liquidityScore)) {
    console.log(
      "  " +
        pad(m.name.slice(0, 29), 30) +
        pad(m.lowestResalePrice === null ? "-" : m.lowestResalePrice, 9, true) +
        pad(m.salesPerDay7d === null ? "-" : m.salesPerDay7d.toFixed(1), 9, true) +
        pad(m.rapDiscountPct === null ? "-" : (m.rapDiscountPct * 100).toFixed(1) + "%", 9, true) +
        pad(m.liquidityScore, 7, true)
    )
  }

  console.log("")
  console.log("=== Lotes para ~10.000 Robux liquidos ===")
  const started = Date.now()
  const result = buildBatches(metrics, { targetNetRobux: 10000 })
  console.log(
    "alvo " + Math.round(result.target) + " Robux brutos | " + result.candidatesConsidered +
    " candidatos elegiveis | " + result.batches.length + " combinacoes em " + (Date.now() - started) + "ms"
  )
  if (result.note) console.log("nota: " + result.note)

  result.batches.slice(0, 3).forEach((b, i) => {
    console.log("")
    console.log(
      "#" + (i + 1) + "  " + b.grossRobux.toLocaleString("pt-BR") + " Robux  (" +
      (b.deviationPct >= 0 ? "+" : "") + (b.deviationPct * 100).toFixed(2) + "% do alvo)" +
      "  qualidade " + b.quality + "  |  " + b.simulation.accountsNeeded + " conta(s)" +
      "  |  aproveita " + Math.round(b.accountEfficiency * 100) + "% do limite"
    )
    b.items.forEach((it) => {
      console.log(
        "    " + pad(it.name.slice(0, 28), 29) + pad(it.price, 7, true) +
        " Robux   score " + pad(it.liquidityScore, 3, true) +
        "   " + (it.salesPerDay7d === null ? "-" : it.salesPerDay7d.toFixed(1) + "/dia")
      )
    })
    console.log(
      "    -> liquidos " + Math.round(b.simulation.netRobux).toLocaleString("pt-BR") +
      " | custo R$ " + b.simulation.costBRL.toFixed(2) +
      " | receita R$ " + b.simulation.revenueBRL.toFixed(2) +
      " | lucro R$ " + b.simulation.profitBRL.toFixed(2) +
      " | ROI " + (b.simulation.roi * 100).toFixed(1) + "%"
    )
  })
})().catch((e) => {
  console.error("FALHOU:", e.message)
  process.exit(1)
})
