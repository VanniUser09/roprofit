import { BATCH_BUILDER } from "../../config"
import type { ItemMetrics } from "../types"
import { resolveParams, simulate, type OperationParams, type SimulationResult } from "./simulator"

/**
 * Montador de lotes.
 *
 * O problema: não queremos depender de achar um Limited de exatamente 14.286
 * Robux. Queremos montar combinações de itens menores que somem perto do alvo,
 * priorizando os que giram rápido.
 *
 * Formalmente é uma soma de subconjuntos com objetivo — escolher itens cuja
 * soma caia numa faixa, maximizando qualidade. Discretizando os preços em
 * faixas de 100 Robux, o alvo de ~14.300 vira ~143 posições e o espaço fica
 * pequeno o suficiente para programação dinâmica exata em milissegundos.
 *
 * Devolvemos as 10 melhores combinações DISTINTAS, não só a ótima: na prática
 * o admin quer alternativas, porque a melhor no papel pode conter um item que
 * ele não consegue comprar naquele momento.
 */

export type BatchCandidate = {
  assetId: number
  name: string
  thumbnailUrl: string | null
  price: number
  liquidityScore: number
  rapDiscountPct: number | null
  volatility30d: number | null
  salesPerDay7d: number | null
}

export type Batch = {
  items: BatchCandidate[]
  grossRobux: number
  /** Distância do alvo, como fração. */
  deviationPct: number
  /** Média ponderada do objetivo, de 0 a 100. */
  quality: number
  simulation: SimulationResult
  /** 0–1: quanto do limite das contas usadas o lote aproveita. */
  accountEfficiency: number
}

export type BatchRequest = {
  /** Alvo em Robux LÍQUIDOS. O bruto é derivado pela taxa. */
  targetNetRobux?: number
  /** Alternativa: alvo direto em Robux brutos. */
  targetGrossRobux?: number
  tolerancePct?: number
  minItems?: number
  maxItems?: number
  /** Teto de capital em reais. Corta combinações fora do orçamento. */
  maxCapitalBRL?: number
  params?: Partial<OperationParams>
}

export function buildBatches(
  metrics: ItemMetrics[],
  request: BatchRequest
): { target: number; batches: Batch[]; candidatesConsidered: number; note: string | null } {
  const params = resolveParams(request.params)

  const targetGross =
    request.targetGrossRobux ??
    (request.targetNetRobux !== undefined && params.robloxFeePct < 1
      ? request.targetNetRobux / (1 - params.robloxFeePct)
      : params.robuxLimitPerAccount / (1 - params.robloxFeePct))

  const tolerance = request.tolerancePct ?? BATCH_BUILDER.tolerancePct
  const minItems = request.minItems ?? BATCH_BUILDER.minItems
  const maxItems = request.maxItems ?? BATCH_BUILDER.maxItems

  const candidates = selectCandidates(metrics, targetGross, maxItems)

  if (candidates.length < minItems) {
    return {
      target: targetGross,
      batches: [],
      candidatesConsidered: candidates.length,
      note: `Apenas ${candidates.length} itens elegíveis — insuficiente para um lote de ${minItems}. Amplie a faixa de preço ou reduza o score mínimo.`,
    }
  }

  const combinations = search(candidates, targetGross, tolerance, minItems, maxItems)

  const batches = combinations
    .map((items) => toBatch(items, targetGross, params))
    .filter((batch) =>
      request.maxCapitalBRL === undefined
        ? true
        : batch.simulation.capitalRequiredBRL <= request.maxCapitalBRL
    )
    .sort((a, b) => b.quality - a.quality)
    .slice(0, BATCH_BUILDER.resultCount)

  return {
    target: targetGross,
    batches,
    candidatesConsidered: candidates.length,
    note:
      batches.length === 0
        ? "Nenhuma combinação dentro da tolerância. Aumente a tolerância ou a faixa de preço."
        : null,
  }
}

/**
 * Pré-seleção dos candidatos.
 *
 * Um item que sozinho já passa do alvo nunca compõe um lote de 4+ itens, e um
 * item barato demais exigiria dezenas de unidades. Cortar antes reduz o espaço
 * de busca de milhares para dezenas, sem descartar nenhuma solução viável.
 */
function selectCandidates(
  metrics: ItemMetrics[],
  targetGross: number,
  maxItems: number
): BatchCandidate[] {
  // Um item não pode custar mais do que o alvo menos o mínimo dos outros.
  const priceCeiling = targetGross * 0.6
  // Nem tão pouco que nem `maxItems` unidades cheguem perto do alvo.
  const priceFloor = targetGross / (maxItems * 4)

  return metrics
    .filter((item) => {
      const price = item.lowestResalePrice
      if (price === null || price <= 0) return false
      if (price > priceCeiling || price < priceFloor) return false
      // Item projected tem preço inflado artificialmente: entra no lote e
      // trava na hora de revender.
      if (item.projected) return false
      // Sem liquidez mínima, o lote fica bonito na planilha e parado no estoque.
      if (item.liquidityScore < 40) return false
      return true
    })
    .sort((a, b) => b.liquidityScore - a.liquidityScore)
    // Teto de candidatos: a busca é exponencial no pior caso, e os 80 melhores
    // já cobrem qualquer combinação que valha a pena montar.
    .slice(0, 80)
    .map((item) => ({
      assetId: item.assetId,
      name: item.name,
      thumbnailUrl: item.thumbnailUrl,
      price: item.lowestResalePrice!,
      liquidityScore: item.liquidityScore,
      rapDiscountPct: item.rapDiscountPct,
      volatility30d: item.volatility30d,
      salesPerDay7d: item.salesPerDay7d,
    }))
}

