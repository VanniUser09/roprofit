import { motion } from "motion/react"

import { cn } from "@/lib/utils"

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
}

const wordVariant = {
  hidden: { opacity: 0, filter: "blur(8px)" },
  show: { opacity: 1, filter: "blur(0px)" },
}

function BlurredStaggerText({
  text,
  active = true,
  className,
}: {
  text: string
  active?: boolean
  className?: string
}) {
  const tokens = text.split(/(\s+)/)

  return (
    <motion.p
      variants={container}
      initial="hidden"
      animate={active ? "show" : "hidden"}
      className={cn("break-words whitespace-normal", className)}
    >
      {tokens.map((token, index) =>
        /^\s+$/.test(token) ? (
          <span key={index}>{token}</span>
        ) : (
          <motion.span key={index} variants={wordVariant} transition={{ duration: 0.35 }} className="inline-block">
            {token}
          </motion.span>
        )
      )}
    </motion.p>
  )
}

export { BlurredStaggerText }
