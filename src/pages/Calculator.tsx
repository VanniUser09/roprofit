import { ArrowLeft } from "lucide-react"
import { animate, AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { ChromaKeyVideo } from "@/components/ui/chroma-key-video"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatBRL, PACKAGES, parsePackageAmount, parsePackagePrice, type Package } from "@/lib/packages"
import { cn } from "@/lib/utils"

type CalculatorMode = "receber" | "gastar"

const MODES: { id: CalculatorMode; label: string }[] = [
  { id: "receber", label: "Quero receber" },
  { id: "gastar", label: "Quero gastar" },
]

const DIGIT_TRANSITION = { duration: 0.18, ease: [0.16, 1, 0.3, 1] } as const

type AmountInputStyle = CSSProperties & { "--amount-chars": string }

const RECEBER_CHIPS = PACKAGES.slice(0, 4).map((pkg) => parsePackageAmount(pkg.amount))
const GASTAR_CHIPS = PACKAGES.slice(0, 4).map((pkg) => Math.round(parsePackagePrice(pkg.price)))

function nearestPackage(mode: CalculatorMode, typed: number): Package {
  const getValue = mode === "receber" ? (pkg: Package) => parsePackageAmount(pkg.amount) : (pkg: Package) => parsePackagePrice(pkg.price)

  return PACKAGES.reduce((best, pkg) => (Math.abs(getValue(pkg) - typed) < Math.abs(getValue(best) - typed) ? pkg : best))
}

function sanitizeAmount(value: string, allowDecimals: boolean) {
  const normalized = value.replace(allowDecimals ? /[^\d.]/g : /\D/g, "")
  if (!allowDecimals) return normalized

  const [whole, ...decimalParts] = normalized.split(".")
  if (decimalParts.length === 0) return whole

  return `${whole}.${decimalParts.join("").slice(0, 2)}`
}

function keyedAmountChars(value: string) {
  const seen = new Map<string, number>()

  return value.split("").map((char) => {
    const count = seen.get(char) ?? 0
    seen.set(char, count + 1)
    return { id: `${char}-${count}`, char }
  })
}

function amountInputSize(value: string) {
  const length = value.replace(/\D/g, "").length
  if (length >= 7) return "text-3xl sm:text-4xl"
  if (length >= 5) return "text-4xl sm:text-5xl"
  return "text-5xl sm:text-6xl"
}

