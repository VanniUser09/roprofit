import { z } from "zod"

/**
 * Schemas das respostas externas.
 *
 * Duas regras aqui. Primeira: quase tudo é `nullish`, porque as APIs da Roblox
 * omitem campos sem aviso e um schema rígido derrubaria o coletor inteiro por
 * causa de um item estranho. Segunda: `.catch()` nos arrays, para que um
 * elemento malformado vire um item descartado em vez de uma exceção.
 *
 * Formatos confirmados em sondagem real de 28/08/2026.
 */

const numberish = z.number().finite().nullish()

/** POST apis.roblox.com/marketplace-items/v1/items/details */
export const MarketplaceItemSchema = z.object({
  collectibleItemId: z.string(),
  itemTargetId: z.number(),
  name: z.string().nullish(),
  price: numberish,
  lowestPrice: numberish,
  lowestResalePrice: numberish,
  /** Cópias em circulação. */
  assetStock: numberish,
  /** Unidades ainda à venda pelo criador (0 na maioria dos Limiteds antigos). */
  unitsAvailableForConsumption: numberish,
  hasResellers: z.boolean().nullish(),
  sales: numberish,
  errorCode: z.union([z.number(), z.string()]).nullish(),
})

export const MarketplaceItemsResponseSchema = z.array(
  MarketplaceItemSchema.nullable().catch(null)
)

/** GET apis.roblox.com/marketplace-sales/v1/item/{ciid}/resale-data */
const DataPointSchema = z.object({
  value: z.number(),
  date: z.string(),
})

export const ResaleDataSchema = z.object({
  /** Preço médio por dia. Granularidade diária é o máximo que a fonte oferece. */
  priceDataPoints: z.array(DataPointSchema.nullable().catch(null)).default([]),
  /** Vendas por dia. É daqui que sai toda a métrica de velocidade. */
  volumeDataPoints: z.array(DataPointSchema.nullable().catch(null)).default([]),
  recentAveragePrice: numberish,
})

/** GET apis.roblox.com/marketplace-sales/v1/item/{ciid}/resellers */
export const ResellerSchema = z.object({
  collectibleProductId: z.string().nullish(),
  collectibleItemInstanceId: z.string().nullish(),
  price: z.number(),
  serialNumber: numberish,
  seller: z
    .object({
      sellerId: z.union([z.number(), z.string()]).nullish(),
      name: z.string().nullish(),
      sellerType: z.string().nullish(),
    })
    .nullish(),
})

export const ResellersResponseSchema = z.object({
  data: z.array(ResellerSchema.nullable().catch(null)).default([]),
  nextPageCursor: z.string().nullish(),
})

/** GET catalog.roblox.com/v1/catalog/items/{id}/details */
export const CatalogDetailsSchema = z.object({
  id: z.number(),
  name: z.string().nullish(),
  assetType: numberish,
  itemRestrictions: z.array(z.string()).nullish(),
  /** A chave para tudo: sem CIIID não há acesso ao mercado atual. */
  collectibleItemId: z.string().nullish(),
  totalQuantity: numberish,
  lowestResalePrice: numberish,
  unitsAvailableForConsumption: numberish,
  hasResellers: z.boolean().nullish(),
  itemCreatedUtc: z.string().nullish(),
})

/** GET thumbnails.roblox.com/v1/assets */
export const ThumbnailsResponseSchema = z.object({
  data: z
    .array(
      z
        .object({
          targetId: z.number(),
          state: z.string().nullish(),
          imageUrl: z.string().nullish(),
        })
        .nullable()
        .catch(null)
    )
    .default([]),
})

/**
 * GET www.rolimons.com/itemapi/itemdetails
 *
 * Cada item é um array posicional de 10 posições, não um objeto:
 * [nome, sigla, RAP, value, defaultValue, demand, trend, projected, hyped, rare]
 * Os códigos usam -1 para "não classificado" — que não é o mesmo que zero.
 */
export const RolimonsItemTupleSchema = z.tuple([
  z.string(),
  z.string(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
])

export const RolimonsResponseSchema = z.object({
  success: z.boolean(),
  item_count: z.number(),
  items: z.record(z.string(), RolimonsItemTupleSchema.nullable().catch(null)),
})

export type MarketplaceItem = z.infer<typeof MarketplaceItemSchema>
export type ResaleData = z.infer<typeof ResaleDataSchema>
export type Reseller = z.infer<typeof ResellerSchema>
export type CatalogDetails = z.infer<typeof CatalogDetailsSchema>
