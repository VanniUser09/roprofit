import express from "express"
import { onRequest } from "firebase-functions/v2/https"
import { onSchedule } from "firebase-functions/v2/scheduler"

import { REGION } from "./config"
import { scoped } from "./lib/log"
import { evaluateAlerts, listAlerts, markAlertRead, markAllAlertsRead } from "./market/alerts/evaluate"
import { deleteRule, listRules, saveRule } from "./market/alerts/rules"
import { requireAdmin } from "./market/api/admin-guard"
import * as handlers from "./market/api/handlers"
import { backfillCollectibleIds, collectRolimons } from "./market/collectors/catalog"
import {
  collectDailySales,
  collectMarketplaceItems,
  collectResellers,
} from "./market/collectors/market"
import { computeMetrics } from "./market/collectors/metrics"
import { rebuildTiers } from "./market/collectors/tiers"

export { setUserRole } from "./market/api/roles"

const log = scoped("api")

// ─────────────────────────────────────────────────────────────────────────────
// API administrativa
//
// Um único Express atrás de uma Function. Toda rota passa por `requireAdmin`,
// que verifica o ID token, exige a claim e audita — nenhuma exceção, e nenhuma
// rota confia em o frontend ter escondido o menu.
// ─────────────────────────────────────────────────────────────────────────────

const app = express()
app.use(express.json({ limit: "256kb" }))
app.disable("x-powered-by")

const base = "/api/admin/market"

/**
 * Normaliza um parâmetro de rota.
 *
 * No Express 5 um parâmetro pode chegar como array quando a rota o repete.
 * Nenhuma rota daqui faz isso, mas o tipo permite — e tratar explicitamente é
 * melhor do que espalhar casts pelos handlers.
 */
function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}

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
    const count = await markAllAlertsRead()
    res.json({ ok: true, count })
  })
)

app.post(
  `${base}/alert-rules`,
  requireAdmin(async (req, res) => {
    const id = await saveRule(null, req.body)
    res.json({ ok: true, id })
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

// Handler de erro: mensagem genérica para fora, detalhe completo no log.
// Vazar stack trace numa API administrativa entrega estrutura interna de graça.
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("erro não tratado na API", error)
  res.status(500).json({ error: "Não foi possível processar a requisição." })
})

app.use((_req, res) => res.status(404).json({ error: "Não encontrado." }))

export const api = onRequest(
  { region: REGION, memory: "512MiB", timeoutSeconds: 60, cors: false },
  app
)

// ─────────────────────────────────────────────────────────────────────────────
// Coletores agendados
//
// A cadência de cada um vem da taxa real de mudança da fonte, não de um
// intervalo escolhido no chute. Ver a tabela em config.ts.
// ─────────────────────────────────────────────────────────────────────────────

const schedule = (cron: string, memory: "256MiB" | "512MiB" = "512MiB") => ({
  region: REGION,
  schedule: cron,
  timeZone: "America/Sao_Paulo",
  memory,
  timeoutSeconds: 540,
  retryCount: 1,
})

/** Descoberta do catálogo + Value/Demand. Limite da fonte: 1 req/min. */
export const scheduledRolimons = onSchedule(schedule("*/10 * * * *"), async () => {
  await collectRolimons()
})

/** Lote barato: 26 requisições cobrem ~2.500 itens. */
export const scheduledMarketplaceItems = onSchedule(schedule("*/15 * * * *"), async () => {
  await collectMarketplaceItems()
})

/** Book do Tier A — a janela intradiária que a fonte diária não dá. */
export const scheduledResellers = onSchedule(schedule("*/15 * * * *"), async () => {
  await collectResellers()
})

/** A fonte é diária: buscar de hora em hora traria o mesmo número. */
export const scheduledDailySales = onSchedule(schedule("0 */6 * * *"), async () => {
  await collectDailySales()
})

/** Fila priorizada de mapeamento. Roda sempre, processa pouco por vez. */
export const scheduledBackfill = onSchedule(schedule("* * * * *", "256MiB"), async () => {
  await backfillCollectibleIds()
})

/** Analytics + Liquidity Engine. */
export const scheduledMetrics = onSchedule(schedule("*/15 * * * *"), async () => {
  await computeMetrics()
})

/** Reavalia quem merece coleta de alta cadência. */
export const scheduledTiers = onSchedule(schedule("0 4 * * *"), async () => {
  await rebuildTiers()
})

export const scheduledAlerts = onSchedule(schedule("*/15 * * * *"), async () => {
  await evaluateAlerts()
})
