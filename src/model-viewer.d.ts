import type { DetailedHTMLProps, HTMLAttributes } from "react"

type ModelViewerAttributes = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  src?: string
  alt?: string
  "auto-rotate"?: boolean
  "camera-controls"?: boolean
  "disable-zoom"?: boolean
  "shadow-intensity"?: string | number
  exposure?: string | number
  "auto-rotate-delay"?: string | number
  "rotation-per-second"?: string
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes
    }
  }
}
