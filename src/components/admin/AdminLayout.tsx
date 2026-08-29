import {
  Activity,
  Bell,
  Boxes,
  Calculator,
  Flame,
  Home,
  LayoutGrid,
  Menu,
  Radar,
  X,
} from "lucide-react"
import { useState } from "react"
import { Link, NavLink, Outlet } from "react-router-dom"

import { UserMenu } from "@/components/UserMenu"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

/**
 * Casca do módulo administrativo.
 *
 * Segue o tema do produto (fundo #0d0d0d, primária verde, Inter), mas com
 * densidade de painel: barra lateral fixa, conteúdo largo, nada de hero.
 */

const NAV = [
  { to: "/admin/mercado", label: "Visão geral", icon: LayoutGrid, end: true },
  { to: "/admin/mercado/ranking", label: "Mais líquidos", icon: Flame },
  { to: "/admin/mercado/oportunidades", label: "Oportunidades", icon: Radar },
  { to: "/admin/mercado/lotes", label: "Montar lote", icon: Boxes },
  { to: "/admin/mercado/simulador", label: "Simulador", icon: Calculator },
  { to: "/admin/mercado/alertas", label: "Alertas", icon: Bell },
  { to: "/admin/mercado/coletores", label: "Coleta", icon: Activity },
]

function AdminLayout() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-svh w-full bg-background">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="rounded-lg border border-border p-1.5 transition-colors hover:bg-card lg:hidden"
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Market Intelligence</p>
          </div>

          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground sm:inline-flex"
          >
            <Home className="size-3.5" />
            Site
          </Link>

          {user ? <UserMenu user={user} /> : null}
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            R
          </span>
          <span className="text-sm font-semibold tracking-tight">RoProfit</span>
          <span className="ml-auto rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // No mobile a barra cobre a tela inteira: sem isto ela ficaria
              // aberta por cima da página nova. Fechar aqui, no evento de
              // navegação, evita um efeito que reage à mudança de rota.
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                )
              }
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <p className="border-t border-border px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Dados de mercado da Roblox e do Rolimon&apos;s. Ferramenta de análise — não executa
          compras nem vendas.
        </p>
      </aside>
    </>
  )
}

export { AdminLayout }
