import { ArrowLeft, Check, Mail, User } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useRef, useState, type FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import { ChromaKeyVideo } from "@/components/ui/chroma-key-video"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberTicker } from "@/components/ui/number-ticker"
import { SuccessParticles } from "@/components/ui/particle-button"
import { RobuxIcon } from "@/components/ui/robux-icon"
import { StatefulButton, type ButtonState } from "@/components/ui/stateful-button"
import { formatBRL, parsePackageAmount, parsePackagePrice, type Package } from "@/lib/packages"
import { cn } from "@/lib/utils"

type PaymentMethod = "pix" | "cripto"
type CheckoutState = { pacote: Package }

const PAYMENT_METHODS: { id: PaymentMethod; label: string; description: string; icon: string }[] = [
  { id: "pix", label: "Pix", description: "Aprovação instantânea", icon: "/icons/pix.png" },
  { id: "cripto", label: "Cripto", description: "BTC, ETH e USDT", icon: "/icons/ethereum.png" },
]

function Checkout() {
  const location = useLocation()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const state = location.state as CheckoutState | null
  const pacote = state?.pacote ?? null

  const [method, setMethod] = useState<PaymentMethod>("pix")
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [showParticles, setShowParticles] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  const totalRobux = pacote ? parsePackageAmount(pacote.amount) : 0
  const totalPrice = pacote ? parsePackagePrice(pacote.price) : 0

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setStatus("loading")
    setShowParticles(true)
    setTimeout(() => setShowParticles(false), 1000)

    setTimeout(() => {
      setStatus("success")
      console.log("Pedido criado:", {
        pacote,
        totalRobux,
        totalPrice,
        metodo: method,
        usuarioRoblox: formData.get("usuario"),
        email: formData.get("email"),
      })
    }, 650)
  }

  const actionState: ButtonState = status === "loading" ? "loading" : status === "success" ? "success" : "idle"

  if (!pacote) {
    return <Navigate to="/comprar" replace />
  }

  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/3 left-1/2 size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
      </div>

      <Link to="/" aria-label="RoProfit">
        <ChromaKeyVideo src="/videos/logo-dark.mp4" className="h-28 w-auto" />
      </Link>

      <div className="flex w-full max-w-md items-center justify-between px-1">
        <button
          type="button"
          onClick={() => navigate(`/comprar?pacote=${encodeURIComponent(pacote.amount)}`)}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Voltar
        </button>
        <span className="text-xs font-medium text-muted-foreground">Passo 2 de 2</span>
      </div>

      <motion.div
        initial={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
        animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-black/40 ring-1 ring-white/5"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-hover p-5 text-primary-foreground">
          <div className="pointer-events-none absolute -top-10 -right-8 size-36 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-12 -left-10 size-32 rounded-full bg-white/10" />

          <p className="text-xs font-semibold tracking-wide text-primary-foreground/80 uppercase">
            Você está comprando
          </p>

          <div className="mt-3 flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
              <RobuxIcon className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-bold">{pacote.amount} Robux</p>
              <p className="text-xs text-primary-foreground/80">Entrega imediata após a confirmação</p>
            </div>
            <span className="shrink-0 text-xl font-bold">{formatBRL(totalPrice)}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-t border-border/80 px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="usuario">Usuário Roblox</Label>
            <div className="group relative">
              <User className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="usuario"
                name="usuario"
                placeholder="SeuUsuarioRoblox"
                className="pl-9"
                disabled={status !== "idle"}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="group relative">
              <Mail className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="seuemail@exemplo.com"
                className="pl-9"
                disabled={status !== "idle"}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Forma de pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((item) => {
                const selected = method === item.id

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={status !== "idle"}
                    onClick={() => setMethod(item.id)}
                    className={cn(
                      "group relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all duration-200 disabled:pointer-events-none disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-border hover:-translate-y-0.5 hover:border-primary/40"
                    )}
                  >
                    {selected && (
                      <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    )}
                    <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 transition-transform duration-200 group-hover:scale-105">
                      <img src={item.icon} alt="" className="size-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 pt-1">
            <p className="text-sm font-medium text-muted-foreground">Total</p>

            <NumberTicker
              value={totalPrice}
              duration={0.3}
              className="ml-auto min-w-0 shrink-0 justify-end text-2xl font-semibold tracking-tight text-primary tabular-nums"
              format={formatBRL}
            />
          </div>

          {showParticles && <SuccessParticles buttonRef={submitRef} />}

          <StatefulButton
            ref={submitRef}
            type="submit"
            state={actionState}
            variant="primary"
            size="lg"
            pressScale={0.98}
            loadingText="Processando"
            successText="Pedido confirmado"
            className="h-12 w-full rounded-2xl text-base font-semibold shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20"
          >
            Finalizar compra
          </StatefulButton>
        </form>
      </motion.div>
    </div>
  )
}

export { Checkout }
