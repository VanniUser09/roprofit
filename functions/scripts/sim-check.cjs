// Confere o simulador contra o exemplo do plano e testa o montador de lotes.
const { simulate, planCapacity } = require("../lib/market/opportunity/simulator")
const { buildBatches } = require("../lib/market/opportunity/batch-builder")

const brl = n => "R$ " + n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})
const pct = n => n === null ? "-" : (n*100).toFixed(1) + "%"

console.log("=== SIMULADOR: exemplo do plano (14.300 Robux brutos) ===")
const s = simulate({ grossRobux: 14300 })
console.log("  Robux brutos:      ", s.grossRobux.toLocaleString("pt-BR"))
console.log("  Taxa Roblox 30%:   ", Math.round(s.feeRobux).toLocaleString("pt-BR"))
console.log("  Robux liquidos:    ", Math.round(s.netRobux).toLocaleString("pt-BR"), "  (esperado 10.010)")
console.log("  Custo (R$17/1k):   ", brl(s.costBRL), "  (esperado R$ 243,10)")
console.log("  Receita (R$39/1k): ", brl(s.revenueBRL), "  (esperado R$ 390,39)")
console.log("  Lucro:             ", brl(s.profitBRL))
console.log("  ROI:               ", pct(s.roi), "| Margem:", pct(s.margin))
console.log("  Lucro por 1k:      ", brl(s.profitPer1kBRL))
console.log("  Contas necessarias:", s.accountsNeeded)
console.log("  Preco maximo de compra que ainda empata:", brl(s.breakEvenBuyPricePer1k) + "/1k")

console.log("\n=== CAPACIDADE: capital de R$ 3.500 ===")
const c = planCapacity({ capitalBRL: 3500 })
console.log("  Robux brutos que compra:", Math.round(c.affordableGrossRobux).toLocaleString("pt-BR"))
console.log("  Robux liquidos:         ", Math.round(c.affordableNetRobux).toLocaleString("pt-BR"))
console.log("  Contas necessarias:     ", c.accountsNeeded)
console.log("  Lote-alvo (satura 1 conta):", Math.round(c.batchTargetGrossRobux).toLocaleString("pt-BR"), "Robux brutos")
console.log("  Lotes que cabem no capital:", c.batchesAffordable)
console.log("  Lucro projetado:        ", brl(c.projectedProfitBRL), "| ROI", pct(c.roi))

console.log("\n=== MONTADOR DE LOTES ===")
// Universo sintetico so para exercitar o algoritmo (os precos reais virao do banco).
const universo = [
  ["Shaggy", 1595, 99, -0.02, 0.042, 36.4],
  ["Bighead", 3549, 93, -0.03, 0.072, 10.1],
  ["Sinister Q", 2100, 78, -0.06, 0.09, 6.2],
  ["Purple Banded", 4100, 71, -0.01, 0.11, 4.8],
  ["Red Bow", 5200, 84, -0.08, 0.06, 8.1],
  ["Blue Cap", 2900, 66, 0.01, 0.13, 3.4],
  ["Green Visor", 1200, 58, -0.04, 0.15, 2.9],
  ["Gold Chain", 6800, 74, -0.05, 0.08, 5.5],
].map(([name, price, liquidityScore, rapDiscountPct, volatility30d, salesPerDay7d], i) => ({
  assetId: 1000+i, name, thumbnailUrl: null, lowestResalePrice: price, liquidityScore,
  rapDiscountPct, volatility30d, salesPerDay7d, projected: false,
}))

const r = buildBatches(universo, { targetNetRobux: 10000 })
console.log(`  Alvo bruto: ${Math.round(r.target).toLocaleString("pt-BR")} Robux | candidatos: ${r.candidatesConsidered} | combinacoes: ${r.batches.length}`)
r.batches.slice(0,3).forEach((b,i) => {
  console.log(`\n  #${i+1}  ${b.grossRobux.toLocaleString("pt-BR")} Robux (${b.deviationPct>=0?"+":""}${(b.deviationPct*100).toFixed(2)}%) | qualidade ${b.quality}`)
  b.items.forEach(it => console.log(`      ${it.name.padEnd(16)} ${String(it.price).padStart(6)} Robux  score ${it.liquidityScore}`))
  console.log(`      -> liquidos ${Math.round(b.simulation.netRobux).toLocaleString("pt-BR")} | custo ${brl(b.simulation.costBRL)} | lucro ${brl(b.simulation.profitBRL)} | ROI ${pct(b.simulation.roi)} | ${b.simulation.accountsNeeded} conta(s)`)
})
