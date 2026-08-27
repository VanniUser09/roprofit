import * as React from "react"
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  OAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth"

import { auth } from "@/lib/firebase"

type SocialProvider = "google" | "microsoft"

const EMAIL_LINK_KEY = "roprofit_email_link_address"

const ERRORS: Record<string, string> = {
  "auth/invalid-email": "Email inválido.",
  "auth/invalid-credential": "Email ou senha incorretos.",
  "auth/user-not-found": "Email ou senha incorretos.",
  "auth/wrong-password": "Email ou senha incorretos.",
  "auth/email-already-in-use": "Esse email já está cadastrado. Faça login.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Tente novamente em alguns minutos.",
  "auth/popup-closed-by-user": "Janela fechada antes de concluir.",
  "auth/popup-blocked": "O navegador bloqueou a janela. Libere os pop-ups e tente de novo.",
  "auth/account-exists-with-different-credential":
    "Esse email já está cadastrado com outro método de login.",
  "auth/operation-not-allowed": "Esse método de login ainda não foi habilitado no Firebase.",
  "auth/unauthorized-domain": "Este domínio não está autorizado no Firebase Auth.",
}

function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code
  return (code && ERRORS[code]) || "Não foi possível entrar. Tente novamente."
}

function providerFor(id: SocialProvider) {
  return id === "google" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com")
}

function signInWithProvider(id: SocialProvider) {
  return signInWithPopup(auth, providerFor(id))
}

function signInWithPassword(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

async function signUpWithPassword(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(user, { displayName: name })
}

function sendEmailLink(email: string) {
  localStorage.setItem(EMAIL_LINK_KEY, email)
  return sendSignInLinkToEmail(auth, email, {
    url: `${window.location.origin}/entrar`,
    handleCodeInApp: true,
  })
}

function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email)
}

function logout() {
  return signOut(auth)
}

const AuthContext = React.createContext<{
  user: User | null
  loading: boolean
  refreshUser: () => void
}>({
  user: null,
  loading: true,
  refreshUser: () => {},
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [loading, setLoading] = React.useState(true)
  // updateProfile muta a instância do User sem disparar onAuthStateChanged,
  // então o nome novo só aparece se forçarmos um re-render.
  const [, refreshUser] = React.useReducer((n: number) => n + 1, 0)

  React.useEffect(() => {
    // Fecha o fluxo de "link por email" quando o usuário volta pelo link.
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email = localStorage.getItem(EMAIL_LINK_KEY) || window.prompt("Confirme seu email:") || ""
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => localStorage.removeItem(EMAIL_LINK_KEY))
          .catch(() => localStorage.removeItem(EMAIL_LINK_KEY))
      }
    }

    return onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
    })
  }, [])

  return <AuthContext.Provider value={{ user, loading, refreshUser }}>{children}</AuthContext.Provider>
}

function useAuth() {
  return React.useContext(AuthContext)
}

export {
  AuthProvider,
  authErrorMessage,
  logout,
  resetPassword,
  sendEmailLink,
  signInWithPassword,
  signInWithProvider,
  signUpWithPassword,
  useAuth,
}
export type { SocialProvider }
