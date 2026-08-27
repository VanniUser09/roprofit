import * as React from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface InteractiveHoverButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string
}

const InteractiveHoverButton = React.forwardRef<HTMLButtonElement, InteractiveHoverButtonProps>(
  ({ text = "Button", className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative flex w-32 items-center justify-center cursor-pointer overflow-hidden rounded-full border border-border bg-background p-2 text-center font-semibold outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        {...props}
      >
        <span className="inline-block translate-x-1 transition-all duration-300 group-hover:translate-x-12 group-hover:opacity-0">
          {text}
        </span>
        <div
          aria-hidden="true"
          className="absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 text-primary-foreground opacity-0 transition-all duration-300 group-hover:-translate-x-1 group-hover:opacity-100"
        >
          <span>{text}</span>
          <ArrowRight className="size-4" />
        </div>
        <div className="absolute top-1/2 left-3 h-2 w-2 -translate-y-1/2 scale-[1] rounded-lg bg-primary transition-all duration-300 group-hover:top-0 group-hover:left-0 group-hover:h-full group-hover:w-full group-hover:translate-y-0 group-hover:scale-[1.8]" />
      </button>
    )
  }
)
InteractiveHoverButton.displayName = "InteractiveHoverButton"

export { InteractiveHoverButton }
