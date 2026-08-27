import { AnimatePresence, motion } from "motion/react"
import type { RefObject } from "react"

function SuccessParticles({
  buttonRef,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  const rect = buttonRef.current?.getBoundingClientRect()
  if (!rect) return null

  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  return (
    <AnimatePresence>
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="fixed size-1 rounded-full bg-primary"
          style={{ left: centerX, top: centerY }}
          initial={{ scale: 0, x: 0, y: 0 }}
          animate={{
            scale: [0, 1, 0],
            x: [0, (i % 2 ? 1 : -1) * (Math.random() * 50 + 20)],
            y: [0, -Math.random() * 50 - 20],
          }}
          transition={{ duration: 0.6, delay: i * 0.1, ease: "easeOut" }}
        />
      ))}
    </AnimatePresence>
  )
}

export { SuccessParticles }
