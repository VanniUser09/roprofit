import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Pool, types, type PoolClient, type QueryResultRow } from "pg"

import { scoped } from "../lib/log"

const log = scoped("db")

/**
 * Camada de acesso ao Postgres.
 *
 * Substitui `lib/firebase.ts` no lado do banco. É a ÚNICA parte do sistema que
 * conhece `pg` — os repositórios usam `query`/`tx`, nunca o Pool direto, do
 * mesmo jeito que antes só o repositório conhecia o Firestore.
 */

// BIGINT chega do driver como string (pode passar de 2^53). Aqui os valores são
// preços e contagens de Robux, todos bem dentro do alcance seguro de Number, e
// o resto do código espera number — então convertemos na borda, uma vez só.
types.setTypeParser(20, (value) => (value === null ? null : Number(value)))
// NUMERIC idem, por segurança, caso alguma agregação retorne o tipo.
types.setTypeParser(1700, (value) => (value === null ? null : Number(value)))

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Defaults conservadores para a VPS Always-Free (1–2 vCPU): um punhado de
  // conexões basta, e segurar muitas ociosas só consome memória do Postgres.
  max: Number(process.env.PG_POOL_MAX ?? 8),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (error) => {
  // Erro numa conexão ociosa não deve derrubar o processo — o pool a recria.
  log.error("erro em conexão ociosa do pool", error)
})

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[])
  return result.rows
}

/** Uma linha ou null — para lookups por chave. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

/**
 * Executa dentro de uma transação, com rollback automático em erro.
 *
 * Os coletores gravam em lote (upsert de milhares de linhas); fazer isso numa
 * transação torna cada ciclo atômico — o painel nunca lê um catálogo metade
 * antigo, metade novo.
 */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/**
 * Aplica o schema. Idempotente (tudo é IF NOT EXISTS), então roda a cada boot
 * sem risco — o que dispensa uma etapa de migração manual no deploy.
 */
export async function migrate(): Promise<void> {
  // __dirname funciona no bundle CommonJS; o schema.sql é copiado para dist/db/
  // ao lado do pool.js pelo script de build.
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8")
  await pool.query(schema)
  log.info("schema aplicado")
}

export async function healthy(): Promise<boolean> {
  try {
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
  }
}

export async function close(): Promise<void> {
  await pool.end()
}
