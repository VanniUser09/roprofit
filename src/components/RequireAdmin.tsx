import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { LoadingScreen } from "@/components/LoadingScreen"
import { useAuth } from "@/lib/auth"

/**
 * Guarda de rota do módulo administrativo.
 *
 * Isto é conveniência de navegação, NÃO segurança: a barreira real está no
 * `requireAdmin` do backend, que devolve 404 para quem não tem a claim. Aqui
 * só evitamos renderizar um painel que carregaria vazio de qualquer forma.
 *
 * Quem está logado mas não é admin vai para a home — não para uma tela de
 * "acesso negado", que só confirmaria que o módulo existe.
 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { user, role, loading } = useAuth()

  if (loading) return <LoadingScreen label="Verificando permissões..." />

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?redirect=${redirect}`} replace />
  }

  if (role !== "admin") return <Navigate to="/" replace />

  return children
}

export { RequireAdmin }
