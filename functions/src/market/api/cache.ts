import { API } from "../../config"

/**
 * Cache em memória por instância de Function.
 *
 * Os coletores rodam a cada 15 minutos; servir a mesma leitura de 2.500
 * documentos a cada request do painel seria pagar caro por dado que não mudou.
 * Sessenta segundos de TTL mantém o painel responsivo sem esconder atualização
 * relevante.
 *
 * Deduplica requisições concorrentes guardando a Promise, não o valor: dois
 * admins abrindo o Ranking ao mesmo tempo disparariam duas varreduras idênticas
 * se guardássemos só o resultado.
 */

type Entry<T> = { promise: Promise<T>; expiresAt: number }

const store = new Map<string, Entry<unknown>>()

export async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlSeconds = API.cacheTtlSeconds
): Promise<T> {
  const now = Date.now()
  const existing = store.get(key) as Entry<T> | undefined

  if (existing && existing.expiresAt > now) return existing.promise

  const promise = loader().catch((error) => {
    // Não deixa uma falha em cache: o próximo request deve tentar de novo.
    store.delete(key)
    throw error
  })

  store.set(key, { promise, expiresAt: now + ttlSeconds * 1000 })
  return promise
}

export function invalidate(prefix?: string) {
  if (!prefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}
