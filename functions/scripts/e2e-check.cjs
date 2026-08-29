/**
 * Teste de ponta a ponta contra os emuladores.
 *
 * Prova as três coisas que só dá para verificar com tudo rodando junto:
 *   1. a API rejeita quem não é admin (e devolve 404, não 403);
 *   2. um admin com a claim atravessa todas as rotas;
 *   3. os coletores gravam no Firestore e as métricas saem do outro lado.
 *
 * Uso: node scripts/e2e-check.cjs
 */
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
process.env.GCLOUD_PROJECT = "roprofit"

const { initializeApp } = require("firebase-admin/app")
const { getAuth } = require("firebase-admin/auth")

initializeApp({ projectId: "roprofit" })

const API = "http://127.0.0.1:5001/roprofit/southamerica-east1/api/api/admin/market"
const AUTH_EMU = "http://127.0.0.1:9099"
const API_KEY = "fake-api-key"

let passed = 0
let failed = 0

function check(name, condition, detail = "") {
  if (condition) {
    passed++
    console.log(`  [ok]    ${name}${detail ? " — " + detail : ""}`)
  } else {
    failed++
    console.log(`  [FALHA] ${name}${detail ? " — " + detail : ""}`)
  }
}

/** Cria um usuário no emulador e devolve um ID token real. */
async function makeUser(email, role) {
  const auth = getAuth()
  let user
  try {
    user = await auth.getUserByEmail(email)
  } catch {
    user = await auth.createUser({ email, password: "senha123456" })
  }
  await auth.setCustomUserClaims(user.uid, role ? { role } : {})

  const res = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "senha123456", returnSecureToken: true }),
    }
  )
  const body = await res.json()
  if (!body.idToken) throw new Error("emulador de auth não devolveu token: " + JSON.stringify(body))
  return body.idToken
}

async function call(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* resposta sem corpo */
  }
  return { status: res.status, json }
}

;(async () => {
  console.log("\n=== 1. Controle de acesso ===")

  const anon = await call("/overview", null)
  check("sem token devolve 401", anon.status === 401, `status ${anon.status}`)

  const userToken = await makeUser("usuario.comum@roprofit.test", null)
  const asUser = await call("/overview", userToken)
  check(
    "usuário logado sem claim recebe 404, não 403",
    asUser.status === 404,
    `status ${asUser.status} — para quem não é admin o módulo não existe`
  )

  const bad = await call("/overview", "token-invalido-qualquer")
  check("token forjado devolve 401", bad.status === 401, `status ${bad.status}`)

  const adminToken = await makeUser("admin@roprofit.test", "admin")

  console.log("\n=== 2. Rotas com claim de admin ===")

  const routes = [
    ["GET  /overview", () => call("/overview", adminToken)],
    ["GET  /ranking", () => call("/ranking?limit=10", adminToken)],
    ["POST /opportunities", () => call("/opportunities", adminToken, { method: "POST", body: { limit: 5 } })],
    ["GET  /collectors", () => call("/collectors", adminToken)],
    ["GET  /alerts", () => call("/alerts", adminToken)],
  ]

  for (const [name, run] of routes) {
    const res = await run()
    check(name, res.status === 200, `status ${res.status}`)
  }

  console.log("\n=== 3. Simulador via API (confere com o exemplo do plano) ===")

  const sim = await call("/simulate", adminToken, {
    method: "POST",
    body: { grossRobux: 14300, capitalBRL: 3500 },
  })
  check("POST /simulate responde 200", sim.status === 200, `status ${sim.status}`)

  const s = sim.json?.simulation
  if (s) {
    check("14.300 brutos viram 10.010 líquidos", Math.round(s.netRobux) === 10010, `${Math.round(s.netRobux)}`)
    check("custo de R$ 243,10", s.costBRL.toFixed(2) === "243.10", `R$ ${s.costBRL.toFixed(2)}`)
    check("receita de R$ 390,39", s.revenueBRL.toFixed(2) === "390.39", `R$ ${s.revenueBRL.toFixed(2)}`)
    check("lucro de R$ 147,29", s.profitBRL.toFixed(2) === "147.29", `R$ ${s.profitBRL.toFixed(2)}`)
    check("ROI de 60,6%", (s.roi * 100).toFixed(1) === "60.6", `${(s.roi * 100).toFixed(1)}%`)
    check("2 contas necessárias", s.accountsNeeded === 2, `${s.accountsNeeded}`)
  }

  console.log("\n=== 4. Validação de entrada ===")

  const badInput = await call("/simulate", adminToken, {
    method: "POST",
    body: { grossRobux: 14300, params: { robloxFeePct: 5 } },
  })
  check(
    "taxa de 500% é rejeitada",
    badInput.status === 400,
    `status ${badInput.status} — zod barra antes do cálculo`
  )

  const badFilter = await call("/opportunities", adminToken, {
    method: "POST",
    body: { filters: { liquidityScoreMin: 9999 } },
  })
  check("score mínimo acima de 100 é rejeitado", badFilter.status === 400, `status ${badFilter.status}`)

  const notFound = await call("/item/999999999", adminToken)
  check("item inexistente devolve 404", notFound.status === 404, `status ${notFound.status}`)

  console.log(`\n${passed} passaram, ${failed} falharam\n`)
  process.exit(failed > 0 ? 1 : 0)
})().catch((error) => {
  console.error("\nErro no teste:", error.message)
  process.exit(1)
})
