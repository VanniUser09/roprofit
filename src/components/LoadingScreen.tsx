import { Loader2 } from "lucide-react"

import { ChromaKeyVideo } from "@/components/ui/chroma-key-video"

function LoadingScreen({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-svh w-full flex-col items-center justify-center gap-4 bg-background px-4"
    >
      <ChromaKeyVideo src="/videos/logo-dark.mp4" className="h-32 w-auto" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  )
}

export { LoadingScreen }
