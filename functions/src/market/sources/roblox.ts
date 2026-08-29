import { COLLECTION } from "../../config"
import { scoped } from "../../lib/log"
import {
  CatalogDetailsSchema,
  MarketplaceItemsResponseSchema,
  ResaleDataSchema,
  ResellersResponseSchema,
  ThumbnailsResponseSchema,
  type CatalogDetails,
  type MarketplaceItem,
  type Reseller,
} from "../normalizer/schemas"
import { request } from "./http"

const log = scoped("sources.roblox")

/**
 * Acesso às APIs da Roblox.
 *
 * Sobre o que NÃO está aqui, e por quê — verificado ao vivo em 28/08/2026:
 *
 *   economy.roblox.com/v1/assets/{id}/resale-data
 *     Responde 200 e parece saudável, mas as séries estão congeladas em
 *     30/01/2025 e o RAP diverge ~8% do real. Depreciado pela Roblox em favor
 *     de marketplace-sales. Usar isso é ler janeiro de 2025 achando que é hoje.
 *
 *   economy.roblox.com/v1/assets/{id}/resellers
 *     401 sem cookie de sessão. O equivalente em marketplace-sales é público,
 *     então não há motivo para autenticar.
 *
 *   POST catalog.roblox.com/v1/catalog/items/details (lote)
 *     403 "XSRF token invalid". O token só é emitido para sessão autenticada.
 *     Por isso o mapeamento é item a item, e devagar.
 */

const MARKETPLACE_ITEMS = "https://apis.roblox.com/marketplace-items/v1"
const MARKETPLACE_SALES = "https://apis.roblox.com/marketplace-sales/v1"
const CATALOG = "https://catalog.roblox.com/v1"
const THUMBNAILS = "https://thumbnails.roblox.com/v1"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SourceResult<T> = { data: T; quotaRemaining: number | null }

/**
 * Detalhes de mercado em lote. É o coletor mais barato que temos: 26
 * requisições cobrem o catálogo inteiro de ~2.500 itens.
 *
 * O filtro de UUID não é paranoia: um lote com IDs malformados voltou HTTP 200
 * com array vazio na sondagem — falha silenciosa que apagaria o mercado inteiro
 * do painel sem levantar nenhum erro.
 */
export async function fetchMarketplaceItems(
  collectibleItemIds: string[]
): Promise<SourceResult<MarketplaceItem[]>> {
  const valid = collectibleItemIds.filter((id) => UUID.test(id))
  const skipped = collectibleItemIds.length - valid.length
  if (skipped > 0) log.warn("CIIDs malformados descartados", { skipped })
  if (valid.length === 0) return { data: [], quotaRemaining: null }

  const items: MarketplaceItem[] = []
  let quotaRemaining: number | null = null

  for (let i = 0; i < valid.length; i += COLLECTION.marketplaceItemsBatchSize) {
    const chunk = valid.slice(i, i + COLLECTION.marketplaceItemsBatchSize)
    const result = await request<unknown>({
      host: "apis.roblox.com/marketplace-items",
      url: `${MARKETPLACE_ITEMS}/items/details`,
      method: "POST",
      body: { itemIds: chunk },
    })
    if (!result) continue

    quotaRemaining = result.quotaRemaining ?? quotaRemaining
    const parsed = MarketplaceItemsResponseSchema.safeParse(result.data)
    if (!parsed.success) {
      log.error("resposta de marketplace-items fora do formato", parsed.error, {
        chunkSize: chunk.length,
      })
      continue
    }

    const received = parsed.data.filter((item): item is MarketplaceItem => item !== null)
    // Lote vazio com entrada válida é o sintoma da falha silenciosa acima.
    if (received.length === 0 && chunk.length > 0) {
      log.error("lote válido devolveu zero itens", undefined, { chunkSize: chunk.length })
    }
    items.push(...received)
  }

  return { data: items, quotaRemaining }
}

/**
 * Série diária de preço e volume. Substitui o endpoint legado de economy.
 * `volumeDataPoints` é a base de toda métrica de velocidade de venda.
 */
