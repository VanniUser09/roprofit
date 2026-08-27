import * as React from "react"
import { Eye, EyeOff, KeyRound, Mail, Sparkles, User as UserIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const GoogleIcon = (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
  <img src="https://svgl.app/library/google.svg" alt="" {...props} />
)

const MicrosoftIcon = (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
  <img src="https://svgl.app/library/microsoft.svg" alt="" {...props} />
)

interface AuthFormProps extends React.HTMLAttributes<HTMLDivElement> {
  onEmailSubmit?: (data: { email: string; password?: string }) => void
  onSignUp?: (data: { name: string; email: string; password: string }) => void
  onSocialSignIn?: (provider: "google" | "microsoft") => void
  onEmailLink?: (email: string) => void
  onForgotPassword?: (email: string) => void
  error?: string | null
  notice?: string | null
  pending?: boolean
}

const AuthForm = React.forwardRef<HTMLDivElement, AuthFormProps>(
  (
    {
      className,
      onEmailSubmit,
      onSignUp,
      onSocialSignIn,
      onEmailLink,
      onForgotPassword,
      error,
      notice,
      pending,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = React.useState(false)
    const [email, setEmail] = React.useState("")
    const [signUpMode, setSignUpMode] = React.useState(false)

    const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      const email = formData.get("email") as string
      const password = formData.get("password") as string
      if (signUpMode) {
        onSignUp?.({ name: formData.get("name") as string, email, password })
        return
      }
      onEmailSubmit?.({ email, password })
    }

    return (
      <Card ref={ref} className={cn("w-full max-w-md", className)} {...props}>
        <CardHeader className="text-left">
          <CardTitle className="text-2xl">{signUpMode ? "Criar conta" : "Entrar"}</CardTitle>
          <CardDescription>
            {signUpMode
              ? "Leva menos de um minuto e já libera suas compras de Robux."
              : "Acesse sua conta para acompanhar seus pedidos de Robux."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {signUpMode ? "Cadastrar com" : "Entrar com"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => onSocialSignIn?.("google")}>
                  <GoogleIcon className="size-4" />
                </Button>
                <Button type="button" variant="outline" onClick={() => onSocialSignIn?.("microsoft")}>
                  <MicrosoftIcon className="size-4" />
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {signUpMode && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      name="name"
                      autoComplete="given-name"
                      placeholder="Como podemos te chamar"
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="seuemail@exemplo.com"
                    className="pl-9"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Senha</Label>
                  {!signUpMode && (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={() => onForgotPassword?.(email)}
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="pl-9 pr-10"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {notice && <p className="text-sm text-primary">{notice}</p>}

              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? (signUpMode ? "Criando..." : "Entrando...") : signUpMode ? "Criar conta" : "Entrar"}
              </Button>
            </form>
          </div>
        </CardContent>

        <CardFooter className="flex-col items-start space-y-4">
          {!signUpMode && (
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => onEmailLink?.(email)}>
              <Sparkles className="mr-2 size-4" />
              Ou receba um link por email
            </Button>
          )}

          <p className="w-full text-center text-sm text-muted-foreground">
            {signUpMode ? "Já tem conta?" : "Não tem conta?"}{" "}
            <button
              type="button"
              onClick={() => setSignUpMode((v) => !v)}
              className="font-medium text-primary hover:underline"
            >
              {signUpMode ? "Entrar" : "Cadastre-se"}
            </button>
          </p>
          <p className="w-full text-center text-xs text-muted-foreground">
            Ao entrar, você concorda com nossos{" "}
            <a href="#" className="underline hover:text-primary">
              Termos de uso
            </a>{" "}
            e{" "}
            <a href="#" className="underline hover:text-primary">
              Política de privacidade
            </a>
            .
          </p>
        </CardFooter>
      </Card>
    )
  }
)
AuthForm.displayName = "AuthForm"

export { AuthForm }
