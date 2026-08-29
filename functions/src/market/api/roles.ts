import { HttpsError, onCall } from "firebase-functions/v2/https"

import { auth, db, FieldValue } from "../../lib/firebase"
import { bootstrapAdminEmails, REGION } from "../../config"
import { scoped } from "../../lib/log"

const log = scoped("api.roles")

/**
 * Concede ou revoga a claim de admin.
 *
 * O primeiro admin não pode ser criado por outro admin — não existe nenhum
 * ainda. A saída é a allowlist de bootstrap por e-mail, definida em variável
 * de ambiente e nunca commitada: quem estiver nela pode se auto-promover uma
 * vez. Depois disso, promover outra pessoa exige já ser admin.
 */
export const setUserRole = onCall(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const caller = request.auth
    if (!caller) throw new HttpsError("unauthenticated", "Faça login para continuar.")

    const targetUid = String(request.data?.uid ?? caller.uid)
    const role = request.data?.role === "admin" ? "admin" : null
    const callerEmail = (caller.token.email ?? "").toLowerCase()
    const allowlist = bootstrapAdminEmails()

    const callerIsAdmin = caller.token.role === "admin"
    const selfBootstrap = targetUid === caller.uid && allowlist.includes(callerEmail)

    if (!callerIsAdmin && !selfBootstrap) {
      log.warn("tentativa de escalação de privilégio", {
        uid: caller.uid,
        email: callerEmail,
        target: targetUid,
      })
      throw new HttpsError("permission-denied", "Não encontrado.")
    }

    // Um admin removendo a própria claim trancaria o painel se fosse o único.
    if (callerIsAdmin && targetUid === caller.uid && role === null) {
      const others = await db
        .collection("users")
        .where("role", "==", "admin")
        .limit(2)
        .get()
      if (others.size <= 1) {
        throw new HttpsError(
          "failed-precondition",
          "Você é o único administrador. Promova outra conta antes de remover a sua."
        )
      }
    }

    await auth.setCustomUserClaims(targetUid, role ? { role } : {})
    await db.collection("users").doc(targetUid).set(
      {
        role,
        roleUpdatedAt: FieldValue.serverTimestamp(),
        roleUpdatedBy: caller.uid,
      },
      { merge: true }
    )

    log.info("papel atualizado", { target: targetUid, role, by: caller.uid })

    // A claim só entra no token na próxima renovação; o cliente precisa
    // chamar getIdToken(true) — por isso devolvemos o aviso explícito.
    return { ok: true, uid: targetUid, role, refreshRequired: true }
  }
)