export async function fetchResaleData(collectibleItemId: string) {
  const result = await request<unknown>({
    host: "apis.roblox.com/marketplace-sales",
    url: `${MARKETPLACE_SALES}/item/${collectibleItemId}/resale-data`,
    treatAsEmpty: [400, 404],
  })
  if (!result) return null

  const parsed = ResaleDataSchema.safeParse(result.data)
  if (!parsed.success) {
    log.error("resale-data fora do formato", parsed.error, { collectibleItemId })
    return null
  }

  return {
    data: {
      recentAveragePrice: parsed.data.recentAveragePrice ?? null,
      priceDataPoints: parsed.data.priceDataPoints.filter((p) => p !== null),
      volumeDataPoints: parsed.data.volumeDataPoints.filter((p) => p !== null),
    },
    quotaRemaining: result.quotaRemaining,
  }
}

/**
 * Book de ofertas abertas. Público — o equivalente em economy exige login.
 *
 * É a nossa única janela intradiária: comparando snapshots consecutivos,
 * listagens que desaparecem indicam vendas com resolução de 15 minutos, que é
 * o que a fonte diária da Roblox nunca vai dar.
 */
export async function fetchResellers(
  collectibleItemId: string,
  maxPages = 3
): Promise<SourceResult<Reseller[]> | null> {
  const offers: Reseller[] = []
  let cursor: string | null = null
  let quotaRemaining: number | null = null

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${MARKETPLACE_SALES}/item/${collectibleItemId}/resellers`)
    url.searchParams.set("limit", "100")
    if (cursor) url.searchParams.set("cursor", cursor)

    const result = await request<unknown>({
      host: "apis.roblox.com/marketplace-sales",
      url: url.toString(),
      treatAsEmpty: [400, 404],
    })
    if (!result) break

    quotaRemaining = result.quotaRemaining ?? quotaRemaining
    const parsed = ResellersResponseSchema.safeParse(result.data)
    if (!parsed.success) {
      log.error("resellers fora do formato", parsed.error, { collectibleItemId })
      break
    }

    offers.push(...parsed.data.data.filter((o): o is Reseller => o !== null))
    cursor = parsed.data.nextPageCursor ?? null
    if (!cursor) break
  }

  if (offers.length === 0) return null
  // A API já devolve ordenado, mas o cálculo de spread depende disso ser verdade.
  offers.sort((a, b) => a.price - b.price)
  return { data: offers, quotaRemaining }
}

/**
 * Mapeamento assetId para collectibleItemId.
 *
 * Item a item porque a variante em lote exige XSRF de sessão. O 429 chega
 * agressivo (cerca de 10 requisições em 5s), por isso o bucket deste host é o
 * mais apertado. Compensa: o mapeamento é permanente, roda uma vez por item.
 */
export async function fetchCatalogDetails(
  assetId: number
): Promise<SourceResult<CatalogDetails> | null> {
  const result = await request<unknown>({
    host: "catalog.roblox.com",
    url: `${CATALOG}/catalog/items/${assetId}/details?itemType=Asset`,
    treatAsEmpty: [400, 404],
  })
  if (!result) return null

  const parsed = CatalogDetailsSchema.safeParse(result.data)
  if (!parsed.success) {
    log.error("catalog details fora do formato", parsed.error, { assetId })
    return null
  }
  return { data: parsed.data, quotaRemaining: result.quotaRemaining }
}

/** Thumbnails em lote. Barato e tolerante: falha aqui é só imagem faltando. */
export async function fetchThumbnails(assetIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>()

  for (let i = 0; i < assetIds.length; i += 100) {
    const chunk = assetIds.slice(i, i + 100)
    const url = `${THUMBNAILS}/assets?assetIds=${chunk.join(",")}&size=420x420&format=Png`

    try {
      const result = await request<unknown>({ host: "thumbnails.roblox.com", url })
      if (!result) continue

      const parsed = ThumbnailsResponseSchema.safeParse(result.data)
      if (!parsed.success) continue

      for (const entry of parsed.data.data) {
        if (entry?.state === "Completed" && entry.imageUrl) {
          map.set(entry.targetId, entry.imageUrl)
        }
      }
    } catch (error) {
      log.warn("falha ao buscar thumbnails", { error: String(error), chunk: chunk.length })
    }
  }

  return map
}
