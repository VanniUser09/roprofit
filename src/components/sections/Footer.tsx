import { X } from "lucide-react"
import { useEffect } from "react"

import { attachModelViewer, BRAND_GREEN } from "@/lib/model-viewer"

const COLUMNS = [
  {
    title: "Loja",
    links: [
      { label: "Comprar Robux", href: "/comprar" },
      { label: "Formas de pagamento", href: "/#pagamento" },
      { label: "Como funciona", href: "/#como-funciona" },
    ],
  },
  {
    title: "Suporte",
    links: [
      { label: "FAQ", href: "/#faq" },
      { label: "Central de ajuda", href: "/#suporte" },
      { label: "Termos de uso", href: "/#suporte" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre nós", href: "/#suporte" },
      { label: "Carreiras", href: "/#suporte" },
      { label: "Contato", href: "/#suporte" },
    ],
  },
]

function Footer() {
  useEffect(() => {
    import("@google/model-viewer")
  }, [])

  return (
    <footer id="suporte" className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <model-viewer
              ref={(el) => attachModelViewer(el, { tint: BRAND_GREEN })}
              src="/models/logo.glb"
              alt="Logo RoProfit 3D"
              camera-orbit="0deg 90deg auto"
              camera-controls
              disable-zoom
              interaction-prompt="none"
              shadow-intensity="0"
              className="-ml-3 h-24 w-40"
            />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              A forma mais rápida e segura de comprar Robux, com entrega
              imediata.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="#"
                aria-label="Discord"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.073.073 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.04.106c.36.699.772 1.364 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.028Z" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="X (Twitter)"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 RoProfit. Todos os direitos reservados.</p>
          <p>RoProfit não é afiliada à Roblox Corporation.</p>
        </div>
      </div>
    </footer>
  )
}

export { Footer }