function AnimatedAmountInput({
  id,
  value,
  mode,
  disabled,
  reduce,
  onChange,
}: {
  id: string
  value: string
  mode: CalculatorMode
  disabled: boolean
  reduce: boolean
  onChange: (value: string) => void
}) {
  const displayValue = value || "0"
  const chars = keyedAmountChars(displayValue)
  const inputSize = amountInputSize(displayValue)
  const inputStyle = { "--amount-chars": String(chars.length) } as AmountInputStyle
  const label = mode === "gastar" ? "Valor em reais" : "Quantidade de Robux"

  return (
    <div className="flex min-w-0 items-center justify-center overflow-hidden">
      {mode === "gastar" ? (
        <span
          aria-hidden
          className={cn(
            "shrink-0 font-semibold leading-none tracking-normal text-muted-foreground/65 tabular-nums transition-[font-size] duration-200",
            inputSize
          )}
        >
          R$
        </span>
      ) : null}

      <div className="relative min-w-0 shrink">
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(sanitizeAmount(event.target.value, mode === "gastar"))}
          placeholder="0"
          inputMode="decimal"
          aria-label={label}
          autoComplete="off"
          className={cn(
            "w-[calc((var(--amount-chars)+1)*0.62em)] min-w-[0.8em] max-w-[220px] bg-transparent text-left font-semibold leading-none tracking-normal text-transparent outline-none tabular-nums",
            "caret-foreground transition-[font-size] duration-200 placeholder:text-transparent selection:bg-foreground/10 disabled:cursor-not-allowed",
            inputSize
          )}
          style={inputStyle}
        />

        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex min-w-0 items-center justify-start overflow-hidden font-semibold leading-none tracking-normal text-foreground tabular-nums transition-[font-size] duration-200",
            !value && "text-muted-foreground/55",
            inputSize
          )}
          style={inputStyle}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {chars.map(({ id: charId, char }) => (
              <motion.span
                key={charId}
                layout={reduce ? false : "position"}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, filter: "blur(10px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14, filter: "blur(10px)" }}
                transition={DIGIT_TRANSITION}
                className="inline-block min-w-[0.55em] text-center will-change-[transform,opacity,filter]"
              >
                {char}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function Calculator() {
  const inputId = useId()
  const reduce = useReducedMotion() ?? false
  const amountRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requested = searchParams.get("pacote")

  const [mode, setMode] = useState<CalculatorMode>("receber")
  const [amount, setAmount] = useState(() => {
    const pkg = PACKAGES.find((p) => p.amount === requested)
    return pkg ? String(parsePackageAmount(pkg.amount)) : ""
  })
  const [shakeKey, setShakeKey] = useState(0)

  useEffect(() => {
    if (shakeKey === 0 || reduce || !amountRef.current) return

    animate(amountRef.current, { x: [0, -5, 5, -3, 3, -1, 0] }, { duration: 0.38, ease: [0.16, 1, 0.3, 1] })
  }, [reduce, shakeKey])

  const typed = Number(amount) || 0
  const matched = typed > 0 ? nearestPackage(mode, typed) : null

  const otherValue = matched
    ? mode === "receber"
      ? parsePackagePrice(matched.price)
      : parsePackageAmount(matched.amount)
    : 0

  const chips = mode === "receber" ? RECEBER_CHIPS : GASTAR_CHIPS

  const handleModeChange = (next: string) => {
    setMode(next as CalculatorMode)
    setAmount("")
  }

  const handleContinue = () => {
    if (!matched) {
      setShakeKey((key) => key + 1)
      return
    }
    navigate("/checkout", { state: { pacote: matched } })
  }

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-8 bg-background px-4 py-10">
      <Link to="/" aria-label="RoProfit">
        <ChromaKeyVideo src="/videos/logo-dark.mp4" className="h-28 w-auto" />
      </Link>

      <div className="flex w-full max-w-md items-center justify-between px-1">
        <Link
          to="/"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
          Voltar
        </Link>
        <span className="text-xs font-medium text-muted-foreground">Passo 1 de 2</span>
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card">
        <div className="border-b border-border/80 px-4 pt-4">
          <Tabs value={mode} onValueChange={handleModeChange} variant="pill">
            <TabsList className="grid w-full grid-cols-2 gap-1">
              {MODES.map((m) => (
                <TabsTrigger key={m.id} value={m.id} className="h-9 w-full text-sm font-semibold">
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="p-3">
          <div ref={amountRef} className="rounded-2xl bg-background p-4">
            <div className="flex min-h-24 flex-col items-center justify-center gap-5 text-center">
              <label htmlFor={inputId} className="text-sm font-medium text-muted-foreground">
                {mode === "gastar" ? "Valor em reais" : "Quantidade de Robux"}
              </label>

              <div className="w-full min-w-0">
                <AnimatedAmountInput
                  id={inputId}
                  mode={mode}
                  value={amount}
                  disabled={false}
                  reduce={reduce}
                  onChange={setAmount}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setAmount(String(chip))}
                  className="h-9 rounded-xl bg-card px-3.5 text-sm font-semibold text-foreground transition-[background-color,transform] duration-150 active:scale-95"
                >
                  {mode === "gastar" ? formatBRL(chip) : chip.toLocaleString("pt-BR")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-border/80 px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <p className="text-sm font-medium text-muted-foreground">
              {mode === "gastar" ? "Você recebe" : "Você paga"}
            </p>

            <NumberTicker
              value={otherValue}
              duration={0.3}
              className="ml-auto min-w-0 shrink-0 justify-end text-2xl font-semibold tracking-tight text-primary tabular-nums"
              format={(next) => (mode === "gastar" ? `${next.toLocaleString("pt-BR")} Robux` : formatBRL(next))}
            />
          </div>

          <Button onClick={handleContinue} className="h-12 w-full rounded-2xl text-base font-semibold">
            Continuar
          </Button>
        </div>
      </div>
    </div>
  )
}

export { Calculator }
