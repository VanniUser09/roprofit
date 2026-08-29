/**
 * Mede quantas escritas um ciclo de coleta realmente gera.
 *
 * Roda o mesmo ciclo duas vezes seguidas contra o emulador. Na segunda, nada
 * mudou no mercado — então o número de escritas deveria cair para perto de zero.
 * Se não cair, o filtro de "só grava o que mudou" não está funcionando, e o
 * custo mensal do Firestore explode sem ninguém notar.
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
process.env.GCLOUD_PROJECT = "roprofit"

const {
  listLimiteds,
  pickChanged,
  upsertLimiteds,
} = require("../lib/market/repository/limiteds")
const { writeMetrics } = require("../lib/market/repository/metrics")

const ITENS = 300

function catalogo(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({
      assetId: 900000 + i,
      collectibleItemId: "aaaaaaaa-bbbb-cccc-dddd-" + String(i).padStart(12, "0"),
      name: "Item de teste " + i,
      acronym: null,
      assetType: 8,
      thumbnailUrl: null,
      totalQuantity: 1000 + i,
      createdUtc: null,
      tier: "B",
      active: true,
      needsMapping: false,
      mappingPriority: 100,
    })
  }
  return out
}

function metricas(n, deslocamento) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push({
      assetId: 900000 + i,
      collectibleItemId: "aaaaaaaa-bbbb-cccc-dddd-" + String(i).padStart(12, "0"),
      name: "Item de teste " + i,
      acronym: null,
      thumbnailUrl: null,
      tier: "B",
      active: true,
      liquidityScore: 50 + (i % 40),
      components: { velocity: 50, consistency: 50, bookDepth: 50, stability: 50, spread: 50, scale: 50 },
      confidence: 1,
      salesPerHour: 0.1,
      salesPerDay24h: 2,
      salesPerDay7d: 2,
      salesPerDay30d: 2,
      salesTotal7d: 14,
      salesTotal30d: 60,
      medianGapHours: null,
      p25GapHours: null,
      p75GapHours: null,
      rap: 5000 + i,
      value: null,
      demand: null,
      trend: null,
      projected: false,
      // Só os primeiros `deslocamento` itens mudam de preço na segunda rodada.
      lowestResalePrice: 5000 + i + (i < deslocamento ? 7 : 0),
      avgPrice7d: 5000,
      avgPrice30d: 5000,
      minPrice7d: 4900,
      maxPrice7d: 5100,
      rapDiscountPct: 0,
      volatility30d: 0.05,
      priceTrend7d: 0,
      spreadPct: 0.01,
      bookDepth10: 5,
      resellerCount: 12,
      assetStock: 1000 + i,
      historyDays: 14,
      // Estes DOIS mudam sempre, de propósito: se o filtro os considerasse,
      // ele deixaria os 300 documentos passarem em toda execução.
      computedAt: new Date(),
      dataAgeHours: Math.random() * 5,
    })
  }
  return out
}

;(async () => {
  console.log("Ciclo com " + ITENS + " itens, rodado duas vezes seguidas.")
  console.log("")

  // ── Catálogo ──
  let atuais = new Map((await listLimiteds({ activeOnly: false })).map((i) => [i.assetId, i]))
  const primeiraCat = await upsertLimiteds(pickChanged(atuais, catalogo(ITENS)), { touch: true })

  atuais = new Map((await listLimiteds({ activeOnly: false })).map((i) => [i.assetId, i]))
  const segundaCat = await upsertLimiteds(pickChanged(atuais, catalogo(ITENS)), { touch: true })

  console.log("catálogo (upsertLimiteds)")
  console.log("  1a execucao (tudo novo):        " + primeiraCat + " escritas")
  console.log("  2a execucao (nada mudou):       " + segundaCat + " escritas")

  // ── Métricas ──
  const primeiraMet = await writeMetrics(metricas(ITENS, 0))
  const segundaMet = await writeMetrics(metricas(ITENS, 0))
  const terceiraMet = await writeMetrics(metricas(ITENS, 12))

  console.log("")
  console.log("metricas (writeMetrics)")
  console.log("  1a execucao (tudo novo):        " + primeiraMet + " escritas")
  console.log("  2a execucao (nada mudou):       " + segundaMet + " escritas")
  console.log("  3a execucao (12 mudaram preco): " + terceiraMet + " escritas")

  const antes = ITENS * 2
  const depois = segundaCat + segundaMet
  console.log("")
  console.log("Em regime, por ciclo: " + depois + " escritas onde antes eram " + antes + ".")

  const ok = segundaCat === 0 && segundaMet === 0 && terceiraMet === 12
  console.log("")
  console.log(ok ? "OK — o filtro grava exatamente o que mudou." : "FALHOU — o filtro nao esta cortando as escritas.")
  process.exit(ok ? 0 : 1)
})().catch((e) => {
  console.error("FALHOU:", e.message)
  process.exit(1)
})
