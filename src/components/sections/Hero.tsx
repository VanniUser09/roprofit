import { CheckCircle2 } from "lucide-react"
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button"
import { LoopText } from "@/components/ui/loop-text"
import { RobuxIcon } from "@/components/ui/robux-icon"
import { attachModelViewer, BRAND_GREEN } from "@/lib/model-viewer"

const HERO_BENEFITS = [
  "entrega imediata.",
  "total segurança.",
  "zero burocracia.",
  "máxima rapidez.",
]

const FLOATING_CARDS = [
  { amount: "400", price: "R$ 19,90", rotate: "-rotate-6", pos: "left-0 top-16", delay: 0 },
  { amount: "1.700", price: "R$ 74,90", rotate: "rotate-2", pos: "left-1/2 top-0 -translate-x-1/2", delay: 120 },
  { amount: "4.500", price: "R$ 189,90", rotate: "rotate-6", pos: "right-0 top-20", delay: 240 },
]

const MINI_ROBUX = [
  {
    size: "size-10",
    pos: "left-2 top-0",
    delay: 60,
    motion: "motion-safe:animate-[float_5s_ease-in-out_infinite]",
    rotationPerSecond: "70deg/s",
  },
  {
    size: "size-12",
    pos: "left-6 bottom-16",
    delay: 180,
    motion: "motion-safe:animate-[float-diagonal_7s_ease-in-out_infinite]",
    rotationPerSecond: "-50deg/s",
  },
  {
    size: "size-12",
    pos: "right-4 bottom-0",
    delay: 300,
    motion: "motion-safe:animate-[float-side_6.5s_ease-in-out_infinite]",
    rotationPerSecond: "100deg/s",
  },
]

function Hero() {
  const navigate = useNavigate()

  useEffect(() => {
    import("@google/model-viewer")
  }, [])

  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 size-[500px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-16 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
        <div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Compre Robux com
            <br />
            <LoopText
              items={HERO_BENEFITS}
              className="inline-block text-primary"
            />
          </h1>

          <p className="mt-5 max-w-md text-lg text-muted-foreground text-balance">
            A forma mais rápida, segura e barata de comprar Robux. Pagamento
            aprovado, Robux na sua conta em minutos.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <InteractiveHoverButton
              text="Comprar agora"
              onClick={() => navigate("/comprar")}
              className="h-11 w-48 text-base"
            />
            <Button
              variant="secondary"
              render={<a href="#como-funciona" />}
              nativeButton={false}
              className="h-11 w-48 rounded-full bg-gradient-to-b from-secondary to-secondary/60 text-base shadow-lg shadow-black/30 motion-safe:hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40"
            >
              Como funciona
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" />
            Mais de 8 mil clientes já compraram com a RoProfit
          </div>
        </div>

        <div className="relative hidden h-96 lg:block">
          <model-viewer
            ref={(el) => attachModelViewer(el, { interactive: true, tint: BRAND_GREEN })}
            src="/models/robux.glb"
            alt="Robux 3D"
            auto-rotate
            rotation-per-second="60deg/s"
            camera-controls
            disable-zoom
            interaction-prompt="none"
            shadow-intensity="0"
            className="absolute left-1/2 top-2/3 z-10 size-48 -translate-x-1/2 -translate-y-1/2"
          />

          {MINI_ROBUX.map((mini, i) => (
            <model-viewer
              key={i}
              ref={(el) => attachModelViewer(el, { tint: BRAND_GREEN })}
              src="/models/robux.glb"
              alt=""
              aria-hidden="true"
              auto-rotate
              rotation-per-second={mini.rotationPerSecond}
              disable-zoom
              interaction-prompt="none"
              shadow-intensity="0"
              style={{ animationDelay: `${mini.delay + 500}ms` }}
              className={`pointer-events-none absolute opacity-70 ${mini.motion} ${mini.size} ${mini.pos}`}
            />
          ))}

          {FLOATING_CARDS.map((card) => (
            <div
              key={card.amount}
              style={{
                transitionDelay: `${card.delay}ms`,
                animationDelay: `${card.delay + 500}ms`,
              }}
              className={`group absolute w-44 [perspective:1000px] transition-[opacity,translate,scale] duration-500 ease-out starting:translate-y-4 starting:scale-95 starting:opacity-0 motion-reduce:starting:translate-y-0 motion-reduce:starting:scale-100 motion-safe:animate-[float_6s_ease-in-out_infinite] ${card.rotate} ${card.pos}`}
            >
              <div className="relative h-[124px] w-full transition-transform duration-500 [transform-style:preserve-3d] motion-safe:group-hover:[transform:rotateY(180deg)]">
                <div className="absolute inset-0 rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/40 [backface-visibility:hidden]">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <RobuxIcon className="size-4" />
                    </span>
                    <span className="text-sm font-semibold">{card.amount} Robux</span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-primary">{card.price}</p>
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <CheckCircle2 className="size-3" />
                    Entregue
                  </span>
                </div>

                <div
                  aria-hidden="true"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary p-4 text-primary-foreground shadow-2xl shadow-black/40 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                >
                  <RobuxIcon className="size-8" />
                  <span className="text-sm font-bold">{card.amount} Robux</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export { Hero }
