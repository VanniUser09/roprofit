import { buildApp } from "./app"
import { close, healthy, migrate } from "./db/pool"
import { scoped } from "./lib/log"
import { startScheduler, warmup } from "./scheduler"

/**
 * Ponto de entrada do backend self-hosted.
 *
 * Um processo Node faz tudo que antes eram 9 Cloud Functions + Cloud Scheduler:
 * aplica o schema, serve a API e roda os coletores agendados. É o que sobe na
 * VPS Always-Free.
 */

const log = scoped("boot")
const PORT = Number(process.env.PORT ?? 8080)

async function main() {
  if (!process.env.DATABASE_URL) {
    log.error("DATABASE_URL não definida — configure a conexão do Postgres")
    process.exit(1)
  }

  if (!(await healthy())) {
    log.error("Postgres inacessível na subida", undefined, { url: mask(process.env.DATABASE_URL) })
    process.exit(1)
  }

  await migrate()

  const app = buildApp()
  const server = app.listen(PORT, () => log.info("API no ar", { port: PORT }))

  // Coletores só quando explicitamente ligados. Assim dá para rodar uma
  // segunda instância só-API (atrás de um load balancer) sem duplicar coleta,
  // e para desligar a coleta em manutenção sem derrubar o painel.
  if (process.env.RUN_COLLECTORS !== "false") {
    startScheduler()
    if (process.env.WARMUP === "true") {
      log.info("warmup inicial disparado")
      void warmup()
    }
  } else {
    log.info("coletores desligados (RUN_COLLECTORS=false)")
  }

  // Encerramento limpo: o Docker manda SIGTERM ao reiniciar/atualizar. Fechar o
  // servidor e o pool evita conexões meio-abertas no Postgres.
  const shutdown = async (signal: string) => {
    log.info("encerrando", { signal })
    server.close()
    await close()
    process.exit(0)
  }
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

/** Esconde a senha na string de conexão antes de logar. */
function mask(url?: string): string {
  if (!url) return ""
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@")
}

main().catch((error) => {
  log.error("falha fatal na subida", error)
  process.exit(1)
})
