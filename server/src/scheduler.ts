import cron from "node-cron"

import { COLLECTION } from "./config"
import { scoped } from "./lib/log"
import { evaluateAlerts } from "./market/alerts/evaluate"
import { backfillCollectibleIds, collectRolimons } from "./market/collectors/catalog"
import {
  collectDailySales,
  collectMarketplaceItems,
  collectResellers,
} from "./market/collectors/market"
import { computeMetrics } from "./market/collectors/metrics"
import { rebuildTiers } from "./market/collectors/tiers"
import { pruneSnapshots } from "./market/repository/limiteds"
import { pruneRuns } from "./market/repository/metrics"

const log = scoped("scheduler")

/**
 * Agendador — substitui os onSchedule das Cloud Functions por node-cron.
 *
 * A cadência de cada coletor é a mesma de antes (vem da taxa real de mudança da
 * fonte, ver config.ts), então a migração não altera o comportamento de coleta.
 * Diferença de operação: aqui os jobs rodam DENTRO deste processo, no fuso de
 * São Paulo, e há um trava simples contra sobreposição — se um ciclo demora
 * mais que o intervalo, o próximo é pulado em vez de rodar em cima do anterior.
 */

const TZ = "America/Sao_Paulo"

/** Impede que o mesmo job rode duas vezes ao mesmo tempo. */
const running = new Set<string>()

function job(name: string, expr: string, fn: () => Promise<void>) {
  cron.schedule(
    expr,
    async () => {
      if (running.has(name)) {
        log.warn("ciclo anterior ainda em execução, pulando", { job: name })
        return
      }
      running.add(name)
      try {
        await fn()
      } catch (error) {
        // runCollector já registra o erro em collector_runs; aqui é só a rede
        // de segurança para o job não derrubar o processo inteiro.
        log.error("job falhou", error, { job: name })
      } finally {
        running.delete(name)
      }
    },
    { timezone: TZ }
  )
  log.info("job agendado", { job: name, expr })
}

export function startScheduler(): void {
  // Descoberta do catálogo + Value/Demand. A fonte limita a 1 req/min.
  job("collectRolimons", "*/10 * * * *", collectRolimons)

  // Lote barato: 26 requisições cobrem ~2.500 itens.
  job("collectMarketplaceItems", "*/15 * * * *", collectMarketplaceItems)

  // Book do Tier A — a janela intradiária que a fonte diária não dá.
  job("collectResellers", "*/15 * * * *", collectResellers)

  // A fonte é diária: buscar de hora em hora traria o mesmo número.
  job("collectDailySales", "0 */6 * * *", collectDailySales)

  // Fila priorizada de mapeamento. Roda sempre, processa pouco por vez.
  job("backfillCollectibleIds", "* * * * *", backfillCollectibleIds)

  // Analytics + Liquidity Engine.
  job("computeMetrics", "*/15 * * * *", computeMetrics)

  // Reavalia quem merece coleta de alta cadência.
  job("rebuildTiers", "0 4 * * *", rebuildTiers)

  // Aplica as regras de alerta.
  job("evaluateAlerts", "*/15 * * * *", evaluateAlerts)

  // Retenção: o que o TTL do Firestore fazia sozinho, aqui é um DELETE diário.
  job("prune", "30 4 * * *", async () => {
    const snaps = await pruneSnapshots(COLLECTION.snapshotTtlDays)
    const runs = await pruneRuns(COLLECTION.collectorRunTtlDays)
    log.info("retenção aplicada", { snapshotsRemovidos: snaps, execucoesRemovidas: runs })
  })
}

/**
 * Dispara uma vez, na subida, os coletores que fazem o painel sair do zero —
 * sem esperar o primeiro tick do cron. Sequencial e tolerante: uma falha aqui
 * não impede o processo de servir a API.
 */
export async function warmup(): Promise<void> {
  const steps: [string, () => Promise<void>][] = [
    ["collectRolimons", collectRolimons],
    ["backfillCollectibleIds", backfillCollectibleIds],
    ["collectMarketplaceItems", collectMarketplaceItems],
    ["computeMetrics", computeMetrics],
  ]
  for (const [name, fn] of steps) {
    try {
      await fn()
    } catch (error) {
      log.error("warmup falhou", error, { step: name })
    }
  }
}
