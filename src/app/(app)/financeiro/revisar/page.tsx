"use client"

import { CheckCircle2Icon, CheckIcon, CopyIcon, Loader2Icon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CategoryPicker } from "@/components/finance/category-picker"
import { SplitDialog } from "@/components/finance/dialogs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { api, unwrap } from "@/lib/api"
import {
  dayMonth,
  fullDate,
  money,
  patchTransaction,
  signedMoney,
  type Tx,
  useFinAccounts,
  useFinanceAction,
  useFinCategories,
  useReview,
} from "@/lib/finance"

/** Copia o texto do banco (para buscar o nome da loja, por exemplo). */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copiar nome"
      title="Copiar nome"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          },
          () => toast.error("Não deu para copiar."),
        )
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

/** Fila Revisar pelo teclado (F37): um item por vez. */
export default function RevisarPage() {
  const review = useReview()
  const categories = useFinCategories()
  const accounts = useFinAccounts()
  const [index, setIndex] = useState(0)
  const [applyToSame, setApplyToSame] = useState(true)
  const [rename, setRename] = useState("")
  const [split, setSplit] = useState<Tx | null>(null)
  const [resolved, setResolved] = useState(0)
  const currentRef = useRef<HTMLLIElement>(null)

  const resolve = useFinanceAction(
    (input: { id: string; categoryId: string; description?: string; label: string }) =>
      unwrap(
        api.POST("/finance/review/{id}", {
          params: { path: { id: input.id } },
          body: { categoryId: input.categoryId, applyToSame, description: input.description },
        }),
      ),
    {
      success: (result, input) => {
        setResolved((n) => n + result.resolved)
        setRename("")
        return result.resolved > 1
          ? `${input.label} e mais ${result.resolved - 1} iguais categorizadas.`
          : `${input.label} categorizada.`
      },
    },
  )
  const transfer = useFinanceAction((tx: Tx) => patchTransaction(tx.id, { class: "transfer" }), {
    success: (_r, tx) => `${tx.description} virou transferência entre contas.`,
  })
  const suggestion = useFinanceAction(
    ({ id, accept }: { id: string; accept: boolean }): Promise<unknown> =>
      accept
        ? unwrap(api.POST("/finance/rule-suggestions/{id}/accept", { params: { path: { id } } }))
        : unwrap(api.POST("/finance/rule-suggestions/{id}/dismiss", { params: { path: { id } } })),
    { success: (_r, input) => (input.accept ? "Regra criada." : "Ok, não sugiro isso de novo.") },
  )

  const items = review.data?.items ?? []
  const current = items[Math.min(index, Math.max(items.length - 1, 0))]
  const cats = categories.data ?? []
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "?"
  const options = current
    ? [
        ...new Set([
          ...current.aiSuggestions,
          ...current.context.map((c) => c.categoryId).filter((id): id is string => !!id),
        ]),
      ]
        .filter((id) => cats.some((c) => c.id === id))
        .slice(0, 3)
    : []
  const pick = (categoryId: string) =>
    current &&
    resolve.mutate({
      id: current.id,
      categoryId,
      description: rename.trim() || undefined,
      label: rename.trim() || current.description,
    })

  // 1/2/3 escolhem, S pula (fora de campos de texto).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.target as HTMLElement).closest(
          "input, textarea, select, [role=dialog], [data-slot=popover-content]",
        )
      )
        return
      if (["1", "2", "3"].includes(event.key) && options[Number(event.key) - 1])
        pick(options[Number(event.key) - 1]!)
      if (event.key.toLowerCase() === "s" && items.length > 1)
        setIndex((i) => (i + 1) % items.length)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // O item aberto fica na posição dele na lista; se saiu da tela (ex.: pulou com S), rola até ele.
  const currentId = current?.id
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [currentId])

  if (review.isLoading || !categories.data || !accounts.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const total = items.length + resolved
  const account = accounts.data.find((a) => a.id === current?.accountId)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Para categorizar
          </h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {resolved} de {total} · <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> escolhem, <Kbd>S</Kbd>{" "}
            pula
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--viz-1)] transition-all"
            style={{ width: `${total ? (resolved / total) * 100 : 100}%` }}
          />
        </div>

        {current ? (
          <ul className="flex flex-col">
            {items.map((item, i) =>
              item.id === current.id ? (
                <li
                  key={item.id}
                  ref={currentRef}
                  className="scroll-mt-4 border-t py-2 first:border-0 first:pt-0"
                >
                  <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <h3 className="text-lg font-semibold select-text">
                            {current.description}
                          </h3>
                          <CopyButton text={current.originalDescription ?? current.description} />
                        </div>
                        <p className="font-mono text-xs text-muted-foreground select-text">
                          {current.originalDescription} · {fullDate(current.date)} · {account?.name}
                        </p>
                      </div>
                      <span className="text-xl font-semibold tabular-nums">
                        {signedMoney(current.amount)}
                      </span>
                    </div>
                    {current.aiQuestion && (
                      <p className="flex gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                        <span className="h-fit rounded bg-foreground px-1 text-[10px] font-bold text-background">
                          IA
                        </span>
                        {current.aiQuestion}
                      </p>
                    )}
                    {current.context.length > 0 && (
                      <div className="text-xs">
                        <p className="text-muted-foreground">Antes neste lugar:</p>
                        {current.context.map((c) => (
                          <p key={c.date + c.amount} className="flex gap-2">
                            <span className="text-muted-foreground tabular-nums">
                              {dayMonth(c.date)}
                            </span>
                            <span>{catName(c.categoryId)}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {money(c.amount)}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                    {options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((id, i) => (
                          <Button
                            key={id}
                            variant="outline"
                            onClick={() => pick(id)}
                            disabled={resolve.isPending}
                          >
                            <Kbd>{i + 1}</Kbd> {catName(id)}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <CategoryPicker
                        variant="field"
                        value={null}
                        categories={cats}
                        onChange={(id) => id && pick(id)}
                        placeholder="Outra categoria (busque)"
                        allowNone={false}
                      />
                      <Input
                        value={rename}
                        onChange={(e) => setRename(e.target.value)}
                        placeholder="Renomear (opcional)"
                        aria-label="Renomear"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {items.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIndex((i) => (i + 1) % items.length)}
                        >
                          Pular <Kbd>S</Kbd>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setSplit(current)}>
                        Dividir em categorias
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => transfer.mutate(current)}>
                        É transferência entre contas
                      </Button>
                      {current.sameCount > 0 && (
                        <label className="ml-auto flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={applyToSame}
                            onChange={(e) => setApplyToSame(e.target.checked)}
                          />
                          aplicar também às {current.sameCount} iguais
                        </label>
                      )}
                    </div>
                  </div>
                </li>
              ) : (
                <li key={item.id} className="border-t first:border-0">
                  {/* div em vez de button: dá para selecionar o texto. Clique sem seleção abre o item. */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex w-full cursor-pointer items-center gap-3 py-2 text-left text-sm select-text hover:bg-muted/50"
                    onClick={() => {
                      if (window.getSelection()?.toString()) return
                      setIndex(i)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setIndex(i)
                      }
                    }}
                  >
                    <span className="w-12 text-xs text-muted-foreground tabular-nums">
                      {dayMonth(item.date)}
                    </span>
                    <span className="flex-1 truncate">{item.description}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {signedMoney(item.amount)}
                    </span>
                  </div>
                </li>
              ),
            )}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
            <CheckCircle2Icon className="size-6 text-emerald-600" />
            <h3 className="font-semibold">Tudo categorizado</h3>
            <p className="text-sm text-muted-foreground">
              Quando você importar outro extrato, o que não tiver regra aparece aqui.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Sugestões de regra
        </h2>
        {review.data?.ruleSuggestions.length ? (
          review.data.ruleSuggestions.map((s) => (
            <div key={s.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">
                Sempre categorizar <span className="font-mono">{s.pattern}</span> como{" "}
                {catName(s.categoryId)}?
              </p>
              <p className="text-xs text-muted-foreground">Você fez isso {s.evidence} vezes.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => suggestion.mutate({ id: s.id, accept: true })}>
                  Criar regra
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => suggestion.mutate({ id: s.id, accept: false })}
                >
                  Agora não
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma sugestão agora.</p>
        )}
      </section>

      <SplitDialog tx={split} categories={cats} onClose={() => setSplit(null)} />
    </div>
  )
}
