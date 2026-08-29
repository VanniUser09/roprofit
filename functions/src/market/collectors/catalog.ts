import { COLLECTION } from "../../config"
import { scoped } from "../../lib/log"
import {
  listLimiteds,
  nextUnmapped,
  pickChanged,
  upsertLimiteds,
  type LimitedUpsert,
} from "../repository/limiteds"
import { fetchCatalogDetails, fetchThumbnails } from "../sources/roblox"
import { fetchRolimonsItems } from "../sources/rolimons"
import { writeSnapshotIfChanged } from "../repository/limiteds"
import { runCollector, deadline, type RunContext } from "./run"

const log = scoped("collector.catalog")

/**
 * Semeia e atualiza o catálogo a partir do Rolimon's.
 *
 * O Rolimon's é a única fonte que lista TODOS os Limiteds numa requisição só
 * (~2.500 itens, 175 KB). A Roblox não expõe esse índice sem paginar o catálogo
 * inteiro. Por isso ele é a fonte de descoberta, mesmo sendo opcional para
 * preço: descobrir quais itens existem e ler Value/Demand.
 */
export async function collectRolimons() {
  await runCollector("collectRolimons", async (ctx) => {
    const items = await fetchRolimonsItems()
    ctx.requests = 1

    if (!items) {
      // Fonte opcional: falha aqui não é erro de execução, é degradação
      // esperada. O resto do sistema continua com dados da Roblox.
      ctx.note("Rolimon's indisponível — catálogo mantido do ciclo anterior")
      return
    }

    ctx.processed = items.length

    // Carrega o catálogo inteiro (não só os ids): serve para descobrir o que é
    // novo E para filtrar as escritas que não mudariam nada.
    const known = await listLimiteds({ activeOnly: false })
    const currentById = new Map(known.map((item) => [item.assetId, item]))
    const existing = new Set(known.map((item) => item.assetId))
    const upserts: LimitedUpsert[] = items.map((item) => {
      const isNew = !existing.has(item.assetId)
      return {
        assetId: item.assetId,
        name: item.name,
        acronym: item.acronym,
        active: true,
        sources: { roblox: !isNew, rolimons: true },
        // Item novo entra na fila de mapeamento; item já mapeado não volta.
        ...(isNew
          ? {
              collectibleItemId: null,
              needsMapping: true,
              mappingPriority: mappingPriority(item.rap),
              tier: "B" as const,
              resellersCheckedAt: null,
              dailyCheckedAt: null,
            }
          : { mappingPriority: mappingPriority(item.rap) }),
      }
    })

    const changed = pickChanged(currentById, upserts)
    ctx.written = await upsertLimiteds(changed, { touch: true })

    // Value, Demand e Trend só existem aqui. Vão para o snapshot com
    // source "rolimons" para que o merge saiba de onde cada campo veio.
    let snapshots = 0
    for (const item of items) {
      const gravou = await writeSnapshotIfChanged(item.assetId, {
        rap: item.rap,
        value: item.value,
        demand: item.demand,
        trend: item.trend,
        projected: item.projected,
        hyped: item.hyped,
        rare: item.rare,
        lowestResalePrice: null,
        secondLowestPrice: null,
        resellerCount: null,
        bookDepth10: null,
        unitsAvailable: null,
        assetStock: null,
        spreadPct: null,
        source: "rolimons",
      })
      if (gravou) snapshots++
    }

    ctx.note(
      `${upserts.length} itens no catálogo · ${changed.length} alterados · ${snapshots} snapshots novos`
    )
  })
}

/**
 * Prioridade do backfill: quanto mais perto da faixa da operação, antes.
 *
 * A RoProfit monta lotes de ~14.300 Robux com itens de 500 a 40.000. Mapear um
 * Domino Crown de 5 milhões antes de um item de 3.000 seria otimizar para a
 * cauda que nunca vamos comprar.
 */
function mappingPriority(rap: number): number {
  const { tierAPriceMin, tierAPriceMax } = COLLECTION
  if (rap >= tierAPriceMin && rap <= tierAPriceMax) return 100
  if (rap > 0 && rap < tierAPriceMin) return 50
  if (rap > tierAPriceMax && rap <= tierAPriceMax * 5) return 30
  return 10
}

/**
 * Backfill do collectibleItemId, item a item.
 *
 * Sem CIIID não há acesso a nenhum dado de mercado atual — o endpoint legado
 * que aceita assetId está congelado desde janeiro de 2025. A variante em lote
 * do catalog exige XSRF de sessão (403), então só resta item a item, e o
 * catalog devolve 429 depois de ~10 requisições em 5 segundos.
 *
 * Roda a cada minuto processando poucos itens: são ~2h para o catálogo inteiro,
 * mas os itens da faixa da operação ficam prontos nos primeiros minutos porque
 * a fila é priorizada.
 */
export async function backfillCollectibleIds() {
  await runCollector("backfillCollectibleIds", async (ctx) => {
    const pending = await nextUnmapped(COLLECTION.mappingBatchSize)
    if (pending.length === 0) {
      ctx.note("nada pendente")
      return
    }

    const limit = deadline(300)
    const upserts: LimitedUpsert[] = []
    const resolved: number[] = []

    for (const item of pending) {
      if (limit.reached()) {
        ctx.note("parou no limite de tempo; a próxima execução continua")
        break
      }

      ctx.processed++
      try {
        const details = await fetchCatalogDetails(item.assetId)
        ctx.requests++
        ctx.quotaRemaining = details?.quotaRemaining ?? ctx.quotaRemaining

        if (!details) {
          // 404/400 aqui significa item removido do catálogo, não falha de rede.
          upserts.push({ assetId: item.assetId, active: false, needsMapping: false })
          continue
        }

        const ciid = details.data.collectibleItemId ?? null
        upserts.push({
          assetId: item.assetId,
          collectibleItemId: ciid,
          assetType: details.data.assetType ?? null,
          totalQuantity: details.data.totalQuantity ?? null,
          createdUtc: details.data.itemCreatedUtc ?? null,
          // Item sem CIIID não tem mercado legível; sai da fila para não
          // consumir cota para sempre.
          needsMapping: false,
          active: ciid !== null,
          sources: { roblox: true, rolimons: item.sources?.rolimons ?? false },
        })
        if (ciid) resolved.push(item.assetId)
      } catch (error) {
        ctx.fail(error)
      }
    }

    // Thumbnails aproveitando o lote já resolvido: endpoint barato (50/s).
    if (resolved.length > 0) {
      const thumbs = await fetchThumbnails(resolved)
      ctx.requests += Math.ceil(resolved.length / 100)
      for (const upsert of upserts) {
        const url = thumbs.get(upsert.assetId)
        if (url) upsert.thumbnailUrl = url
      }
    }

    ctx.written = await upsertLimiteds(upserts)
    log.info("backfill parcial", { resolvidos: resolved.length, tentados: ctx.processed })
  })
}

export type { RunContext }
