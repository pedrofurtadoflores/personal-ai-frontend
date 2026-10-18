"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertTriangleIcon, Loader2Icon, MenuIcon, ServerCrashIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SearchPalette } from "@/components/layout/search-palette"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { api, unwrap } from "@/lib/api"
import { useToken } from "@/lib/auth"
import { formatUsd } from "@/lib/format"
import { useMonthStatus } from "@/lib/queries"

/** Alerta de gasto do mês (D23: só avisa, nunca bloqueia). */
function UsageBanner() {
  const month = useMonthStatus()
  const [dismissed, setDismissed] = useState(false)
  if (!month.data || month.data.alert === "ok" || dismissed) return null
  const exceeded = month.data.alert === "exceeded"
  return (
    <div
      className={`flex items-center gap-2 px-4 py-1.5 text-xs ${exceeded ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
    >
      <AlertTriangleIcon className="size-3.5 shrink-0" />
      <span>
        {exceeded ? "Você passou do limite do mês" : "Você está perto do limite do mês"}:{" "}
        {formatUsd(month.data.costUsd)} de {formatUsd(month.data.limitUsd)}.
      </span>
      <Link href="/uso" className="underline">
        ver uso
      </Link>
      <button className="ml-auto underline" onClick={() => setDismissed(true)}>
        ocultar
      </button>
    </div>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const token = useToken()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Confirma com o servidor que o token ainda vale (senha trocada, logout-all, segredo novo):
  // ao abrir, ao voltar para a aba (depois de 1 min) e a cada 5 min.
  // Se não valer, o cliente da API limpa a sessão e o efeito abaixo redireciona.
  const session = useQuery({
    queryKey: ["auth", "me", token],
    queryFn: () => unwrap(api.GET("/auth/me")),
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  })

  useEffect(() => {
    if (token === null) router.replace("/login")
  }, [token, router])

  // Atalhos: Ctrl/Cmd+K busca, Ctrl/Cmd+Shift+O nova conversa.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault()
        router.push("/")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router])

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
        <AppSidebar onSearch={() => setSearchOpen(true)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b p-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <AppSidebar
                onNavigate={() => setMobileOpen(false)}
                onSearch={() => {
                  setMobileOpen(false)
                  setSearchOpen(true)
                }}
              />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Personal AI</span>
        </header>

        <UsageBanner />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
