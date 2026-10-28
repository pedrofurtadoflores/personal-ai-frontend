"use client"

import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SettingsIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { QuickAddDialog, type QuickDraft } from "@/components/finance/dialogs"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { api, unwrap } from "@/lib/api"
import {
  addMonths,
  currentMonth,
  monthLabel,
  useFinAccounts,
  useFinCategories,
  useReview,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

/** Mês em exibição (na URL, `?mes=AAAA-MM`). */
export function useFinanceMonth() {
  const params = useSearchParams()
  const raw = params.get("mes")
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonth()
}

const TABS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/revisar", label: "Revisar" },
  { href: "/financeiro/extratos", label: "Extratos" },
  { href: "/financeiro/planejamento", label: "Planejamento" },
  { href: "/financeiro/dividas", label: "Dívidas" },
  { href: "/financeiro/patrimonio", label: "Patrimônio" },
]

/** Cabeçalho, mês, lançamento rápido e abas de todas as telas do Financeiro. */
export function FinanceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const month = useFinanceMonth()
  const review = useReview()
  const accounts = useFinAccounts()
  const categories = useFinCategories()
  const pending = (review.data?.items.length ?? 0) + (review.data?.ruleSuggestions.length ?? 0)
  const [quick, setQuick] = useState("")
  const [draft, setDraft] = useState<QuickDraft | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const withMonth = (href: string, m = month) => (m === currentMonth() ? href : `${href}?mes=${m}`)

  // Atalho N: lançamento rápido (fora de campos de texto).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (event.key.toLowerCase() !== "n" || event.ctrlKey || event.metaKey || event.altKey) return
      if (target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      event.preventDefault()
      quickRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  async function submitQuick(event: React.FormEvent) {
    event.preventDefault()
    const text = quick.trim()
    if (!text) return
    try {
      setDraft(await unwrap(api.POST("/finance/quick-parse", { body: { text } })))
      setQuick("")
    } catch {
      toast.error("Não entendi. Tente algo como “50 feira bradesco ontem”.")
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <div className="flex items-center rounded-lg border bg-card">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mês anterior"
            render={<Link href={withMonth(pathname, addMonths(month, -1))} />}
            nativeButton={false}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 px-1 text-center text-sm font-semibold">
            {monthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo mês"
            render={<Link href={withMonth(pathname, addMonths(month, 1))} />}
            nativeButton={false}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <form
          onSubmit={submitQuick}
          className="flex min-w-56 flex-1 items-center gap-1.5 rounded-lg border bg-card pr-1 pl-2.5 focus-within:ring-2 focus-within:ring-ring max-sm:order-last max-sm:basis-full"
        >
          <PlusIcon className="size-4 text-muted-foreground" />
          <input
            ref={quickRef}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Lançar rápido: 50 feira bradesco ontem"
            aria-label="Lançamento rápido"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          <Kbd>N</Kbd>
        </form>
        <Button
          variant="outline"
          render={<Link href="/financeiro/extratos" />}
          nativeButton={false}
        >
          <UploadIcon /> Adicionar extrato
        </Button>
      </div>

      <nav
        aria-label="Seções do Financeiro"
        className="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]"
      >
        {TABS.filter(
          (t) => t.href !== "/financeiro/revisar" || pending > 0 || pathname === t.href,
        ).map((tab) => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={withMonth(tab.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                active && "border-foreground font-semibold text-foreground",
              )}
            >
              {tab.label}
              {tab.href === "/financeiro/revisar" && pending > 0 && (
                <span className="rounded-full bg-amber-500/15 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
        <Link
          href="/financeiro/ajustes"
          aria-label="Ajustes"
          title="Ajustes: contas, categorias e regras"
          aria-current={pathname === "/financeiro/ajustes" ? "page" : undefined}
          className={cn(
            "ml-auto shrink-0 border-b-2 border-transparent px-2.5 py-2 text-muted-foreground hover:text-foreground",
            pathname === "/financeiro/ajustes" && "border-foreground text-foreground",
          )}
        >
          <SettingsIcon className="size-4" />
        </Link>
      </nav>

      {children}

      <QuickAddDialog
        draft={draft}
        onClose={() => setDraft(null)}
        accounts={accounts.data ?? []}
        categories={categories.data ?? []}
      />
    </div>
  )
}
