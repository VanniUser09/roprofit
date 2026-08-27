import { ArrowRight, Menu } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { AnimatedNavigationTabs } from "@/components/ui/animated-navigation-tabs"
import { UserMenu } from "@/components/UserMenu"
import { Button } from "@/components/ui/button"
import { ChromaKeyVideo } from "@/components/ui/chroma-key-video"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

const NAV_LINKS = [
  { id: 1, label: "Como funciona", href: "/#como-funciona" },
  { id: 2, label: "Pagamento", href: "/#pagamento" },
  { id: 3, label: "Suporte", href: "/#suporte" },
]

function Header() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hidden, setHidden] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    lastScrollY.current = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      setScrolled(y > 8)

      if (open || y < 120) {
        setHidden(false)
      } else {
        setHidden(y > lastScrollY.current)
      }

      lastScrollY.current = y
    }

    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [open])

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-md [transition:background-color_200ms_ease,border-color_200ms_ease,box-shadow_200ms_ease,transform_300ms_var(--ease-in-out)]",
        hidden && "-translate-y-full",
        scrolled
          ? "border-border bg-background/95 shadow-lg shadow-black/20"
          : "border-transparent bg-background/80"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="RoProfit">
          <ChromaKeyVideo src="/videos/logo-dark.mp4" className="h-20 w-auto" />
        </Link>

        <nav className="hidden md:flex">
          <AnimatedNavigationTabs items={NAV_LINKS} />
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-3 md:flex">
            {loading ? null : user ? (
              <UserMenu user={user} />
            ) : (
              <Button
                variant="outline"
                render={<Link to="/entrar" />}
                nativeButton={false}
                className="h-9 rounded-full px-4 shadow-md shadow-black/20 motion-safe:hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
              >
                Entrar
              </Button>
            )}
            <Button
              render={<Link to="/comprar" />}
              nativeButton={false}
              className="group h-9 rounded-full bg-gradient-to-b from-primary to-primary-hover px-4 shadow-sm shadow-primary/20 motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/25"
            >
              Comprar Robux
              <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-lg border border-border md:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="size-4" />
          </button>
        </div>
      </div>

      {open && (
        <nav
          className="flex origin-top flex-col gap-1 border-t border-border px-4 py-3 backdrop-blur-md transition-[opacity,translate] duration-200 ease-out starting:-translate-y-2 starting:opacity-0 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          {loading ? null : user ? (
            <UserMenu user={user} inline />
          ) : (
            <Button
              variant="outline"
              render={<Link to="/entrar" />}
              nativeButton={false}
              onClick={() => setOpen(false)}
              className="mt-2 h-9 rounded-full shadow-md shadow-black/20 motion-safe:hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
            >
              Entrar
            </Button>
          )}
          <Button
            render={<Link to="/comprar" />}
            nativeButton={false}
            onClick={() => setOpen(false)}
            className="group h-9 rounded-full bg-gradient-to-b from-primary to-primary-hover shadow-sm shadow-primary/20 motion-safe:hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/25"
          >
            Comprar Robux
            <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Button>
        </nav>
      )}
    </header>
  )
}

export { Header }
