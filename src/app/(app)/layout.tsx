"use client"

import { useQuery } from "@tanstack/react-query"
import { Loader2Icon, MenuIcon, ServerCrashIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api, unwrap } from "@/lib/api"
import { useToken } from "@/lib/auth"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const token = useToken()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Confirma com o servidor que o token ainda vale (senha trocada, logout-all, segredo novo).
  // Se não valer, o cliente da API limpa a sessão e o efeito abaixo redireciona.
  const session = useQuery({
    queryKey: ["auth", "me", token],
    queryFn: () => unwrap(api.GET("/auth/me")),
    enabled: !!token,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (token === null) router.replace("/login")
  }, [token, router])

  if (session.isError && token) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <ServerCrashIcon className="size-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Não foi possível falar com o servidor.</p>
        <Button variant="outline" onClick={() => session.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (!token || !session.isSuccess) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <AppSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b p-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <AppSidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Personal AI</span>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}
