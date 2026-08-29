import express from "express"

import { scoped } from "./lib/log"
import { evaluateAlerts, listAlerts, markAlertRead, markAllAlertsRead } from "./market/alerts/evaluate"
import { deleteRule, listRules, saveRule } from "./market/alerts/rules"
import { requireAdmin, requireUser } from "./market/api/admin-guard"
import * as handlers from "./market/api/handlers"
import { healthy } from "./db/pool"

const log = scoped("api")

/**
 * App Express — o mesmo roteador de antes, agora servido por um processo Node
 * comum (app.listen), não por uma Cloud Function. As rotas e o middleware de
 * admin são idênticos; só sumiu o embrulho onRequest.
 */
export function buildApp() {
  const app = express()
  app.use(express.json({ limit: "256kb" }))
  app.disable("x-powered-by")

  // Health check para o Docker/uptime: não exige auth, não toca dado sensível.
  app.get("/health", async (_req, res) => {
    res.status((await healthy()) ? 200 : 503).json({ ok: await healthy() })
  })

  // O frontend pergunta "sou admin?" aqui, já que o papel não vive mais no
  // token. Só exige estar logado.
  app.get(
    "/api/me",
    requireUser((req, res) => {
      res.json({ uid: req.user.uid, email: req.user.email, role: req.user.role })
    })
  )

  const base = "/api/admin/market"
  const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "")

  app.get(`${base}/overview`, requireAdmin(handlers.overview))
  app.get(`${base}/ranking`, requireAdmin(handlers.ranking))
  app.post(`${base}/opportunities`, requireAdmin(handlers.opportunities))
  app.get(`${base}/item/:assetId`, requireAdmin(handlers.itemDetail))
  app.post(`${base}/simulate`, requireAdmin(handlers.simulateOperation))
  app.post(`${base}/batches`, requireAdmin(handlers.batches))
  app.get(`${base}/collectors`, requireAdmin(handlers.collectors))

  app.get(
    `${base}/alerts`,
    requireAdmin(async (req, res) => {
      const [alerts, rules] = await Promise.all([
        listAlerts({ unreadOnly: req.query.unread === "true" }),
        listRules(),
      ])
      res.json({ alerts, rules })
    })
  )

  app.post(
    `${base}/alerts/:id/read`,
    requireAdmin(async (req, res) => {
      await markAlertRead(param(req.params.id))
      res.json({ ok: true })
    })
  )

  app.post(
    `${base}/alerts/read-all`,
    requireAdmin(async (_req, res) => {
      res.json({ ok: true, count: await markAllAlertsRead() })
    })
  )

  app.post(
    `${base}/alerts/evaluate`,
    requireAdmin(async (_req, res) => {
      // Botão "reavaliar agora" no painel, além do agendamento.
      await evaluateAlerts()
      res.json({ ok: true })
    })
  )

  app.post(
    `${base}/alert-rules`,
    requireAdmin(async (req, res) => {
      res.json({ ok: true, id: await saveRule(null, req.body) })
    })
  )

  app.patch(
    `${base}/alert-rules/:id`,
    requireAdmin(async (req, res) => {
      await saveRule(param(req.params.id), req.body)
      res.json({ ok: true })
    })
  )

  app.delete(
    `${base}/alert-rules/:id`,
    requireAdmin(async (req, res) => {
      await deleteRule(param(req.params.id))
      res.json({ ok: true })
    })
  )

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error("erro não tratado na API", error)
    res.status(500).json({ error: "Não foi possível processar a requisição." })
  })

  app.use((_req, res) => res.status(404).json({ error: "Não encontrado." }))

  return app
}
