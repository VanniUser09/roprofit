import { scoped } from "../../lib/log"
import { finishRun, startRun } from "../repository/metrics"

/**
 * Envelope comum de todo coletor.
 *
 * Garante três coisas que ninguém lembra de fazer à mão em cada coletor:
 * o registro em `collector_runs` mesmo quando a execução explode, a contagem
 * de erros agrupada por mensagem (em vez de 200 linhas iguais no log), e o
 * status `partial` — que é o caso mais comum de verdade: a coleta funcionou
 * para 190 de 200 itens.
 */

export type RunContext = {
  /** Contadores que o coletor incrementa conforme processa. */
  processed: number
  written: number
  requests: number
  quotaRemaining: number | null
  note: (text: string) => void
  fail: (error: unknown) => void
}

export async function runCollector(
  name: string,
  body: (ctx: RunContext) => Promise<void>
): Promise<void> {
  const log = scoped(`collector.${name}`)
  const startedMs = Date.now()
  const runId = await startRun(name)

  // Agrupa por mensagem: 200 falhas iguais viram uma linha com count 200.
  const errors = new Map<string, number>()
  const notes: string[] = []

  const ctx: RunContext = {
    processed: 0,
    written: 0,
    requests: 0,
    quotaRemaining: null,
    note: (text) => notes.push(text),
    fail: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      errors.set(message, (errors.get(message) ?? 0) + 1)
    },
  }

  let status: "ok" | "partial" | "error" = "ok"

  try {
    await body(ctx)
    if (errors.size > 0) status = "partial"
  } catch (error) {
    status = "error"
    ctx.fail(error)
    log.error("coletor abortou", error)
  } finally {
    await finishRun(runId, {
      startedMs,
      status,
      itemsProcessed: ctx.processed,
      itemsWritten: ctx.written,
      requestCount: ctx.requests,
      quotaRemaining: ctx.quotaRemaining,
      errors: [...errors].map(([message, count]) => ({ message, count })),
      notes: notes.join(" · ") || null,
    })

    log.info("execução concluída", {
      status,
      processados: ctx.processed,
      gravados: ctx.written,
      requisicoes: ctx.requests,
      duracaoMs: Date.now() - startedMs,
      cotaRestante: ctx.quotaRemaining,
    })
  }
}

/**
 * Reserva de tempo antes do timeout da Function.
 *
 * Um coletor que estoura o limite morre sem gravar o `finishRun`, e a página de
 * saúde mostra "running" para sempre. Melhor parar cedo e deixar a próxima
 * execução continuar de onde parou — é para isso que os repositórios ordenam
 * por `checkedAt`.
 */
export function deadline(timeoutSeconds: number, reserveSeconds = 30) {
  const stopAt = Date.now() + (timeoutSeconds - reserveSeconds) * 1000
  return {
    reached: () => Date.now() >= stopAt,
    remainingMs: () => Math.max(0, stopAt - Date.now()),
  }
}
