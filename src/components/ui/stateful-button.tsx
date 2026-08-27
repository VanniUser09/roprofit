import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react"

import { cn } from "@/lib/utils"

const EASE_OUT = [0.16, 1, 0.3, 1] as const

const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const

type ButtonState = "idle" | "loading" | "success" | "error"

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>

interface StatefulButtonProps extends NativeButtonProps {
  ref?: Ref<HTMLButtonElement>
  state?: ButtonState
  variant?: "primary" | "secondary" | "ghost" | "outline"
  size?: "sm" | "md" | "lg" | "icon"
  pressScale?: number
  loadingText?: ReactNode
  successText?: ReactNode
  errorText?: ReactNode
}

function StatefulButton({
  ref,
  state = "idle",
  variant = "primary",
  size = "md",
  pressScale = 0.96,
  loadingText = "Carregando",
  successText = "Concluído",
  errorText = "Erro",
  className,
  children,
  disabled,
  ...props
}: StatefulButtonProps) {
  const reduce = useReducedMotion()

  const label =
    state === "loading" ? loadingText : state === "success" ? successText : state === "error" ? errorText : children

  const Icon =
    state === "loading" ? Loader2 : state === "success" ? CheckCircle2 : state === "error" ? AlertCircle : null

  return (
    <motion.button
      ref={ref}
      type="button"
      whileTap={reduce || disabled ? undefined : { scale: pressScale }}
      transition={SPRING_PRESS}
      disabled={disabled || state === "loading"}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary-hover",
        variant === "secondary" && "border border-border bg-card text-foreground hover:bg-card/70",
        variant === "ghost" && "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
        variant === "outline" && "border border-border bg-transparent text-foreground hover:bg-primary/5",
        size === "sm" && "h-8 rounded-full px-3 text-xs",
        size === "md" && "h-10 rounded-full px-5 text-sm",
        size === "lg" && "h-12 rounded-full px-6 text-base",
        size === "icon" && "h-8 w-8 rounded-lg",
        className
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {Icon ? (
          <motion.span
            key={state}
            initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="inline-flex items-center justify-center"
          >
            <Icon className={cn("size-4", state === "loading" && "animate-spin")} />
          </motion.span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(label)}
          initial={{ opacity: 0, y: -8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

export { StatefulButton, type ButtonState }
