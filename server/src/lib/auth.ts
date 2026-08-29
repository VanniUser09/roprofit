import { initializeApp, applicationDefault, cert, getApps, type App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { readFileSync } from "node:fs"

import { query, queryOne } from "../db/pool"
import { scoped } from "./log"

const log = scoped("auth")

/**
 * Autenticação self-hosted, custo zero.
 *
 * O login continua sendo o Firebase Auth (grátis até 50k usuários, e as 4
 * páginas existentes do site dependem dele). O que muda:
 *
 *  - A verificação do ID token usa só as CHAVES PÚBLICAS do Google. Não exige
 *    service account nem nenhum segredo — basta o projectId. É por isso que a
 *    VPS não precisa guardar credencial do Firebase.
 *
 *  - O PAPEL de admin saiu das custom claims (que exigiam credencial de admin
 *    para gravar) e passou para a tabela `users` do Postgres. Conceder admin
 *    virou um UPDATE, feito pelo CLI `grant-admin`.
 *
 * Se algum dia você quiser operações privilegiadas (criar usuário pelo backend),
 * basta apontar FIREBASE_SERVICE_ACCOUNT para o JSON da conta de serviço — o
 * init abaixo passa a usá-la. Sem isso, roda em modo verificação-apenas.
 */

function buildApp(): App {
  if (getApps().length) return getApps()[0]

  const projectId = process.env.FIREBASE_PROJECT_ID
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT
  const saInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON

  if (saPath || saInline) {
    const json = saInline ? JSON.parse(saInline) : JSON.parse(readFileSync(saPath!, "utf8"))
    log.info("Firebase Admin com conta de serviço")
    return initializeApp({ credential: cert(json), projectId: json.project_id ?? projectId })
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault(), projectId })
  }

  // Modo verificação-apenas: sem credencial. verifyIdToken() baixa as chaves
  // públicas do Google e confere assinatura + audiência (projectId). Suficiente
  // para autenticar, e não guarda nenhum segredo na VPS.
  log.info("Firebase Admin em modo verificação-apenas", { projectId })
  return initializeApp({ projectId })
}

const auth = getAuth(buildApp())

export type Principal = { uid: string; email: string | null; role: "admin" | null }

/**
 * Verifica o token e resolve o papel a partir do Postgres.
 *
 * Uma leitura por requisição — barata, coberta pela PK de `users`. O papel não
 * vem do token, então revogar um admin (UPDATE users SET role = NULL) tem
 * efeito imediato, sem esperar o token expirar.
 */
export async function verifyRequestToken(idToken: string): Promise<Principal | null> {
  let decoded
  try {
    decoded = await auth.verifyIdToken(idToken)
  } catch {
    return null
  }

  const email = decoded.email ?? null
  const uid = decoded.uid

  // Mantém o e-mail em dia sem sobrescrever o papel: útil para auditoria e para
  // o CLI encontrar o usuário por e-mail.
  await query(
    `INSERT INTO users (uid, email) VALUES ($1, $2)
     ON CONFLICT (uid) DO UPDATE SET email = COALESCE(EXCLUDED.email, users.email)`,
    [uid, email]
  )

  let role = (await queryOne<{ role: string | null }>("SELECT role FROM users WHERE uid = $1", [uid]))?.role ?? null

  // Bootstrap do primeiro admin: se o e-mail está na allowlist e o usuário
  // ainda não tem papel, promove automaticamente. Resolve o dilema "preciso
  // ser admin para criar o primeiro admin" sem nenhum passo manual.
  if (role !== "admin" && email && bootstrapAdmins().includes(email.toLowerCase())) {
    await query(
      `UPDATE users SET role = 'admin', role_updated_at = now(), role_updated_by = 'bootstrap'
       WHERE uid = $1`,
      [uid]
    )
    role = "admin"
    log.info("admin concedido por allowlist de bootstrap", { uid, email })
  }

  return { uid, email, role: role === "admin" ? "admin" : null }
}

/** E-mails autorizados a virar admin no primeiro login. Definido por env. */
function bootstrapAdmins(): string[] {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
}

/**
 * Concede ou revoga admin, por e-mail.
 *
 * Usado pelo CLI. Se o usuário ainda não logou nenhuma vez, cria a linha pelo
 * e-mail e resolve o uid no primeiro login — mas o normal é pedir que a pessoa
 * faça login uma vez antes, para o uid já existir.
 */
export async function setRoleByEmail(email: string, role: "admin" | null): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  const existing = await queryOne<{ uid: string }>(
    "SELECT uid FROM users WHERE lower(email) = $1",
    [normalized]
  )

  if (existing) {
    await query(
      `UPDATE users SET role = $2, role_updated_at = now(), role_updated_by = 'cli'
       WHERE uid = $1`,
      [existing.uid, role]
    )
    return true
  }

  // Sem login prévio: registra a intenção com uid provisório = email. O
  // verifyRequestToken reconcilia quando a pessoa logar? Não — ele casa por uid.
  // Então avisamos o operador em vez de criar uma linha órfã silenciosa.
  return false
}

export { auth }
