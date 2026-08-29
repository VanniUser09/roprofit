/**
 * Estatística de apoio.
 *
 * Tudo aqui trata array vazio e valores nulos devolvendo `null` em vez de NaN.
 * NaN escapando para o Firestore vira um documento que o painel renderiza como
 * "—" sem ninguém entender por quê; `null` explícito é rastreável.
 */

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value))
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function median(values: number[]): number | null {
  return percentile(values, 50)
}

/**
 * Percentil por interpolação linear.
 *
 * Interpolar em vez de pegar o índice mais próximo importa aqui porque as
 * amostras são pequenas: com 8 intervalos entre vendas, o p25 "por índice"
 * pula de um valor para outro e a mediana esconde a assimetria.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  if (values.length === 1) return values[0]

  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const low = Math.floor(rank)
  const high = Math.ceil(rank)

  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

export function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null
  const avg = mean(values)!
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Coeficiente de variação: desvio dividido pela média.
 *
 * É a medida certa de volatilidade aqui porque é adimensional. Um desvio de
 * 500 Robux é ruído num item de 100 mil e caos num item de 2 mil — comparar
 * desvios brutos entre itens de faixas diferentes não diria nada.
 */
export function coefficientOfVariation(values: number[]): number | null {
  const avg = mean(values)
  const sd = standardDeviation(values)
  if (avg === null || sd === null || avg === 0) return null
  return sd / avg
}

export function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null
}

export function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null
}

export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0)
}

/**
 * Normalização logarítmica para 0–100.
 *
 * Usada onde a diferença que importa é proporcional, não absoluta: sair de 1
 * para 5 vendas por dia muda completamente a tese de giro; de 25 para 30, quase
 * nada. Uma escala linear daria o mesmo peso aos dois saltos.
 */
export function logScale(value: number, saturation: number): number {
  if (value <= 0) return 0
  return clamp((Math.log1p(value) / Math.log1p(saturation)) * 100)
}

export function linearScale(value: number, saturation: number): number {
  if (value <= 0) return 0
  return clamp((value / saturation) * 100)
}

/** Variação percentual. Devolve null quando a base é zero, não Infinity. */
export function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null
  return (to - from) / from
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Extrai os números válidos de uma série que pode ter buracos. */
export function compact<T>(items: T[], pick: (item: T) => number | null | undefined): number[] {
  const out: number[] = []
  for (const item of items) {
    const value = pick(item)
    if (isFiniteNumber(value)) out.push(value)
  }
  return out
}
