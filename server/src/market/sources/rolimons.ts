import { scoped } from "../../lib/log"
import { RolimonsResponseSchema } from "../normalizer/schemas"
import type { DemandCode, TrendCode } from "../types"
import { request } from "./http"

const log = scoped("sources.rolimons")

/**
 * Rolimon's — fonte OPCIONAL.
 *
 * Verificado em 28/08/2026: RAP do Rolimon's é idêntico ao da Roblox, dígito a
 * dígito (371.788 no Classic Fedora, nas duas fontes). Ou seja, ele não é fonte
 * de preço. O que só existe aqui é o que humanos curam: Value, Demand, Trend e
 * as flags Projected/Hyped/Rare.
 *
 * Não há API oficial. O robots.txt deles permite /itemapi (Disallow só em
 * /shop) com Crawl-delay 2, e a documentação comunitária declara 1 requisição
 * por minuto — respeitamos o mais restritivo dos dois.
 *
 * Como é a única fonte sem contrato nenhum, todo consumidor precisa tratar a
 * ausência dela como normal: `fetchRolimonsItems` devolve null em vez de
 * lançar, e o Liquidity Score redistribui pesos quando o dado não vem.
 */

const ITEM_DETAILS = "https://www.rolimons.com/itemapi/itemdetails"

export type RolimonsItem = {
  assetId: number
  name: string
  acronym: string | null
  rap: number
  /** Value curado. -1 na origem significa "não classificado", vira null aqui. */
  value: number | null
  defaultValue: number | null
  demand: DemandCode | null
  trend: TrendCode | null
  projected: boolean
  hyped: boolean
  rare: boolean
}

/** Códigos do Rolimon's usam -1 para "não classificado", que não é zero. */
function code<T extends number>(raw: number): T | null {
  return raw >= 0 ? (raw as T) : null
}

function flag(raw: number): boolean {
  return raw === 1
}

function positive(raw: number): number | null {
  return raw > 0 ? raw : null
}

/**
 * Catálogo completo em uma requisição (~175 KB, ~2.500 Limiteds).
 *
 * Devolve null quando a fonte falha, em vez de lançar: perder Value e Demand
 * degrada o painel, mas não pode derrubar um ciclo de coleta que depende
 * principalmente da Roblox.
 */
export async function fetchRolimonsItems(): Promise<RolimonsItem[] | null> {
  try {
    const result = await request<unknown>({
      host: "rolimons.com",
      url: ITEM_DETAILS,
      treatAsEmpty: [403, 404, 429],
    })
    if (!result) {
      log.warn("Rolimon's indisponível nesta execução")
      return null
    }

    const parsed = RolimonsResponseSchema.safeParse(result.data)
    if (!parsed.success) {
      log.error("resposta do Rolimon's fora do formato", parsed.error)
      return null
    }
    if (!parsed.data.success) {
      log.warn("Rolimon's respondeu success=false")
      return null
    }

    const items: RolimonsItem[] = []

    for (const [rawId, tuple] of Object.entries(parsed.data.items)) {
      if (!tuple) continue
      const assetId = Number(rawId)
      if (!Number.isInteger(assetId)) continue

      const [name, acronym, rap, value, defaultValue, demand, trend, projected, hyped, rare] = tuple

      items.push({
        assetId,
        name,
        acronym: acronym || null,
        rap,
        value: positive(value),
        defaultValue: positive(defaultValue),
        demand: code<DemandCode>(demand),
        trend: code<TrendCode>(trend),
        projected: flag(projected),
        hyped: flag(hyped),
        rare: flag(rare),
      })
    }

    // Uma queda abrupta na contagem costuma indicar mudança de formato do lado
    // deles, não um mercado que encolheu. Vale um aviso antes de gravar.
    if (items.length < parsed.data.item_count * 0.9) {
      log.warn("muitos itens descartados na normalização", {
        recebidos: parsed.data.item_count,
        aproveitados: items.length,
      })
    }

    log.info("catálogo do Rolimon's carregado", { itens: items.length })
    return items
  } catch (error) {
    log.error("falha ao consultar o Rolimon's", error)
    return null
  }
}
