import { ShieldCheck, ShoppingBag, Zap, type LucideIcon } from "lucide-react"

import { revealClass, revealDelay, useReveal } from "@/hooks/use-reveal"
import { cn } from "@/lib/utils"

const STEPS = [
  {
    icon: ShoppingBag,
    title: "Escolha a quantidade",
    description: "Selecione o pacote de Robux ideal para você, do tamanho que precisar.",
    benefits: [
      "Pacotes a partir de 400 Robux",
      "Calculadora de quantidade personalizada",
      "Preços sempre atualizados",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Pague com segurança",
    description: "Pix ou cripto. Seu pagamento é protegido do início ao fim.",
    benefits: [
      "Aprovação instantânea via Pix",
      "Suporte a BTC, ETH e USDT",
      "Dados protegidos em todas as etapas",
    ],
  },
  {
    icon: Zap,
    title: "Receba na hora",
    description: "O Robux cai na sua conta assim que o pagamento é aprovado.",
    benefits: [
      "Entrega em poucos minutos",
      "Acompanhamento do pedido em tempo real",
      "Suporte disponível se precisar de ajuda",
    ],
  },
]

function StepCard({
  icon: Icon,
  title,
  description,
  benefits,
  index,
}: {
  icon: LucideIcon
  title: string
  description: string
  benefits: string[]
  index: number
}) {
  const { ref, visible } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      style={revealDelay(visible, index)}
      className={cn(
        "rounded-2xl border border-border bg-card p-6 motion-safe:hover:scale-[1.02] hover:border-primary/40 hover:shadow-lg [transition:opacity_700ms_var(--ease-out),translate_700ms_var(--ease-out),scale_200ms_ease,border-color_200ms_ease,box-shadow_200ms_ease]",
        revealClass(visible)
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <ul className="mt-5 space-y-2.5">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/20">
              <span className="size-1.5 rounded-full bg-primary" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
    </div>
  )
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="border-b border-border px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-xl font-bold sm:text-2xl">Como funciona</h2>
        <p className="mt-1 text-sm text-muted-foreground">Simples, rápido e seguro.</p>

        <div className="relative mx-auto mt-10 hidden max-w-4xl sm:block">
          <div aria-hidden="true" className="absolute top-1/2 left-[16.6667%] h-px w-[66.6667%] -translate-y-1/2 bg-border" />
          <div className="relative grid grid-cols-3">
            {STEPS.map((step, i) => (
              <span
                key={step.title}
                className="flex size-8 items-center justify-center justify-self-center rounded-full bg-muted text-sm font-semibold ring-4 ring-background"
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:mt-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <StepCard key={step.title} {...step} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export { HowItWorks }
