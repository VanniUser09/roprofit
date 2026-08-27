import { useState } from "react"
import { motion } from "framer-motion"
import { CreditCard, HelpCircle, Home, MessageCircle } from "lucide-react"

import { RobuxIcon } from "@/components/ui/robux-icon"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "Início", href: "/", icon: Home },
  { label: "Comprar", href: "/comprar", icon: RobuxIcon },
  { label: "Como funciona", href: "/#como-funciona", icon: HelpCircle },
  { label: "Pagamento", href: "/#pagamento", icon: CreditCard },
  { label: "Suporte", href: "/#suporte", icon: MessageCircle },
]

const LABEL_WIDTH = 84

function BottomNav({ className }: { className?: string }) {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      role="navigation"
      aria-label="Navegação rápida"
      className={cn(
        "fixed inset-x-0 bottom-4 z-40 mx-auto flex h-[52px] w-fit max-w-[95vw] items-center space-x-1 rounded-full border border-border bg-card p-2 shadow-xl md:hidden",
        className
      )}
    >
      {NAV_ITEMS.map((item, idx) => {
        const Icon = item.icon
        const isActive = activeIndex === idx

        return (
          <motion.a
            key={item.label}
            href={item.href}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveIndex(idx)}
            aria-label={item.label}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "relative flex h-10 min-h-[40px] max-h-[44px] min-w-[44px] items-center gap-0 rounded-full px-3 py-2 transition-colors duration-200 focus:outline-none focus-visible:ring-0",
              isActive
                ? "gap-2 bg-primary/10 text-primary"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon size={22} strokeWidth={2} aria-hidden className="transition-colors duration-200" />

            <motion.div
              initial={false}
              animate={{
                width: isActive ? `${LABEL_WIDTH}px` : "0px",
                opacity: isActive ? 1 : 0,
                marginLeft: isActive ? "8px" : "0px",
              }}
              transition={{
                width: { type: "spring", stiffness: 350, damping: 32 },
                opacity: { duration: 0.19 },
                marginLeft: { duration: 0.19 },
              }}
              className="flex max-w-[84px] items-center overflow-hidden"
            >
              <span
                className={cn(
                  "select-none overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(0.625rem,0.5263rem+0.5263vw,1rem)] font-medium leading-[1.9] transition-opacity duration-200",
                  isActive ? "text-primary" : "opacity-0"
                )}
                title={item.label}
              >
                {item.label}
              </span>
            </motion.div>
          </motion.a>
        )
      })}
    </motion.nav>
  )
}

export { BottomNav }
