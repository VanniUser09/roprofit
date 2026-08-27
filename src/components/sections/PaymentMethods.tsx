import { CheckCircle2 } from "lucide-react"

import { revealClass, revealDelay, useReveal } from "@/hooks/use-reveal"
import { cn } from "@/lib/utils"

const METHODS = [
  { icon: "/icons/pix.png", title: "Pix", description: "Aprovação instantânea" },
  { icon: "/icons/ethereum.png", title: "Criptomoedas", description: "BTC, ETH e USDT" },
]

function PaymentCard({
  icon,
  title,
  description,
  index,
}: {
  icon: string
  title: string
  description: string
  index: number
}) {
  const { ref, visible } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={revealDelay(visible, index)}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-6 motion-safe:hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20 [transition:opacity_700ms_var(--ease-out),translate_700ms_var(--ease-out),translate_200ms_ease,border-color_200ms_ease,box-shadow_200ms_ease]",
        revealClass(visible)
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative z-10 flex items-center justify-between">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/20 transition-transform duration-300 motion-safe:group-hover:scale-110">
          <img src={icon} alt="" className="size-6" />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
          <CheckCircle2 className="size-3" />
          Disponível
        </span>
      </div>
      <p className="relative z-10 mt-4 font-semibold">{title}</p>
      <p className="relative z-10 mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PaymentMethods() {
  return (
    <section id="pagamento" className="border-b border-border px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-xl font-bold sm:text-2xl">Formas de pagamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha como prefere pagar.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {METHODS.map((method, i) => (
            <PaymentCard key={method.title} {...method} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export { PaymentMethods }
