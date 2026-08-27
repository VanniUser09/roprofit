import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { LoadingScreen } from "@/components/LoadingScreen"
import { useAuth } from "@/lib/auth"

function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, loading } = useAuth()

  // Sem isso o refresh derruba o usuário logado: onAuthStateChanged é assíncrono.
  if (loading) return <LoadingScreen label="Verificando sua sessão..." />

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?redirect=${redirect}`} replace />
  }

  return children
}

export { RequireAuth }
