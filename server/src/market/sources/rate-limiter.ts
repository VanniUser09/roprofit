import { RATE_LIMITS, type RateLimitHost } from "../../config"

/**
 * Token bucket por host, com refil contínuo.
 *
 * Por que contínuo e não janela fixa: com janela fixa, 40 requisições no
 * segundo 59 e mais 40 no segundo 61 passam pelo nosso contador mas caem na
 * mesma janela do lado deles, e tomamos 429. O refil contínuo espalha.
 *
 * O estado vive na instância da Function. Os coletores rodam em execução
 * agendada única, então na prática há um bucket por host por execução — que é
 * exatamente o escopo que precisa ser limitado.
 */
class TokenBucket {
  private tokens: number
  private lastRefill = Date.now()
  private dayCount = 0
  private dayResetAt = startOfNextUtcDay()

  constructor(
    private readonly perMinute: number,
    private readonly perDay: number,
    /** Teto de créditos acumulados. Limita o tamanho da rajada inicial. */
    private readonly burst: number
  ) {
    // Começa com UM crédito, não com o balde cheio: senão a primeira ação de
    // um coletor é disparar `burst` requisições simultâneas e tomar 429 antes
    // de a média por minuto sequer importar.
    this.tokens = 1
  }

  private refill() {
    const now = Date.now()
    const elapsedMs = now - this.lastRefill
    if (elapsedMs > 0) {
      this.tokens = Math.min(this.burst, this.tokens + (elapsedMs / 60_000) * this.perMinute)
      this.lastRefill = now
    }
    if (now >= this.dayResetAt) {
      this.dayCount = 0
      this.dayResetAt = startOfNextUtcDay()
    }
  }

  /** Espera até haver crédito. Lança se a cota diária acabou. */
  async take(): Promise<void> {
    this.refill()

    if (this.dayCount >= this.perDay) {
      throw new QuotaExhaustedError(
        `Cota diária esgotada (${this.perDay}). Reinicia em ${new Date(this.dayResetAt).toISOString()}.`
      )
    }

    if (this.tokens < 1) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.perMinute) * 60_000)
      await sleep(waitMs)
      this.refill()
    }

    this.tokens -= 1
    this.dayCount += 1
  }

  get dayRemaining() {
    return Math.max(0, this.perDay - this.dayCount)
  }
}

export class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "QuotaExhaustedError"
  }
}

const buckets = new Map<RateLimitHost, TokenBucket>()

export function bucketFor(host: RateLimitHost): TokenBucket {
  let bucket = buckets.get(host)
  if (!bucket) {
    const limit = RATE_LIMITS[host]
    bucket = new TokenBucket(limit.perMinute, limit.perDay, limit.burst)
    buckets.set(host, bucket)
  }
  return bucket
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

function startOfNextUtcDay() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}
