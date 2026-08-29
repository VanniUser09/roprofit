import { LIQUIDITY_TUNING, LIQUIDITY_WEIGHTS } from "../../config"
import { clamp, linearScale, logScale } from "../analytics/stats"
import type { LiquidityComponents } from "../types"

/**
 * Liquidity Score da RoProfit — v1.
 *
 * A pergunta que ele responde não é "qual Limited vale mais", e sim "qual eu
 * compro barato e revendo rápido". Por isso o componente de maior peso é
 * velocidade, e Value/Demand do Rolimon's nem entram como componente: são
 * opinião curada, útil como contexto, ruim como fundamento de um score.
 *
 * Os pesos abaixo são um ponto de partida defensável, não uma calibração. A
 * calibração real depende do histórico que ainda vamos acumular — e é
 * exatamente por isso que existe o fator de confiança.
 */

export type ScoreInput = {
  salesPerDay30d: number | null
  /** Fração de dias com venda em 30d. */
  activeDayRatio: number | null
  bookDepth10: number | null
  volatility30d: number | null
  spreadPct: number | null
  assetStock: number | null
  projected: boolean
  /** Dias distintos do NOSSO histórico. */
  historyDays: number
}

export type ScoreResult = {
  liquidityScore: number
  components: LiquidityComponents
  confidence: number
  /** Componentes sem dado, para o painel explicar um score baixo. */
  missing: (keyof LiquidityComponents)[]
}

export function computeLiquidityScore(input: ScoreInput): ScoreResult {
  const missing: (keyof LiquidityComponents)[] = []

  /**
   * Velocidade (peso 30) — vendas por dia.
   *
   * Escala logarítmica porque o que importa é proporcional: sair de 1 para 5
   * vendas/dia muda a tese de giro; de 25 para 30, quase nada. Satura em 30.
   */
  const velocity = valueOr(input.salesPerDay30d, "velocity", missing, (v) =>
    logScale(v, LIQUIDITY_TUNING.velocitySaturation)
  )

  /**
   * Consistência (peso 20) — fração de dias com venda.
   *
   * É o que separa quem vende 2 por dia todo dia de quem vendeu 60 num pico e
   * sumiu. Os dois têm a mesma média mensal e capital parado muito diferente.
   */
  const consistency = valueOr(input.activeDayRatio, "consistency", missing, (v) =>
    clamp(v * 100)
  )

  /**
   * Profundidade do book (peso 15) — ofertas até +10% da mínima.
   *
   * Mede se dá para SAIR do item. Um Limited com uma oferta a 10.000 e a
   * seguinte a 25.000 tem "preço 10.000" no papel e nenhuma liquidez real.
   */
  const bookDepth = valueOr(input.bookDepth10, "bookDepth", missing, (v) =>
    linearScale(v, LIQUIDITY_TUNING.bookDepthSaturation)
  )

  /**
   * Estabilidade (peso 15) — inverso da volatilidade.
   *
   * Preço errático destrói a margem planejada: comprar a 14.300 esperando
   * revender no mesmo patamar não funciona se a faixa oscila 40% na semana.
   */
  const stability = valueOr(input.volatility30d, "stability", missing, (v) =>
    clamp((1 - Math.min(1, v)) * 100)
  )

  /**
   * Spread (peso 10) — distância entre a 1ª e a 2ª oferta.
   *
   * Gap grande significa que a "mínima" é um vendedor solitário. Comprada essa
   * unidade, o preço de referência salta e a tese muda.
   */
  const spread = valueOr(input.spreadPct, "spread", missing, (v) =>
    clamp((1 - Math.min(1, Math.abs(v) / LIQUIDITY_TUNING.spreadCeiling)) * 100)
  )

  /**
   * Escala (peso 10) — cópias em circulação.
   *
   * Um item de 25 unidades nunca terá giro, por melhor que sejam os outros
   * números. Também log: 200 mil cópias não é dez vezes melhor que 20 mil.
   */
  const scale = valueOr(input.assetStock, "scale", missing, (v) =>
    logScale(v, LIQUIDITY_TUNING.scaleSaturation)
  )

  const components: LiquidityComponents = {
    velocity,
    consistency,
    bookDepth,
    stability,
    spread,
    scale,
  }

  /**
   * Média ponderada apenas sobre os componentes com dado.
   *
   * Tratar componente ausente como zero puniria um item recém-descoberto como
   * se ele fosse ilíquido — que é uma afirmação que não temos base para fazer.
   * A ausência de dado é tratada no fator de confiança, que é honesto sobre o
   * motivo, em vez de embutir a punição num componente e sumir com ela.
   */
  const present = (Object.keys(components) as (keyof LiquidityComponents)[]).filter(
    (key) => !missing.includes(key)
  )

  const totalWeight = present.reduce((sum, key) => sum + LIQUIDITY_WEIGHTS[key], 0)
  const weighted =
    totalWeight === 0
      ? 0
      : present.reduce((sum, key) => sum + components[key] * LIQUIDITY_WEIGHTS[key], 0) /
        totalWeight

  /**
   * Penalidade de "projected".
   *
   * Item marcado como projetado pelo Rolimon's tem preço inflado artificialmente
   * por manipulação. Pode até estar vendendo rápido; o problema é que o preço de
   * saída não se sustenta.
   */
  const projectedPenalty = input.projected ? LIQUIDITY_TUNING.projectedPenalty : 1

  /**
   * Confiança — honestidade sobre o próprio histórico.
   *
   * Sem semanas de coleta própria, tudo que temos é dado de terceiros e uma
   * janela curta. Em vez de exibir um score cheio que não merecemos, reduzimos
   * proporcionalmente e o painel diz por quê. É a diferença entre "score 40" e
   * "score 40 porque só temos 3 dias de observação".
   */
  const confidence = clamp(input.historyDays / LIQUIDITY_TUNING.confidenceRampDays, 0, 1)

  const liquidityScore = Math.round(clamp(weighted * projectedPenalty * confidence))

  return { liquidityScore, components, confidence, missing }
}

function valueOr(
  raw: number | null,
  key: keyof LiquidityComponents,
  missing: (keyof LiquidityComponents)[],
  transform: (value: number) => number
): number {
  if (raw === null || !Number.isFinite(raw)) {
    missing.push(key)
    return 0
  }
  return transform(raw)
}

/** Explica o score em texto, para o painel e para os alertas. */
export function explainScore(result: ScoreResult): string {
  const ranked = (Object.entries(result.components) as [keyof LiquidityComponents, number][])
    .filter(([key]) => !result.missing.includes(key))
    .sort((a, b) => b[1] - a[1])

  if (ranked.length === 0) return "Sem dados suficientes para pontuar."

  const labels: Record<keyof LiquidityComponents, string> = {
    velocity: "velocidade de venda",
    consistency: "consistência",
    bookDepth: "profundidade do book",
    stability: "estabilidade de preço",
    spread: "spread",
    scale: "escala",
  }

  const best = labels[ranked[0][0]]
  const worst = labels[ranked[ranked.length - 1][0]]
  const parts = [`Puxado por ${best}, limitado por ${worst}.`]

  if (result.confidence < 1) {
    parts.push(`Confiança em ${Math.round(result.confidence * 100)}% — histórico próprio ainda curto.`)
  }
  if (result.missing.length > 0) {
    parts.push(`Sem dado de: ${result.missing.map((key) => labels[key]).join(", ")}.`)
  }

  return parts.join(" ")
}
