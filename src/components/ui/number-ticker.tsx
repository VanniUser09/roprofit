import { motion, useReducedMotion } from "motion/react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const EASE_OUT = [0.16, 1, 0.3, 1] as const

interface NumberTickerProps {
  value: number
  duration?: number
  className?: string
  format?: (value: number) => ReactNode
}

function NumberTicker({ value, duration = 0.35, className, format = (next) => next.toLocaleString() }: NumberTickerProps) {
  const reduce = useReducedMotion()

  return (
    <motion.span
      key={value}
      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: EASE_OUT }}
      className={cn("inline-flex", className)}
    >
      {format(value)}
    </motion.span>
  )
}

export { NumberTicker }
