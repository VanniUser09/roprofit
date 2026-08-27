import { AlertTriangle, RotateCw } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"

function ErrorScreen({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Não conseguimos carregar esta página. Tente de novo. Se continuar, fale com o suporte.
        </p>
      </div>

      {/* Em produção a mensagem crua vaza detalhe interno sem ajudar o usuário. */}
      {import.meta.env.DEV && error && (
        <pre className="max-w-lg overflow-x-auto rounded-lg border border-border bg-card p-3 text-left text-xs text-destructive">
          {error.message}
        </pre>
      )}

      <Button onClick={onRetry ?? (() => window.location.reload())} className="h-9 rounded-full px-4">
        <RotateCw className="size-3.5" />
        Tentar novamente
      </Button>
    </div>
  )
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

export { ErrorBoundary, ErrorScreen }
