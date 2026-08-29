import { HTTP, type RateLimitHost } from "../../config"
import { bucketFor, QuotaExhaustedError, sleep } from "./rate-limiter"
import { scoped } from "../../lib/log"

const log = scoped("sources.http")

export class HttpError extends Error {
  status: number
  body: string

  constructor(status: number, body: string, url: string) {
    super(`HTTP ${status} em ${url}`)
    this.name = "HttpError"
    this.status = status
    this.body = body
  }
}

export type FetchResult<T> = {
  data: T
  /** Lido de x-ratelimit-remaining. Deixa o coletor desacelerar antes do teto. */
  quotaRemaining: number | null
}

type RequestOptions = {
  host: RateLimitHost
  url: string
  method?: "GET" | "POST"
  body?: unknown
  /** 404 e 400 costumam significar "item sem mercado", não falha de rede. */
  treatAsEmpty?: number[]
}

/**
 * Cliente HTTP único de todas as fontes externas.
 *
 * Concentra rate limit, retry com backoff e leitura da cota. Nenhum source
 * chama fetch direto — se cada um tivesse seu próprio retry, a soma deles
 * estouraria o limite que o bucket tenta respeitar.
 */
export async function request<T>(options: RequestOptions): Promise<FetchResult<T> | null> {
  const { host, url, method = "GET", body, treatAsEmpty = [] } = options
  const bucket = bucketFor(host)

  let lastError: unknown

  for (let attempt = 0; attempt <= HTTP.maxRetries; attempt++) {
    await bucket.take()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HTTP.timeoutMs)

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "User-Agent": HTTP.userAgent,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      const quotaRemaining = parseQuota(response.headers.get("x-ratelimit-remaining"))

      if (treatAsEmpty.includes(response.status)) return null

      // 429 e 5xx são transitórios: vale reptar. 4xx restante é erro nosso.
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("retry-after")) * 1000
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoff(attempt)
        log.warn("resposta transitória, aguardando", {
          url,
          status: response.status,
          waitMs: wait,
          attempt,
        })
        await sleep(wait)
        lastError = new HttpError(response.status, "", url)
        continue
      }

      if (!response.ok) {
        throw new HttpError(response.status, (await response.text()).slice(0, 300), url)
      }

      return { data: (await response.json()) as T, quotaRemaining }
    } catch (error) {
      if (error instanceof QuotaExhaustedError) throw error
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) throw error

      lastError = error
      if (attempt < HTTP.maxRetries) {
        const wait = backoff(attempt)
        log.warn("falha de rede, repetindo", { url, waitMs: wait, attempt })
        await sleep(wait)
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Falha ao chamar ${url}`)
}

/** Backoff exponencial com jitter: sem o jitter, coletores paralelos repetem juntos. */
function backoff(attempt: number) {
  const base = Math.min(HTTP.retryMaxMs, HTTP.retryBaseMs * 2 ** attempt)
  return Math.round(base * (0.7 + Math.random() * 0.6))
}

/** O header vem como "59, 70000": limite da janela e limite diário. */
function parseQuota(header: string | null): number | null {
  if (!header) return null
  const first = Number(header.split(",")[0]?.trim())
  return Number.isFinite(first) ? first : null
}
