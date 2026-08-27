import * as React from "react"

import { cn } from "@/lib/utils"

export interface Testimonial {
  name: string
  text: string
  avatar: string
  role?: string
  username?: string
}

export interface TestimonialMarqueeProps {
  items: Testimonial[]
  variant?: "default" | "stacked" | "dual" | "flush" | "flush-dual"
  className?: string
  speed?: number
  containerClassName?: string
}

const MarqueeRow = React.memo(
  ({
    children,
    direction = "left",
    speed = 40,
    className,
    pauseOnHover = true,
  }: {
    children: React.ReactNode
    direction?: "left" | "right"
    speed?: number
    className?: string
    pauseOnHover?: boolean
  }) => {
    const animateClass =
      direction === "left"
        ? "animate-[marquee-left_var(--duration)_linear_infinite]"
        : "animate-[marquee-right_var(--duration)_linear_infinite]"

    return (
      <div className={cn("group flex overflow-hidden p-2 [--gap:1rem]", className)}>
        <div
          className={cn(
            "flex min-w-full shrink-0 justify-start [gap:var(--gap)] pr-[var(--gap)] [backface-visibility:hidden] will-change-transform",
            animateClass,
            pauseOnHover && "group-hover:[animation-play-state:paused]"
          )}
          style={{ "--duration": `${speed}s` } as React.CSSProperties}
        >
          {children}
        </div>
        <div
          aria-hidden="true"
          className={cn(
            "flex min-w-full shrink-0 justify-start [gap:var(--gap)] pr-[var(--gap)] [backface-visibility:hidden] will-change-transform",
            animateClass,
            pauseOnHover && "group-hover:[animation-play-state:paused]"
          )}
          style={{ "--duration": `${speed}s` } as React.CSSProperties}
        >
          {children}
        </div>
      </div>
    )
  }
)
MarqueeRow.displayName = "MarqueeRow"

const TestimonialCard = React.memo(
  ({ item, variant = "default" }: { item: Testimonial; variant?: "default" | "flush" }) => {
    const isFlush = variant === "flush"

    return (
      <div
        className={cn(
          "group relative flex h-auto w-[350px] shrink-0 transform-gpu flex-col justify-between overflow-hidden bg-white/5 p-6 transition-all [backface-visibility:hidden] hover:bg-white/10",
          isFlush ? "rounded-none border-r border-border" : "rounded-2xl border border-border hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="relative z-10 flex flex-col gap-4">
          <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">&quot;{item.text}&quot;</p>

          <div className="flex items-center gap-3 pt-2">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border">
              <img src={item.avatar} alt={item.name} className="h-full w-full object-cover" loading="eager" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{item.name}</span>
              {item.username && <span className="text-xs text-muted-foreground">@{item.username}</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }
)
TestimonialCard.displayName = "TestimonialCard"

function TestimonialMarquee({ items, variant = "default", className, speed = 30, containerClassName }: TestimonialMarqueeProps) {
  const cnContainer = cn(containerClassName, className)

  const itemsToDisplay = React.useMemo(() => {
    let result = [...items]
    while (result.length < 10) {
      result = [...result, ...items]
    }
    return result
  }, [items])

  if (variant === "dual") {
    return (
      <div className={cn("flex flex-col gap-4 overflow-hidden py-8", containerClassName)}>
        <MarqueeRow speed={speed} direction="left">
          {itemsToDisplay.slice(0, Math.ceil(itemsToDisplay.length / 2)).map((item, i) => (
            <TestimonialCard key={`row1-${i}`} item={item} />
          ))}
        </MarqueeRow>
        <MarqueeRow speed={speed} direction="right">
          {itemsToDisplay.slice(Math.ceil(itemsToDisplay.length / 2)).map((item, i) => (
            <TestimonialCard key={`row2-${i}`} item={item} />
          ))}
        </MarqueeRow>
      </div>
    )
  }

  if (variant === "stacked") {
    return (
      <div className={cn("flex h-[600px] scale-110 flex-col justify-center gap-2 overflow-hidden rotate-[-2deg] py-8", containerClassName)}>
        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-r from-background via-transparent to-background" />
        <MarqueeRow speed={speed * 1.5} direction="left" className="[--gap:0.75rem]">
          {itemsToDisplay.slice(0, Math.ceil(itemsToDisplay.length / 3)).map((item, i) => (
            <TestimonialCard key={`s-row1-${i}`} item={item} />
          ))}
        </MarqueeRow>
        <MarqueeRow speed={speed * 1.2} direction="right" className="[--gap:0.75rem]">
          {itemsToDisplay
            .slice(Math.ceil(itemsToDisplay.length / 3), Math.ceil(itemsToDisplay.length / 3) * 2)
            .map((item, i) => (
              <TestimonialCard key={`s-row2-${i}`} item={item} />
            ))}
        </MarqueeRow>
        <MarqueeRow speed={speed * 1.5} direction="left" className="[--gap:0.75rem]">
          {itemsToDisplay.slice(Math.ceil(itemsToDisplay.length / 3) * 2).map((item, i) => (
            <TestimonialCard key={`s-row3-${i}`} item={item} />
          ))}
        </MarqueeRow>
      </div>
    )
  }

  if (variant === "flush") {
    return (
      <div className={cn("relative overflow-hidden border-y border-border bg-background", cnContainer)}>
        <MarqueeRow speed={speed} direction="left" className="[--gap:0rem] p-0">
          {itemsToDisplay.map((item, i) => (
            <TestimonialCard key={`flush-${i}`} item={item} variant="flush" />
          ))}
        </MarqueeRow>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-background to-transparent" />
      </div>
    )
  }

  if (variant === "flush-dual") {
    return (
      <div className={cn("relative flex flex-col overflow-hidden border-y border-border bg-background", containerClassName)}>
        <MarqueeRow speed={speed} direction="left" className="[--gap:0rem] border-b border-border p-0">
          {itemsToDisplay.slice(0, Math.ceil(itemsToDisplay.length / 2)).map((item, i) => (
            <TestimonialCard key={`fd-row1-${i}`} item={item} variant="flush" />
          ))}
        </MarqueeRow>
        <MarqueeRow speed={speed} direction="right" className="[--gap:0rem] p-0">
          {itemsToDisplay.slice(Math.ceil(itemsToDisplay.length / 2)).map((item, i) => (
            <TestimonialCard key={`fd-row2-${i}`} item={item} variant="flush" />
          ))}
        </MarqueeRow>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-1/3 bg-gradient-to-l from-background to-transparent" />
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden py-8", cnContainer)}>
      <MarqueeRow speed={speed} direction="left">
        {itemsToDisplay.map((item, i) => (
          <TestimonialCard key={`default-${i}`} item={item} />
        ))}
      </MarqueeRow>
    </div>
  )
}

export { TestimonialMarquee }
