import { PackageCheck, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react"

import { CountingNumber } from "@/components/ui/counting-number"
import { revealClass, revealDelay, useReveal } from "@/hooks/use-reveal"
import { cn } from "@/lib/utils"

const STATS = [
  { icon: Wallet, prefix: "R$ ", target: 850, suffix: "K+", label: "Volume vendido" },
  { icon: PackageCheck, prefix: "", target: 42, suffix: "K+", label: "Pedidos entregues" },
  { icon: ShieldCheck, prefix: "", target: 99.8, decimalPlaces: 1, suffix: "%", label: "Taxa de entrega" },
  { icon: Users, prefix: "", target: 8, suffix: "K+", label: "Clientes atendidos" },
]

function StatTile({
  icon: Icon,
  prefix,
  target,
  decimalPlaces,
  suffix,
  label,
  index,
}: {
  icon: LucideIcon
  prefix: string
  target: number
  decimalPlaces?: number
  suffix: string
  label: string
  index: number
}) {
  const { ref, visible } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={revealDelay(visible, index)}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5 motion-safe:hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20 [transition:opacity_700ms_var(--ease-out),translate_700ms_var(--ease-out),translate_200ms_ease,border-color_200ms_ease,box-shadow_200ms_ease]",
        revealClass(visible)
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary transition-transform duration-300 motion-safe:group-hover:scale-110">
        <Icon className="size-4" />
      </span>
      <div className="relative z-10">
        <p className="text-lg font-bold leading-tight">
          {prefix}
          <CountingNumber
            target={target}
            decimalPlaces={decimalPlaces}
            autoStart={visible}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          {suffix}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function Stats() {
  return (
    <section className="border-b border-border px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((stat, i) => (
          <StatTile key={stat.label} {...stat} index={i} />
        ))}
      </div>
    </section>
  )
}

export { Stats }
