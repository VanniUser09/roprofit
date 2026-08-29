import type { Request, Response, NextFunction } from "express"

import { auth, db, FieldValue, Timestamp } from "../../lib/firebase"
import { API } from "../../config"
import { scoped } from "../../lib/log"

const log = scoped("api.guard")

export type AdminRequest = Request & {
  admin: { uid: string; email: string | null }
}

/**
 * Janela de rate limit em memória, por instância de Function.
 * Não é um limite global — é um freio contra script solto no painel, e para
 * isso a aproximação por instância basta. O limite que protege as APIs
 * externas de verdade é o dos coletores, que rodam em execução única.
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
 * Portão único de todo endpoint deste módulo.
 *
 * Verifica o ID token, exige a custom claim `role === "admin"` e audita o
 * acesso. Esconder o menu no frontend não protege nada; esta função é a
 * barreira real. `checkRevoked` faz a verificação custar uma leitura a mais,
 * mas garante que revogar um admin tenha efeito imediato em vez de esperar
 * o token expirar em uma hora.
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

      let decoded
      try {
        decoded = await auth.verifyIdToken(token, true)
      } catch {
        res.status(401).json({ error: "Sessão expirada. Entre novamente." })
        return
      }

      if (decoded.role !== "admin") {
        log.warn("acesso negado", { uid: decoded.uid, path: req.path })
        // 404 em vez de 403: para quem não é admin, este módulo não existe.
        res.status(404).json({ error: "Não encontrado." })
        return
      }

      if (overRateLimit(decoded.uid)) {
        res.status(429).json({ error: "Muitas requisições. Aguarde um instante." })
        return
      }

      const adminReq = req as AdminRequest
      adminReq.admin = { uid: decoded.uid, email: decoded.email ?? null }

      void audit(adminReq)
      await handler(adminReq, res)
    } catch (error) {
      next(error)
    }
  }
}

/** Registro de acesso. Best-effort: nunca derruba a requisição do admin. */
async function audit(req: AdminRequest) {
  try {
    await db.collection("admin_audit").add({
      uid: req.admin.uid,
      email: req.admin.email,
      method: req.method,
      path: req.path,
      query: req.query ?? {},
      ip: req.headers["x-forwarded-for"] ?? null,
      at: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 180 * 86_400_000),
    })
  } catch (error) {
    log.warn("falha ao auditar", { error: String(error) })
  }
}
