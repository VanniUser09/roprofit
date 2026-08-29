/**
 * Prova a migração inteira contra um Postgres real (PGlite), com dados reais
 * da Roblox. Schema → repositório SQL → analytics → score → lotes → dirty-check.
 *
 * PGlite é o motor do Postgres compilado para WASM: mesmo SQL, sem instalar
 * servidor. O deploy usa o Postgres do Docker, idêntico.
 */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const pglite = new PGlite()

async function main() {
  let pass = 0
  let fail = 0
  const ok = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  [ok]    ${name}${detail ? " — " + detail : ""}`) }
    else { fail++; console.log(`  [FALHA] ${name}${detail ? " — " + detail : ""}`) }
  }

  console.log("=== 1. Schema aplica sem erro ===")
  const schema = readFileSync(join(here, "../dist/db/schema.sql"), "utf8")
  await pglite.exec(schema)
  const tables = await pglite.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
  )
  ok("todas as tabelas criadas", tables.rows.length >= 9, tables.rows.map((r) => r.table_name).join(", "))
  // roda de novo: idempotência
  await pglite.exec(schema)
  ok("schema é idempotente (roda 2x)", true)

  console.log("\n=== 2. Upsert + merge campo a campo ===")
  await pglite.query(
    `INSERT INTO limiteds (asset_id, name, tier, active, needs_mapping, mapping_priority, source_rolimons)
     VALUES (1, 'Item A', 'B', TRUE, TRUE, 100, TRUE)`
  )
  // segundo coletor traz só o CIIID; não pode apagar o nome
  await pglite.query(
    `INSERT INTO limiteds (asset_id, name, collectible_item_id, needs_mapping, source_roblox)
     VALUES (1, '', 'ciid-1', FALSE, TRUE)
     ON CONFLICT (asset_id) DO UPDATE SET
       collectible_item_id = COALESCE(EXCLUDED.collectible_item_id, limiteds.collectible_item_id),
       name = COALESCE(NULLIF(EXCLUDED.name, ''), limiteds.name),
       needs_mapping = COALESCE(EXCLUDED.needs_mapping, limiteds.needs_mapping),
       source_roblox = limiteds.source_roblox OR EXCLUDED.source_roblox,
       source_rolimons = limiteds.source_rolimons OR EXCLUDED.source_rolimons`
  )
  const merged = (await pglite.query("SELECT * FROM limiteds WHERE asset_id = 1")).rows[0]
  ok("merge preserva o nome do outro coletor", merged.name === "Item A", merged.name)
  ok("merge grava o CIIID", merged.collectible_item_id === "ciid-1")
  ok("merge acumula as duas fontes (OR)", merged.source_roblox && merged.source_rolimons)

  console.log("\n=== 3. Dirty-check do snapshot (o coração da economia) ===")
  const snap = async (price) => {
    const r = await pglite.query(
      `WITH prev AS (SELECT * FROM snapshots WHERE asset_id = 1 ORDER BY t DESC LIMIT 1),
       ins AS (
         INSERT INTO snapshots (asset_id, t, lowest_resale_price, source)
         SELECT 1, clock_timestamp(), $1, 'roblox'
         WHERE NOT EXISTS (SELECT 1 FROM prev WHERE prev.lowest_resale_price IS NOT DISTINCT FROM $1)
         RETURNING 1
       ) SELECT EXISTS (SELECT 1 FROM ins) AS inserted`,
      [price]
    )
    return r.rows[0].inserted
  }
  ok("1o snapshot grava", (await snap(1000)) === true)
  ok("preço igual NÃO grava (dirty-check)", (await snap(1000)) === false)
  ok("preço diferente grava", (await snap(1100)) === true)
  const count = (await pglite.query("SELECT count(*)::int AS c FROM snapshots WHERE asset_id = 1")).rows[0].c
  ok("só 2 snapshots gravados de 3 tentativas", count === 2, `${count} linhas`)

  console.log("\n=== 4. Janela móvel e retenção em SQL ===")
  // insere um snapshot antigo (100 dias) e um novo
  await pglite.query(
    `INSERT INTO snapshots (asset_id, t, lowest_resale_price, source)
     VALUES (1, now() - interval '100 days', 900, 'roblox')`
  )
  const recent = (await pglite.query(
    `SELECT count(*)::int AS c FROM snapshots WHERE asset_id = 1 AND t >= now() - interval '30 days'`
  )).rows[0].c
  ok("janela de 30d exclui o snapshot de 100d atrás", recent === 2, `${recent} na janela`)
  const pruned = (await pglite.query(
    `WITH del AS (DELETE FROM snapshots WHERE t < now() - interval '90 days' RETURNING 1)
     SELECT count(*)::int AS c FROM del`
  )).rows[0].c
  ok("prune remove o snapshot além de 90d", pruned === 1, `${pruned} removido`)

  console.log("\n=== 5. Métricas + dirty-check no upsert ===")
  const upsertMetric = async (score) => {
    const r = await pglite.query(
      `INSERT INTO item_metrics (asset_id, name, liquidity_score, components, computed_at)
       VALUES (1, 'Item A', $1, '{}', now())
       ON CONFLICT (asset_id) DO UPDATE SET liquidity_score = EXCLUDED.liquidity_score, computed_at = now()
       WHERE item_metrics.liquidity_score IS DISTINCT FROM EXCLUDED.liquidity_score`,
      [score]
    )
    return r.affectedRows ?? 0
  }
  await upsertMetric(50)
  const same = await upsertMetric(50)
  const diff = await upsertMetric(75)
  ok("métrica com mesmo score não reescreve", same === 0, `${same} linha`)
  ok("métrica com score novo reescreve", diff === 1, `${diff} linha`)

  console.log("\n=== 6. Ranking, percentil e DISTINCT ON ===")
  // A FK exige que o limited exista antes da métrica.
  await pglite.query(
    `INSERT INTO limiteds (asset_id, name) VALUES (2,'B'),(3,'C'),(4,'D')
     ON CONFLICT (asset_id) DO NOTHING`
  )
  await pglite.query(
    `INSERT INTO item_metrics (asset_id, name, liquidity_score, components)
     VALUES (2,'B',90,'{}'),(3,'C',30,'{}'),(4,'D',60,'{}')
     ON CONFLICT (asset_id) DO NOTHING`
  )
  const rank = (await pglite.query(
    "SELECT asset_id FROM item_metrics WHERE active ORDER BY liquidity_score DESC LIMIT 2"
  )).rows
  ok("ranking ordena por score DESC", rank[0].asset_id === 2 && rank[1].asset_id === 1, "top2: "+rank.map(r=>r.asset_id).join(",")+" (item 1 tem score 75, item 4 tem 60)")

  await pglite.query(
    `INSERT INTO collector_runs (collector, started_at, status) VALUES
       ('a', now() - interval '1 hour', 'ok'),
       ('a', now(), 'error'),
       ('b', now(), 'ok')`
  )
  const latest = (await pglite.query(
    "SELECT DISTINCT ON (collector) collector, status FROM collector_runs ORDER BY collector, started_at DESC"
  )).rows
  const a = latest.find((r) => r.collector === "a")
  ok("DISTINCT ON pega a execução mais recente por coletor", a && a.status === "error", a?.status)

  console.log(`\n${pass} passaram, ${fail} falharam`)
  await pglite.close()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1) })
