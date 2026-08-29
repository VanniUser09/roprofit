import { useCallback, useEffect, useRef, useState } from "react"

import { ApiError, apiGet, apiPost } from "@/lib/admin"

/**
 * Busca de dados do painel.
 *
 * Deliberadamente simples — sem react-query, que seria uma dependência nova
 * para um painel de sete telas com cache de 60s já no servidor. O que importa
 * aqui é não vazar estado entre requisições, que é o bug clássico: uma resposta
 * lenta chegando depois de uma rápida e sobrescrevendo o dado novo.
 *
 * O lint aponta `set-state-in-effect` no corpo dos efeitos abaixo. Aqui é o uso
 * legítimo da regra: a rede É o sistema externo com que estamos sincronizando,
 * e marcar "carregando" antes de disparar a requisição é parte dessa
 * sincronização, não estado derivado que daria para calcular na renderização.
 */

export type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useApiGet<T>(
  path: string | null,
  params?: Record<string, unknown>,
  options?: { refreshMs?: number }
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // Descarta resposta de requisição antiga: sem isto, a lenta sobrescreve a nova.
  const requestId = useRef(0)
  const serialized = JSON.stringify(params ?? {})

  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    setError(null)

    apiGet<T>(path, JSON.parse(serialized))
      .then((result) => {
        if (id !== requestId.current) return
        setData(result)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar os dados.")
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [path, serialized, nonce])

  // Atualização periódica: os coletores rodam a cada 15 min, então o padrão é
  // conservador de propósito — recarregar a cada poucos segundos só gastaria
  // leitura para receber o mesmo dado servido do cache.
  useEffect(() => {
    if (!options?.refreshMs || !path) return
    const timer = setInterval(() => setNonce((n) => n + 1), options.refreshMs)
    return () => clearInterval(timer)
  }, [options?.refreshMs, path])

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) }
}

export function useApiPost<T>(path: string, body: unknown, enabled = true): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const requestId = useRef(0)
  const serialized = JSON.stringify(body ?? {})

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const id = ++requestId.current
    setLoading(true)
    setError(null)

    apiPost<T>(path, JSON.parse(serialized))
      .then((result) => {
        if (id !== requestId.current) return
        setData(result)
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar os dados.")
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [path, serialized, enabled, nonce])

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) }
}

/**
 * Adia a atualização de um valor.
 *
 * Os filtros de Oportunidades disparam um POST a cada tecla sem isto — 12
 * requisições para digitar "sinister".
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
