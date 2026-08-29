import type { Request, Response, NextFunction } from "express"

import { query } from "../../db/pool"
import { verifyRequestToken, type Principal } from "../../lib/auth"
import { API } from "../../config"
import { scoped } from "../../lib/log"

const log = scoped("api.guard")

export type AdminRequest = Request & { admin: Principal }

/**
 * Rate limit em memória, por processo.
 *
 * Freio contra script solto no painel, não limite global. O que protege as APIs
 * externas de verdade é o rate limiter dos coletores.
 */
const hits = new Map<string, { count: number; resetAt: number }>()

function overRateLimit(uid: string) {
  const now = Date.now()
  const entry = hits.get(uid)
  if (!entry || now > entry.resetAt) {
    hits.set(uid, { count: 1, resetAt: now + 60_000 })
    return false
  }
  entry.count += 1
  return entry.count > API.requestsPerMinutePerUser
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  return header.slice(7).trim() || null
}

/**
 * Portão de todo endpoint admin. Verifica o token, exige role admin (do
 * Postgres), aplica rate limit e audita. Quem não é admin recebe 404 — para
 * ele o módulo não existe.
 */
export function requireAdmin(
  handler: (req: AdminRequest, res: Response) => Promise<void> | void
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req)
      if (!token) {
        res.status(401).json({ error: "Faça login para continuar." })
        return
      }

      const principal = await verifyRequestToken(token)
      if (!principal) {
        res.status(401).json({ error: "Sessão expirada. Entre novamente." })
        return
      }

      if (principal.role !== "admin") {
        log.warn("acesso negado", { uid: principal.uid, path: req.path })
        res.status(404).json({ error: "Não encontrado." })
        return
      }

      if (overRateLimit(principal.uid)) {
        res.status(429).json({ error: "Muitas requisições. Aguarde um instante." })
        return
      }

      const adminReq = req as AdminRequest
      adminReq.admin = principal
      void audit(adminReq)
      await handler(adminReq, res)
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Exige apenas login (não admin). Serve o /api/me, para o frontend descobrir se
 * o usuário é admin sem depender de uma claim no token.
 */
export function requireUser(
  handler: (req: Request & { user: Principal }, res: Response) => Promise<void> | void
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = bearerToken(req)
      if (!token) {
        res.status(401).json({ error: "Faça login para continuar." })
        return
      }
      const principal = await verifyRequestToken(token)
      if (!principal) {
        res.status(401).json({ error: "Sessão expirada." })
        return
      }
      ;(req as Request & { user: Principal }).user = principal
      await handler(req as Request & { user: Principal }, res)
    } catch (error) {
      next(error)
    }
  }
}

/** Auditoria best-effort: nunca derruba a requisição do admin. */
async function audit(req: AdminRequest) {
  try {
    await query(
      `INSERT INTO admin_audit (uid, email, method, path, query, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.admin.uid,
        req.admin.email,
        req.method,
        req.path,
        JSON.stringify(req.query ?? {}),
        (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? null,
      ]
    )
  } catch (error) {
    log.warn("falha ao auditar", { error: String(error) })
  }
}
