/**
 * Filtro de sanidade de preço.
 *
 * Motivo concreto: o Domino Crown tem 25 unidades e a única oferta aberta está
 * a 68.686.868.686 Robux — um anúncio-piada, que ninguém pretende vender. Sem
 * filtro, esse número vira "preço atual" e o item aparece na página de
 * Oportunidades como estando 1.199.446% acima do RAP, no topo de qualquer
 * ordenação por variação.
 *
 * O critério é deliberadamente frouxo. Não é o nosso papel decidir qual preço é
 * "justo" — só descartar o que não é uma oferta real. Um Limited legitimamente
 * caro em relação ao RAP passa; um com 4 ordens de grandeza de diferença, não.
 */

/** Acima disso em relação ao RAP, a oferta não representa mercado. */
const MAX_RAP_MULTIPLE = 10

/** Abaixo disso, provavelmente é erro de digitação de quem anunciou. */
const MIN_RAP_MULTIPLE = 0.05

export type PriceSanity = {
  price: number | null
  /** Preenchido quando a oferta foi descartada — o painel mostra o motivo. */
  rejected: string | null
}

export function sanitizePrice(price: number | null, rap: number | null): PriceSanity {
  if (price === null || !Number.isFinite(price) || price <= 0) {
    return { price: null, rejected: null }
  }

  // Sem RAP não há régua. Melhor aceitar e sinalizar do que inventar um limite.
  if (rap === null || rap <= 0) return { price, rejected: null }

  const multiple = price / rap

  if (multiple > MAX_RAP_MULTIPLE) {
    return {
      price: null,
      rejected: `Oferta a ${Math.round(multiple)}× o RAP — anúncio sem intenção real de venda.`,
    }
  }

  if (multiple < MIN_RAP_MULTIPLE) {
    return {
      price: null,
      rejected: `Oferta a ${(multiple * 100).toFixed(1)}% do RAP — provável erro de anúncio.`,
    }
  }

  return { price, rejected: null }
}

/**
 * Aplica o mesmo critério ao book inteiro, do topo para baixo.
 *
 * Descartar só a primeira oferta não basta: um book com três anúncios-piada
 * seguidos deixaria o quarto virar "preço atual" com o mesmo problema.
 * Também protege o spread, que compara a 1ª com a 2ª oferta.
 */
export function sanitizeBook(prices: number[], rap: number | null): number[] {
  if (rap === null || rap <= 0) return prices
  return prices.filter((price) => sanitizePrice(price, rap).price !== null)
}
