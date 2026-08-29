/**
 * Cliente da API de Market Intelligence.
 *
 * Toda chamada leva o ID token no Authorization. Um não-admin recebe 404 do
 * servidor — a verificação real acontece lá, não aqui.
 */
import { auth } from "@/lib/firebase"

const BASE = import.meta.env.VITE_API_BASE_URL || "/api"

export class ApiError extends Error {
  // Propriedade declarada no corpo: `erasableSyntaxOnly` do tsconfig proíbe
  // parameter properties, porque elas não somem só apagando os tipos.
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function authHeader(): Promise<HeadersInit> {
  const user = auth.currentUser
  if (!user) throw new ApiError("Faça login para continuar.", 401)
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T

  const fallback =
    response.status === 404
      ? "Não encontrado."
      : response.status === 429
        ? "Muitas requisições. Aguarde um instante."
        : "Não foi possível carregar os dados."

  let message = fallback
  try {
    const body = (await response.json()) as { error?: string }
    if (body?.error) message = body.error
  } catch {
    // Resposta sem corpo JSON (proxy, gateway). Mantém a mensagem padrão.
  }
  throw new ApiError(message, response.status)
}

export async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const query = params
    ? "?" +
      new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)])
      )
    : ""
  const response = await fetch(`${BASE}${path}${query}`, { headers: await authHeader() })
  return parse<T>(response)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: await authHeader(),
    body: JSON.stringify(body ?? {}),
  })
  return parse<T>(response)
}

export async function apiSend<T>(
  method: "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: await authHeader(),
    body: body ? JSON.stringify(body) : undefined,
  })
  return parse<T>(response)
}
