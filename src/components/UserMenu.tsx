import { LogOut } from "lucide-react"
import * as React from "react"
import type { User } from "firebase/auth"

import { Button } from "@/components/ui/button"
import { logout } from "@/lib/auth"
import { cn } from "@/lib/utils"

// Login por email/senha não traz displayName nem photoURL, só o email.
function firstNameOf(user: User) {
  const source = user.displayName || user.email?.split("@")[0] || "Conta"
  const first = source.split(/[\s._-]+/)[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

function Avatar({ user, className }: { user: User; className?: string }) {
  const [failed, setFailed] = React.useState(false)

  if (user.photoURL && !failed) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("size-8 rounded-full object-cover", className)}
      />
    )
  }

  return (
    <span
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground",
        className
      )}
    >
      {firstNameOf(user).charAt(0)}
    </span>
  )
}

function UserMenu({ user, inline = false }: { user: User; inline?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  if (inline) {
    return (
      <div className="mt-2 space-y-2">
        <div className="flex items-center gap-2 px-2 py-1">
          <Avatar user={user} />
          <span className="text-sm font-medium">{firstNameOf(user)}</span>
        </div>
        <Button variant="outline" onClick={() => void logout()} className="h-9 w-full rounded-full">
          <LogOut className="size-3.5" />
          Sair
        </Button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-full border border-border pl-1 pr-3 transition-colors hover:bg-card"
      >
        <Avatar user={user} className="size-7" />
        <span className="text-sm font-medium">{firstNameOf(user)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-border bg-card p-1 shadow-lg shadow-black/30">
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-background"
          >
            <LogOut className="size-3.5" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

export { UserMenu }
