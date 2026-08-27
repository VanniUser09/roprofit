import * as React from "react"
import { Link, Navigate, useSearchParams } from "react-router-dom"

import { AuthForm } from "@/components/ui/sign-in"
import { ChromaKeyVideo } from "@/components/ui/chroma-key-video"
import {
  authErrorMessage,
  resetPassword,
  sendEmailLink,
  signInWithPassword,
  signInWithProvider,
  signUpWithPassword,
  useAuth,
  type SocialProvider,
} from "@/lib/auth"

function Login() {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect") || "/"
  const { user, loading, refreshUser } = useAuth()
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setError(null)
    setNotice(null)
    setPending(true)
    try {
      await action()
      if (success) setNotice(success)
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  const handleSocialSignIn = (provider: SocialProvider) => {
    void run(() => signInWithProvider(provider))
  }

  const handleEmailSubmit = ({ email, password }: { email: string; password?: string }) => {
    void run(() => signInWithPassword(email, password ?? ""))
  }

  const handleSignUp = ({ name, email, password }: { name: string; email: string; password: string }) => {
    void run(async () => {
      await signUpWithPassword(name, email, password)
      refreshUser()
    })
  }

  const handleEmailLink = (email: string) => {
    if (!email) return setError("Digite seu email primeiro.")
    void run(() => sendEmailLink(email), "Link enviado. Confira sua caixa de entrada.")
  }

  const handleForgotPassword = (email: string) => {
    if (!email) return setError("Digite seu email primeiro.")
    void run(() => resetPassword(email), "Enviamos um link para redefinir sua senha.")
  }

  if (!loading && user) return <Navigate to={redirect} replace />

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-10">
      <div className="relative w-full max-w-md translate-y-8">
        <Link to="/" aria-label="RoProfit" className="absolute bottom-full left-1/2 -mb-4 -translate-x-1/2">
          <ChromaKeyVideo src="/videos/logo-dark.mp4" className="h-44 w-auto" />
        </Link>
        <AuthForm
          onSocialSignIn={handleSocialSignIn}
          onEmailSubmit={handleEmailSubmit}
          onSignUp={handleSignUp}
          onEmailLink={handleEmailLink}
          onForgotPassword={handleForgotPassword}
          error={error}
          notice={notice}
          pending={pending}
        />
      </div>
    </div>
  )
}

export { Login }
