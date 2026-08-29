// Valida o Liquidity Score com dados reais da Roblox, sem passar pelo banco.
const { computeLiquidityScore, explainScore } = require("../lib/market/liquidity/score")
const { computeVelocity } = require("../lib/market/analytics/velocity")
const { computePrice } = require("../lib/market/analytics/price")
const { fetchResaleData, fetchResellers, fetchCatalogDetails, fetchMarketplaceItems } = require("../lib/market/sources/roblox")

const ALVOS = [1029025, 1048037, 1031429, 20573078]

;(async () => {
  for (const assetId of ALVOS) {
    const cat = await fetchCatalogDetails(assetId)
    if (!cat?.data.collectibleItemId) { console.log(assetId, "sem CIIID"); continue }
    const ciid = cat.data.collectibleItemId

    const rd = await fetchResaleData(ciid)
    const rs = await fetchResellers(ciid, 1)
    const mi = await fetchMarketplaceItems([ciid])

    const daily = []
    const byDate = new Map()
    for (const p of rd.data.priceDataPoints) byDate.set(p.date.slice(0,10), { date: p.date.slice(0,10), avgPrice: p.value, volume: null })
    for (const p of rd.data.volumeDataPoints) { const d=p.date.slice(0,10); const e=byDate.get(d); if(e) e.volume=p.value; else byDate.set(d,{date:d,avgPrice:null,volume:p.value}) }
    daily.push(...[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)))

    const offers = rs?.data ?? []
    const lowest = offers[0]?.price ?? null
    const second = offers[1]?.price ?? null
    const depth = offers.length ? offers.filter(o => o.price <= offers[0].price*1.10).length : null

    const vel = computeVelocity(daily, [])
    const pri = computePrice(daily, lowest, rd.data.recentAveragePrice)

    for (const historyDays of [3, 14]) {
      const s = computeLiquidityScore({
        salesPerDay30d: vel.salesPerDay30d,
        activeDayRatio: vel.activeDayRatio,
        bookDepth10: depth,
        volatility30d: pri.volatility30d,
        spreadPct: lowest && second ? (second-lowest)/lowest : null,
        assetStock: mi.data[0]?.assetStock ?? null,
        projected: false,
        historyDays,
      })
      if (historyDays === 14) {
        console.log(`\n${cat.data.name} (${assetId})`)
        console.log(`  RAP ${rd.data.recentAveragePrice} | preco ${lowest} | desconto ${pri.rapDiscountPct===null?'-':(pri.rapDiscountPct*100).toFixed(2)+'%'}`)
        console.log(`  vendas/dia 30d ${vel.salesPerDay30d?.toFixed(2)} | 7d ${vel.salesPerDay7d?.toFixed(2)} | dias ativos ${vel.activeDayRatio===null?'-':(vel.activeDayRatio*100).toFixed(0)+'%'}`)
        console.log(`  volatilidade ${pri.volatility30d===null?'-':(pri.volatility30d*100).toFixed(1)+'%'} | book +10% ${depth} de ${offers.length} | estoque ${mi.data[0]?.assetStock}`)
        console.log(`  SCORE ${s.liquidityScore} | componentes ${JSON.stringify(Object.fromEntries(Object.entries(s.components).map(([k,v])=>[k,Math.round(v)])))}`)
        console.log(`  ${explainScore(s)}`)
      } else {
        console.log(`\n  [com so 3 dias de historico proprio o score cairia para ${s.liquidityScore}]`)
      }
    }
  }
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1) })
