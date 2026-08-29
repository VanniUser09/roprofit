// Teste de contrato: bate nas APIs reais e valida os schemas.
const { fetchMarketplaceItems, fetchResaleData, fetchResellers, fetchCatalogDetails, fetchThumbnails } = require("../lib/market/sources/roblox")
const { fetchRolimonsItems } = require("../lib/market/sources/rolimons")

;(async () => {
  const roli = await fetchRolimonsItems()
  console.log("Rolimons:", roli ? `${roli.length} itens` : "INDISPONIVEL")
  if (roli) {
    const cf = roli.find(i => i.assetId === 1029025)
    console.log("  Classic Fedora:", JSON.stringify(cf))
  }

  const cat = await fetchCatalogDetails(1029025)
  console.log("Catalog:", cat ? `CIIID=${cat.data.collectibleItemId} qty=${cat.data.totalQuantity}` : "NULO")
  const ciid = cat.data.collectibleItemId

  const mi = await fetchMarketplaceItems([ciid])
  console.log("MarketplaceItems:", mi.data.length, "| lowestResale:", mi.data[0]?.lowestResalePrice, "| cota:", mi.quotaRemaining)

  const rd = await fetchResaleData(ciid)
  console.log("ResaleData: RAP", rd.data.recentAveragePrice, "| pontos", rd.data.priceDataPoints.length, "| mais recente", rd.data.priceDataPoints[0]?.date)
  console.log("  volume recente:", JSON.stringify(rd.data.volumeDataPoints.slice(0,3)))

  const rs = await fetchResellers(ciid, 1)
  console.log("Resellers:", rs.data.length, "ofertas | menor:", rs.data[0]?.price, "| 2a:", rs.data[1]?.price)

  const th = await fetchThumbnails([1029025])
  console.log("Thumbnail:", th.get(1029025) ? "OK" : "FALTANDO")
})().catch(e => { console.error("FALHOU:", e.message); process.exit(1) })
