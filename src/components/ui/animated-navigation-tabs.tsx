import { motion } from "motion/react"
import { useState } from "react"

import { cn } from "@/lib/utils"

type NavTab = {
  id: number
  label: string
  href: string
}

function AnimatedNavigationTabs({ items }: { items: NavTab[] }) {
  const [active, setActive] = useState(items[0])
  const [isHover, setIsHover] = useState<NavTab | null>(null)

  return (
    <ul className="flex items-center">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <a
            href={item.href}
            onClick={() => setActive(item)}
            onMouseEnter={() => setIsHover(item)}
            onMouseLeave={() => setIsHover(null)}
            className={cn(
              "relative block px-4 py-2 text-sm transition-colors duration-300 hover:!text-foreground",
              active.id === item.id ? "text-foreground" : "text-muted-foreground"
            )}
          >
            <span className="relative z-10">{item.label}</span>
            {isHover?.id === item.id && (
              <motion.div
                layoutId="nav-tabs-hover-bg"
                className="absolute inset-0 rounded-md bg-primary/10"
              />
            )}
            {active.id === item.id && (
              <motion.div
                layoutId="nav-tabs-active"
                className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
              />
            )}
          </a>
        </li>
      ))}
    </ul>
  )
}

export { AnimatedNavigationTabs }
export type { NavTab }
