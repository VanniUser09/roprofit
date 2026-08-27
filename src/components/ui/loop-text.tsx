import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"

function useLoop(items: string[], delay = 2400) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % items.length)
    }, delay)
    return () => clearInterval(interval)
  }, [items.length, delay])

  return items[index]
}

function LoopText({
  items,
  delay = 2400,
  className,
}: {
  items: string[]
  delay?: number
  className?: string
}) {
  const current = useLoop(items, delay)
  const reduceMotion = useReducedMotion()
  const offset = reduceMotion ? 0 : 16

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={current}
        initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        exit={{ opacity: 0, transform: `translateY(${-offset}px)` }}
        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className={className}
      >
        {current}
      </motion.span>
    </AnimatePresence>
  )
}

export { LoopText, useLoop }
