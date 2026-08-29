import { OPERATION_DEFAULTS } from "../../config"

/**
 * Simulador de operação.
 *
 * Modela o giro real da RoProfit: compra o Limited, revende no Marketplace da
 * Roblox, recebe Robux líquidos após a taxa, e vende esses Robux.
 *
 * Nenhum valor é constante de cálculo — todos entram como parâmetro e os
 * defaults servem só para preencher o formulário na primeira vez.
 */

export type OperationParams = {
  /** Taxa da Roblox na revenda, como fração (0,30 = 30%). */
  robloxFeePct: number
  /** R$ por 1.000 Robux na compra do Limited. */
  buyPricePer1k: number
  /** R$ por 1.000 Robux na venda dos Robux. */
  sellPricePer1k: number
  /** Limite mensal de movimentação por conta, em Robux. */
  robuxLimitPerAccount: number
  /** Custos adicionais da operação, em R$ (gateway, etc.). */
  extraCostsBRL: number
}

export type SimulationInput = {
  /** Preço do Limited (ou soma do lote), em Robux. */
  grossRobux: number
  params?: Partial<OperationParams>
}

export type SimulationResult = {
  params: OperationParams
  grossRobux: number
  /** Robux que sobram após a taxa da Roblox. */
  netRobux: number
  feeRobux: number
  /** Custo de aquisição em reais. */
  costBRL: number
  /** Receita da venda dos Robux líquidos. */
  revenueBRL: number
  extraCostsBRL: number
  profitBRL: number
  /** Lucro sobre custo. */
  roi: number | null
  /** Lucro sobre receita. */
  margin: number | null
  /** Lucro por 1.000 Robux brutos investidos. */
  profitPer1kBRL: number | null
  /** Capital necessário = custo + custos adicionais. */
  capitalRequiredBRL: number
  /** Contas necessárias para movimentar os Robux líquidos no mês. */
  accountsNeeded: number
  /** Preço máximo por 1k que ainda dá lucro. Serve de teto de negociação. */
  breakEvenBuyPricePer1k: number | null
}

export function resolveParams(overrides?: Partial<OperationParams>): OperationParams {
  return {
    robloxFeePct: overrides?.robloxFeePct ?? OPERATION_DEFAULTS.robloxFeePct,
    buyPricePer1k: overrides?.buyPricePer1k ?? OPERATION_DEFAULTS.buyPricePer1k,
    sellPricePer1k: overrides?.sellPricePer1k ?? OPERATION_DEFAULTS.sellPricePer1k,
    robuxLimitPerAccount:
      overrides?.robuxLimitPerAccount ?? OPERATION_DEFAULTS.robuxLimitPerAccount,
    extraCostsBRL: overrides?.extraCostsBRL ?? OPERATION_DEFAULTS.extraCostsBRL,
  }
}

export function simulate(input: SimulationInput): SimulationResult {
  const params = resolveParams(input.params)
  const grossRobux = Math.max(0, input.grossRobux)

  const feeRobux = grossRobux * params.robloxFeePct
  const netRobux = grossRobux - feeRobux

  const costBRL = (grossRobux / 1000) * params.buyPricePer1k
  const revenueBRL = (netRobux / 1000) * params.sellPricePer1k
  const extraCostsBRL = params.extraCostsBRL

  const profitBRL = revenueBRL - costBRL - extraCostsBRL
  const capitalRequiredBRL = costBRL + extraCostsBRL

  /**
   * Preço máximo de compra que ainda empata.
   *
   * É o número mais acionável do simulador: em vez de "esta operação dá 60% de
   * ROI", responde "posso pagar até R$ X por 1k e ainda não perco dinheiro".
   */
  const breakEvenBuyPricePer1k =
    grossRobux > 0
      ? ((revenueBRL - extraCostsBRL) / (grossRobux / 1000))
      : null

  return {
    params,
    grossRobux,
    netRobux,
    feeRobux,
    costBRL,
    revenueBRL,
    extraCostsBRL,
    profitBRL,
    roi: costBRL > 0 ? profitBRL / costBRL : null,
    margin: revenueBRL > 0 ? profitBRL / revenueBRL : null,
    profitPer1kBRL: grossRobux > 0 ? profitBRL / (grossRobux / 1000) : null,
    capitalRequiredBRL,
    // Teto, não média: 10.010 Robux com limite de 10.000 por conta exige duas
    // contas, mesmo que a segunda movimente só 10 Robux.
    accountsNeeded:
      params.robuxLimitPerAccount > 0
        ? Math.ceil(netRobux / params.robuxLimitPerAccount)
        : 0,
    breakEvenBuyPricePer1k,
  }
}

/**
 * Planeja quanto dá para operar com um capital disponível.
 *
 * Responde à pergunta invertida: em vez de "quanto lucro este lote dá", diz
 * "com R$ 3.500 em caixa, que volume consigo girar e quantas contas preciso".
 */
export type CapacityInput = {
  capitalBRL: number
  params?: Partial<OperationParams>
}

export type CapacityResult = {
  params: OperationParams
  capitalBRL: number
  /** Robux brutos que o capital compra. */
  affordableGrossRobux: number
  affordableNetRobux: number
  accountsNeeded: number
  projectedRevenueBRL: number
  projectedProfitBRL: number
  roi: number | null
  /** Quantos lotes do tamanho-alvo cabem no capital. */
  batchesAffordable: number
  batchTargetGrossRobux: number
}

export function planCapacity(input: CapacityInput): CapacityResult {
  const params = resolveParams(input.params)
  const capitalBRL = Math.max(0, input.capitalBRL)

  const affordableGrossRobux =
    params.buyPricePer1k > 0 ? (capitalBRL / params.buyPricePer1k) * 1000 : 0

  const simulation = simulate({ grossRobux: affordableGrossRobux, params })

  /**
   * Tamanho do lote que satura exatamente uma conta.
   *
   * Sai do limite por conta: se cabem 10.000 Robux líquidos por conta e a taxa
   * é 30%, o lote bruto ideal é 10.000 / 0,70 = 14.286. É de onde vem o
   * número-alvo que o montador de lotes persegue.
   */
  const batchTargetGrossRobux =
    params.robloxFeePct < 1
      ? params.robuxLimitPerAccount / (1 - params.robloxFeePct)
      : 0

  return {
    params,
    capitalBRL,
    affordableGrossRobux,
    affordableNetRobux: simulation.netRobux,
    accountsNeeded: simulation.accountsNeeded,
    projectedRevenueBRL: simulation.revenueBRL,
    projectedProfitBRL: simulation.profitBRL,
    roi: simulation.roi,
    batchesAffordable:
      batchTargetGrossRobux > 0
        ? Math.floor(affordableGrossRobux / batchTargetGrossRobux)
        : 0,
    batchTargetGrossRobux,
  }
}
