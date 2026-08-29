/**
 * Sobe o backend inteiro localmente sem Postgres externo nem Docker.
 *
 * Usa PGlite servido por um socket TCP: o driver `pg` conecta nele como se
 * fosse um Postgres de verdade (é o mesmo motor). Os dados ficam num arquivo
 * em ./.localdb, então reiniciar não perde o que já coletou.
 *
 * Uso: node scripts/local-dev.mjs
 */
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"

const PORT = 5544

const db = await PGlite.create("./.localdb")
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" })
await server.start()
console.log(`[local-dev] Postgres embarcado (PGlite) escutando em 127.0.0.1:${PORT}`)

// Aponta o backend para esse Postgres e sobe o app no mesmo processo.
process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`
// PGlite-socket atende UMA conexão por vez, então o pool usa exatamente uma.
process.env.PG_POOL_MAX = "1"
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "roprofit"
// Quem loga com este e-mail vira admin no primeiro acesso.
process.env.ADMIN_BOOTSTRAP_EMAILS =
  process.env.ADMIN_BOOTSTRAP_EMAILS || "marlon@athaydeadvogados.com.br,gabrielvanni52@gmail.com"
// Puxa dados assim que sobe, para o painel não ficar vazio.
process.env.WARMUP = process.env.WARMUP || "true"
process.env.PORT = process.env.PORT || "8080"

// Importa o backend já compilado (dist), que faz migrate + listen + cron.
await import("../dist/index.js")

const shutdown = async () => {
  await server.stop()
  await db.close()
  process.exit(0)
}
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
