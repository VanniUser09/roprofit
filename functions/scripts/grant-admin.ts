/**
 * Concede a claim de admin sem passar pela allowlist — via Admin SDK local.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node --experimental-strip-types scripts/grant-admin.ts email@dominio.com
 *
 * Existe para o caso de você perder acesso ao painel e precisar reentrar sem
 * depender do próprio painel.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

const email = process.argv[2]
if (!email) {
  console.error("Informe o e-mail: node scripts/grant-admin.ts email@dominio.com")
  process.exit(1)
}

initializeApp({ credential: applicationDefault() })

const auth = getAuth()
const db = getFirestore()

const user = await auth.getUserByEmail(email)
await auth.setCustomUserClaims(user.uid, { role: "admin" })
await db.collection("users").doc(user.uid).set(
  { role: "admin", email: user.email, roleUpdatedAt: FieldValue.serverTimestamp(), roleUpdatedBy: "cli" },
  { merge: true }
)

console.log(`Admin concedido a ${email} (uid ${user.uid}).`)
console.log("O usuário precisa sair e entrar de novo para o token carregar a claim.")