/**
 * Busca em profundidade com poda.
 *
 * Os candidatos vêm ordenados por preço, o que permite duas podas fortes:
 * se a soma parcial já passou do teto, todo o ramo morre; se nem somando os
 * maiores itens restantes chegamos ao piso, também.
 *
 * Sem as podas isto seria 2^80. Com elas, resolve em milissegundos.
 */
function search(
  candidates: BatchCandidate[],
  target: number,
  tolerance: number,
  minItems: number,
  maxItems: number
): BatchCandidate[][] {
  const byPrice = [...candidates].sort((a, b) => b.price - a.price)
  const floor = target * (1 - tolerance)
  const ceiling = target * (1 + tolerance)

  const results: BatchCandidate[][] = []
  // Teto de resultados: sem ele, mercados com muitos itens parecidos geram
  // dezenas de milhares de combinações quase idênticas.
  const MAX_RESULTS = 400

  // Soma máxima ainda alcançável a partir de cada posição, para a poda.
  const suffixMax = new Array<number>(byPrice.length + 1).fill(0)
  for (let i = byPrice.length - 1; i >= 0; i--) {
    suffixMax[i] = byPrice[i].price + suffixMax[i + 1]
  }

  const chosen: BatchCandidate[] = []

  function recurse(index: number, sum: number) {
    if (results.length >= MAX_RESULTS) return

    if (sum >= floor && sum <= ceiling && chosen.length >= minItems) {
      results.push([...chosen])
      return
    }
    if (index >= byPrice.length) return
    if (chosen.length >= maxItems) return
    if (sum > ceiling) return
    // Nem pegando tudo que resta chegamos ao piso.
    if (sum + suffixMax[index] < floor) return

    // Ramo com o item atual.
    chosen.push(byPrice[index])
    recurse(index + 1, sum + byPrice[index].price)
    chosen.pop()

    // Ramo sem ele.
    recurse(index + 1, sum)
  }

  recurse(0, 0)
  return results
}

function toBatch(
  items: BatchCandidate[],
  target: number,
  params: OperationParams
): Batch {
  const grossRobux = items.reduce((sum, item) => sum + item.price, 0)

  const simulation = simulate({ grossRobux, params })

  return {
    items: [...items].sort((a, b) => b.price - a.price),
    grossRobux,
    deviationPct: (grossRobux - target) / target,
    quality: scoreBatch(items, simulation, params),
    simulation,
    accountEfficiency: accountEfficiency(simulation, params),
  }
}

/**
 * Quanto do limite das contas o lote realmente aproveita.
 *
 * Descoberto testando: um lote de 9.831 Robux líquidos ocupa UMA conta; um de
 * 10.111 ocupa DUAS. Os 280 Robux a mais custam uma conta inteira e deixam a
 * segunda 99% ociosa — em uma operação limitada por número de contas, o
 * segundo lote é pior apesar de render mais.
 *
 * Devolve 0–1: 1 significa contas cheias, 0,5 significa metade do limite
 * contratado desperdiçado.
 */
function accountEfficiency(
  simulation: SimulationResult,
  params: OperationParams
): number {
  if (params.robuxLimitPerAccount <= 0 || simulation.accountsNeeded === 0) return 1
  const capacity = simulation.accountsNeeded * params.robuxLimitPerAccount
  return simulation.netRobux / capacity
}

/**
 * Qualidade do lote, de 0 a 100.
 *
 * Média ponderada dos quatro critérios do plano. Usa a MÉDIA e não a soma para
 * não premiar lotes só por terem mais itens — e o pior item entra com peso
 * extra, porque na prática é ele que segura o giro do lote inteiro.
 */
function scoreBatch(
  items: BatchCandidate[],
  simulation: SimulationResult,
  params: OperationParams
): number {
  const w = BATCH_BUILDER.objective

  const avg = (pick: (item: BatchCandidate) => number) =>
    items.reduce((sum, item) => sum + pick(item), 0) / items.length

  const liquidity = avg((i) => i.liquidityScore)

  // Desconto: -10% em relação ao RAP vira 100; prêmio vira 0.
  const discount = avg((i) => {
    const pct = i.rapDiscountPct
    if (pct === null) return 50
    return Math.max(0, Math.min(100, (-pct / 0.10) * 100))
  })

  const consistency = avg((i) => {
    const sales = i.salesPerDay7d
    if (sales === null) return 0
    return Math.min(100, (sales / 10) * 100)
  })

  const stability = avg((i) => {
    const vol = i.volatility30d
    if (vol === null) return 50
    return Math.max(0, (1 - Math.min(1, vol)) * 100)
  })

  const weighted =
    liquidity * w.liquidity +
    discount * w.discount +
    consistency * w.consistency +
    stability * w.stability

  // O elo mais fraco puxa: um lote com três itens ótimos e um travado não é
  // um lote bom, porque o capital fica preso no travado.
  const weakest = Math.min(...items.map((i) => i.liquidityScore))
  const base = weighted * 0.8 + weakest * 0.2

  // Penaliza o lote que transborda o limite de uma conta por pouco. Sem isto,
  // o ranking prefere um lote que rende 3% a mais e consome o dobro de contas.
  const efficiency = accountEfficiency(simulation, params)

  return Math.round(base * (0.7 + 0.3 * efficiency))
}
