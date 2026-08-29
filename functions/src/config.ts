/**
 * Parâmetros de operação do módulo de Market Intelligence.
 *
 * Tudo que um humano pode querer ajustar mora aqui. Os limites de taxa vieram
 * dos headers `x-ratelimit-*` das respostas reais das APIs (sondagem de
 * 28/08/2026), não de documentação de terceiros — por isso o comentário ao lado
 * de cada um diz o valor anunciado e o que usamos de fato.
 */

/** Região das Functions. São Paulo: menor latência para o time no Brasil. */
export const REGION = "southamerica-east1" as const

export const HTTP = {
  /** Identifica a RoProfit nos logs das APIs de terceiros. Não é disfarce. */
  userAgent: "RoProfit-MarketIntelligence/1.0 (+https://roprofit.app)",
  timeoutMs: 20_000,
  maxRetries: 3,
  /** Backoff exponencial com teto, para não segurar a Function até o timeout. */
  retryBaseMs: 800,
  retryMaxMs: 15_000,
} as const

/**
 * Um bucket por host.
 *
 * `perMinute` fica em ~80% do limite anunciado: o header conta a janela do lado
 * deles, e uma rajada nossa no fim da janela estoura.
 *
 * `burst` é o teto de créditos acumulados. Sem ele o bucket começa cheio e a
 * primeira coisa que um coletor faz é disparar `perMinute` requisições de uma
 * vez — foi exatamente assim que o catalog nos devolveu 429 já no oitavo item,
 * mesmo com a média por minuto dentro do limite. Para host sensível a rajada,
 * `burst: 1` força espaçamento uniforme desde a primeira chamada.
 */
export const RATE_LIMITS = {
  /** Anunciado: 60/60s + 70.000/dia. Endpoint em lote, tolera rajada moderada. */
  "apis.roblox.com/marketplace-items": { perMinute: 48, perDay: 60_000, burst: 8 },
  /** Anunciado: 50/60s + 70.000/dia. Compartilha a cota diária com o de cima. */
  "apis.roblox.com/marketplace-sales": { perMinute: 40, perDay: 60_000, burst: 8 },
  /**
   * Sem header de limite. Na prática devolve 429 com poucas requisições
   * seguidas, independentemente da média — por isso ritmo estritamente
   * uniforme (burst 1) e teto conservador.
   */
  "catalog.roblox.com": { perMinute: 12, perDay: 20_000, burst: 1 },
  /** Anunciado: 50/s. Sobra de folga porque só usamos em lote. */
  "thumbnails.roblox.com": { perMinute: 120, perDay: 20_000, burst: 20 },
  /** Documentado: 1/min. robots.txt pede Crawl-delay 2. Respeitamos o pior caso. */
  "rolimons.com": { perMinute: 1, perDay: 1_440, burst: 1 },
} as const

export type RateLimitHost = keyof typeof RATE_LIMITS

export const COLLECTION = {
  /** `marketplace-items/details` aceita lote; 100 é o tamanho que validamos. */
  marketplaceItemsBatchSize: 100,
  /** Itens por execução do backfill de CIIID, limitado pelo 429 do catalog. */
  mappingBatchSize: 20,
  /** Teto do Tier A. Mantém o orçamento diário de requisições previsível. */
  tierAMaxItems: 250,
  /** Faixa de preço da operação: é de onde saem os lotes de ~14.300 Robux. */
  tierAPriceMin: 500,
  tierAPriceMax: 40_000,
  /** Item sem venda recente não vira Tier A por mais bonito que seja o RAP. */
  tierARequiresSaleWithinDays: 7,
  /** Retenção dos snapshots intradiários. Os diários são permanentes. */
  snapshotTtlDays: 90,
  collectorRunTtlDays: 30,
} as const

/**
 * Pesos do Liquidity Score (v1). Somam 100.
 *
 * Estes números são um ponto de partida defensável, não uma verdade calibrada:
 * a calibração real depende do histórico que ainda vamos acumular. Ver
 * `liquidity/score.ts` para o racional de cada componente.
 */
export const LIQUIDITY_WEIGHTS = {
  velocity: 30,
  consistency: 20,
  bookDepth: 15,
  stability: 15,
  spread: 10,
  scale: 10,
} as const

export const LIQUIDITY_TUNING = {
  /** Vendas/dia que saturam o componente de velocidade em 100. */
  velocitySaturation: 30,
  /** Janela da consistência: fração de dias com ao menos uma venda. */
  consistencyWindowDays: 30,
  /** Ofertas dentro de +10% da mínima que saturam a profundidade em 100. */
  bookDepthSaturation: 10,
  bookDepthBandPct: 0.10,
  /** Gap entre 1ª e 2ª oferta que zera o componente de spread. */
  spreadCeiling: 0.15,
  /** Cópias em circulação que saturam a escala em 100. */
  scaleSaturation: 5_000,
  /** Multiplicador quando o Rolimon's marca o item como "projected". */
  projectedPenalty: 0.5,
  /** Dias de histórico PRÓPRIO para o score valer 100% da confiança. */
  confidenceRampDays: 14,
} as const

/**
 * Defaults do simulador. São valores de formulário, nunca constantes de cálculo:
 * o admin edita cada um e a preferência fica salva por usuário.
 */
export const OPERATION_DEFAULTS = {
  /** Taxa da Roblox na revenda de Limiteds. */
  robloxFeePct: 0.30,
  /** Limite de movimentação de Robux por conta, por mês. */
  robuxLimitPerAccount: 10_000,
  /** R$ por 1k Robux na compra. */
  buyPricePer1k: 17,
  /** R$ por 1k Robux na venda. */
  sellPricePer1k: 39,
  /** Custos adicionais por operação (taxa de gateway etc.), em R$. */
  extraCostsBRL: 0,
} as const

export const BATCH_BUILDER = {
  /** Tolerância padrão em torno do alvo de Robux brutos. */
  tolerancePct: 0.03,
  minItems: 4,
  maxItems: 8,
  /** Discretização dos preços para a programação dinâmica, em Robux. */
  bucketSize: 100,
  /** Quantas combinações distintas devolver. */
  resultCount: 10,
  /** Pesos do objetivo. Somam 1. */
  objective: {
    liquidity: 0.45,
    discount: 0.25,
    consistency: 0.15,
    stability: 0.15,
  },
} as const

export const API = {
  /** Cache das respostas de leitura. Os coletores rodam a cada 15 min. */
  cacheTtlSeconds: 60,
  /** Rate limit por administrador, para conter script solto no painel. */
  requestsPerMinutePerUser: 120,
}

/**
 * E-mails autorizados a receber a claim de admin no bootstrap.
 * Definido via `firebase functions:config` ou variável de ambiente —
 * nunca commitado.
 */
export function bootstrapAdminEmails(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}
