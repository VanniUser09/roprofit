import { motion } from "motion/react"
import { createContext, useContext, useId, type ReactNode } from "react"

import { cn } from "@/lib/utils"

const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const

type TabsVariant = "underline" | "pill"

type TabsContextValue = {
  value: string
  onValueChange: (value: string) => void
  variant: TabsVariant
  layoutId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

interface TabsProps {
  value: string
  onValueChange: (value: string) => void
  variant?: TabsVariant
  className?: string
  children: ReactNode
}

function Tabs({ value, onValueChange, variant = "pill", className, children }: TabsProps) {
  const id = useId()

  return (
    <TabsContext.Provider value={{ value, onValueChange, variant, layoutId: id }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  className?: string
  children: ReactNode
}

function TabsList({ className, children }: TabsListProps) {
  return <div className={cn("relative flex items-center rounded-full bg-muted p-1", className)}>{children}</div>
}

interface TabsTriggerProps {
  value: string
  className?: string
  indicatorClassName?: string
  children: ReactNode
}

function TabsTrigger({ value, className, indicatorClassName, children }: TabsTriggerProps) {
  const context = useContext(TabsContext)

  if (!context) {
    throw new Error("TabsTrigger must be used inside Tabs")
  }

  const selected = context.value === value

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={cn(
        "relative isolate inline-flex items-center justify-center rounded-full outline-none transition-colors",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "text-foreground" : "text-muted-foreground",
        className
      )}
    >
      {selected ? (
        <motion.span
          layoutId={`${context.layoutId}-indicator`}
          className={cn(
            "absolute -z-10",
            context.variant === "underline"
              ? "inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground"
              : "inset-0 rounded-[inherit] bg-background",
            indicatorClassName
          )}
          transition={SPRING_LAYOUT}
        />
      ) : null}
      {children}
    </button>
  )
}

export { Tabs, TabsList, TabsTrigger }
