import { close } from "../db/pool"
import { setRoleByEmail } from "../lib/auth"

/**
 * Concede (ou revoga) admin por e-mail, direto no Postgres.
 *
 *   npm --prefix server run grant-admin -- email@dominio.com
 *   npm --prefix server run grant-admin -- email@dominio.com --revoke
 *
 * A pessoa precisa ter feito login no site ao menos uma vez, para o uid já
 * existir na tabela `users`. Para o PRIMEIRO admin sem depender disto, use a
 * env ADMIN_BOOTSTRAP_EMAILS — quem estiver nela vira admin no primeiro login.
 */
async function main() {
  const email = process.argv[2]
  const revoke = process.argv.includes("--revoke")

  if (!email || email.startsWith("--")) {
    console.error("Uso: grant-admin <email> [--revoke]")
    process.exit(1)
  }

  const ok = await setRoleByEmail(email, revoke ? null : "admin")
  if (ok) {
    console.log(`${revoke ? "Revogado" : "Concedido"} admin para ${email}.`)
    console.log("A pessoa precisa recarregar o painel para o novo papel valer.")
  } else {
    console.error(`Usuário ${email} não encontrado.`)
    console.error("Peça para ele fazer login no site uma vez, ou use ADMIN_BOOTSTRAP_EMAILS.")
    process.exitCode = 2
  }
  await close()
}

main().catch((error) => {
  console.error("Falhou:", error instanceof Error ? error.message : error)
  process.exit(1)
})
