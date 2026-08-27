import { cn } from "@/lib/utils"

type RobuxIconProps = {
  className?: string
  size?: number
  strokeWidth?: number
  "aria-hidden"?: boolean
}

function RobuxIcon({ className, size }: RobuxIconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        width: size,
        height: size,
        maskImage: "url(/icons/robux.png)",
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: "url(/icons/robux.png)",
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  )
}

export { RobuxIcon }
