"use client"

import { MoreHorizontalIcon, PlusIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CategoryPicker } from "@/components/finance/category-picker"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, unwrap } from "@/lib/api"
import {
  type Bill,
  dayMonth,
  type FinAccount,
  type FinCategory,
  monthName,
  money,
  parseDayInput,
  parseMoney,
  patchTransaction,
  plainMoney,
  shortMonth,
  type Tx,
  type TxPatch,
  useFinanceAction,
  useFinanceRefresh,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

export type RowActions = {
  onDefer: (tx: Tx) => void
  onPay: (tx: Tx) => void
  onSplit: (tx: Tx) => void
}

const FLAG: Record<
  NonNullable<Tx["flag"]>,
  { label: (tx: Tx) => string; tone: "warn" | "crit" | "info"; tip?: string }
> = {
  deferred_out: {
    label: (tx) => `Adiada → ${dayMonth(tx.date)}`,
    tone: "warn",
    tip: "Fora do total deste mês",
  },
  in_invoice: {
    label: (tx) => `Fatura ${dayMonth(tx.invoiceDue!)}`,
    tone: "info",
    tip: "Compra no cartão: soma nas saídas pela fatura, no mês em que ela vence",
  },
  deferred_in: {
    label: (tx) =>
      `Adiada de ${shortMonth((tx.recurringPeriod ?? tx.deferredFrom ?? tx.date).slice(0, 7))}`,
    tone: "warn",
  },
  paid_late: { label: () => "Paga com atraso", tone: "warn" },
  paid_early: {
    label: (tx) => `Adiantada · ${shortMonth((tx.recurringPeriod ?? tx.date).slice(0, 7))}`,
    tone: "info",
  },
  overdue: { label: () => "Vencida", tone: "crit" },
  due_today: { label: () => "Vence hoje", tone: "warn" },
}

/** Fica fora do total do mês: adiada para outro mês ou compra no cartão, que soma pela fatura. */
const notCounted = (tx: Tx) => tx.flag === "deferred_out" || tx.flag === "in_invoice"

const toneClass = {
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  crit: "bg-destructive/10 text-destructive",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
}

export function FlagPill({ tx }: { tx: Tx }) {
  if (!tx.flag) return null
  const flag = FLAG[tx.flag]
  return (
    <span
      title={tx.deferralReason ?? flag.tip}
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        toneClass[flag.tone],
      )}
    >
      {flag.label(tx)}
    </span>
  )
}

/** De onde veio a categoria e o texto original do banco (dica da descrição, F51). */
function sourceHint(tx: Tx) {
  const source =
    tx.status === "planned"
      ? "Prevista"
      : tx.status === "review"
        ? "Esperando você categorizar"
        : tx.manual
          ? "Lançada por você · aguardando o extrato"
          : tx.categorySource === "ai"
            ? `Categorizada pela IA (${Math.round((tx.aiConfidence ?? 0) * 100)}% de certeza)`
            : tx.categorySource === "rule"
              ? "Categorizada por uma regra sua"
              : "Editada por você"
  return tx.originalDescription ? `${source} · banco: ${tx.originalDescription}` : source
}

/** Pula para a mesma coluna na linha de baixo (ou de cima) da mesma tabela. */
function moveFocus(from: HTMLElement, dir: 1 | -1) {
  const table = from.closest("table")
  const col = from.dataset.col
  if (!table || !col) return
  const cells = [...table.querySelectorAll<HTMLElement>(`[data-col="${col}"]:not([disabled])`)]
  const next = cells[cells.indexOf(from) + dir]
  if (next) {
    next.focus()
    if (next instanceof HTMLInputElement) next.select()
  }
}

/** Célula de texto: salva ao sair ou com Enter; Esc desfaz. */
function TextCell({
  value,
  onCommit,
  col,
  className,
  disabled,
  ariaLabel,
  title,
  inputMode,
}: {
  value: string
  onCommit: (value: string) => void
  col: string
  className?: string
  disabled?: boolean
  ariaLabel: string
  title?: string
  inputMode?: "decimal" | "numeric"
}) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  const skip = useRef(false)
  // O valor salvo mudou (refetch): o rascunho acompanha.
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }
  return (
    <input
      data-col={col}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      inputMode={inputMode}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        if (skip.current) {
          skip.current = false
          return
        }
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault()
          const target = e.currentTarget
          if (draft !== value) onCommit(draft)
          skip.current = true
          moveFocus(target, e.key === "ArrowUp" ? -1 : 1)
        } else if (e.key === "Escape") {
          setDraft(value)
          skip.current = true
          e.currentTarget.blur()
        }
      }}
      className={cn(
        "h-9 w-full min-w-0 truncate rounded-md bg-transparent px-2 outline-none hover:ring-1 hover:ring-border focus:bg-background focus:ring-2 focus:ring-ring disabled:hover:ring-0",
        className,
      )}
    />
  )
}

function useRowEdit() {
  const refresh = useFinanceRefresh()
  const quiet = useFinanceAction(({ id, body }: { id: string; body: TxPatch }) =>
    patchTransaction(id, body),
  )
  const category = useFinanceAction(
    ({ id, body }: { id: string; body: TxPatch; label: string }) => patchTransaction(id, body),
    {
      success: (result, input) => {
        const suggestion = result.suggestion
        if (suggestion) {
          toast(`Sempre categorizar “${suggestion.pattern}” assim?`, {
            duration: 10_000,
            action: {
              label: "Criar regra",
              onClick: () => {
                void unwrap(
                  api.POST("/finance/rule-suggestions/{id}/accept", {
                    params: { path: { id: suggestion.id } },
                  }),
                ).then(() => {
                  toast.success("Regra criada. As próximas importações já usam ela.")
                  void refresh()
                })
              },
            },
          })
          return null
        }
        return `${input.label} → categoria alterada.`
      },
    },
  )
  return { quiet, category }
}

function RowMenu({ tx, actions }: { tx: Tx; actions: RowActions }) {
  const run = useFinanceAction((fn: () => Promise<unknown>) => fn(), {
    success: (result) => (result as { message?: string })?.message ?? null,
  })
  const items: { label: string; onClick: () => void }[] = []
  if (tx.class === "normal")
    items.push({
      label: tx.splits?.length ? "Editar divisão" : "Dividir em categorias",
      onClick: () => actions.onSplit(tx),
    })
  if (tx.payable)
    items.push({
      label: tx.amount > 0 ? "Já recebi" : "Já paguei",
      onClick: () => actions.onPay(tx),
    })
  if (tx.status === "planned" && tx.flag !== "deferred_out")
    items.push({ label: "Adiar para outra data", onClick: () => actions.onDefer(tx) })
  if (tx.deferredFrom)
    items.push({
      label: "Desfazer adiamento",
      onClick: () =>
        run.mutate(async () => ({
          ...(await unwrap(
            api.POST("/finance/transactions/{id}/undefer", { params: { path: { id: tx.id } } }),
          )),
          message: `${tx.description} voltou para ${dayMonth(tx.deferredFrom!)}.`,
        })),
    })
  if (tx.class === "normal" && tx.status !== "planned")
    items.push({
      label: "Marcar como transferência",
      onClick: () =>
        run.mutate(async () => ({
          ...(await patchTransaction(tx.id, { class: "transfer" })),
          message: `${tx.description} virou transferência entre contas e saiu dos totais.`,
        })),
    })
  if (tx.manual || tx.status === "planned")
    items.push({
      label: "Excluir",
      onClick: () =>
        run.mutate(async () => ({
          ...(await unwrap(
            api.DELETE("/finance/transactions/{id}", { params: { path: { id: tx.id } } }),
          )),
          message: `${tx.description} excluída.`,
        })),
    })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Mais ações"
            className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onClick={item.onClick}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FlowRow({
  tx,
  side,
  month,
  categories,
  accounts,
  actions,
  highlight,
}: {
  tx: Tx
  side: "income" | "expense"
  month: string
  categories: FinCategory[]
  accounts: FinAccount[]
  actions: RowActions
  highlight: boolean
}) {
  const { quiet, category } = useRowEdit()
  const out = tx.flag === "deferred_out"
  const viaInvoice = tx.flag === "in_invoice"
  const shownDate = out ? tx.deferredFrom! : tx.date
  const value = side === "expense" ? -tx.amount : tx.amount
  const nature =
    tx.nature ??
    categories.find((c) => c.id === (tx.splits?.[0]?.categoryId ?? tx.categoryId))?.nature ??
    "variable"
  const account = accounts.find((a) => a.id === tx.accountId)
  const planned = tx.status === "planned"
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [highlight])

  const cell = "border-b border-border/60 p-0 align-middle max-md:border-0"
  return (
    <tr
      ref={ref}
      data-row={tx.id}
      className={cn(
        "group hover:bg-muted/40 max-md:grid max-md:grid-cols-[56px_minmax(0,1fr)_auto] max-md:border-b max-md:py-1 max-md:[grid-template-areas:'date_desc_val'_'cat_cat_acc'_'note_note_type']",
        planned && "text-muted-foreground italic",
        out && "opacity-60",
        highlight && "animate-pulse bg-primary/10",
      )}
    >
      <td className={cn(cell, "w-14 max-md:[grid-area:date]")}>
        <TextCell
          col="date"
          ariaLabel="Data"
          value={dayMonth(shownDate)}
          disabled={out}
          className="tabular-nums"
          onCommit={(raw) => {
            const date = parseDayInput(raw, month)
            if (!date) return toast.error("Data inválida. Use dd/mm.")
            quiet.mutate({ id: tx.id, body: { date } })
          }}
        />
      </td>
      <td className={cn(cell, "max-md:[grid-area:desc]")}>
        <div className="flex min-w-0 items-center gap-1 pr-1">
          <TextCell
            col="desc"
            ariaLabel="Descrição"
            value={tx.description}
            title={sourceHint(tx)}
            onCommit={(description) => quiet.mutate({ id: tx.id, body: { description } })}
          />
          <FlagPill tx={tx} />
        </div>
      </td>
      <td className={cn(cell, "w-32 max-md:[grid-area:cat]")}>
        {tx.splits?.length ? (
          <button
            className="h-9 w-full truncate rounded-md px-2 text-left hover:ring-1 hover:ring-border"
            title={tx.splits
              .map((s) => categories.find((c) => c.id === s.categoryId)?.name ?? "?")
              .join(" + ")}
            onClick={() => actions.onSplit(tx)}
          >
            Dividida
          </button>
        ) : (
          <CategoryPicker
            value={tx.categoryId}
            categories={categories}
            suggested={tx.aiSuggestions}
            aiHint={tx.status === "auto"}
            onChange={(categoryId) =>
              category.mutate({ id: tx.id, body: { categoryId }, label: tx.description })
            }
          />
        )}
      </td>
      <td className={cn(cell, "w-24 max-md:[grid-area:acc]")}>
        {tx.editableAmount ? (
          <select
            data-col="acc"
            aria-label="Conta"
            value={tx.accountId}
            onChange={(e) => quiet.mutate({ id: tx.id, body: { accountId: e.target.value } })}
            className="h-9 w-full rounded-md bg-transparent px-1.5 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="block truncate px-2 text-sm text-muted-foreground not-italic">
            {account?.name}
          </span>
        )}
      </td>
      <td className={cn(cell, "w-20 max-md:[grid-area:type]")}>
        <button
          className={cn(
            "h-9 w-full rounded-md px-2 text-left text-sm hover:bg-muted",
            tx.nature && "underline decoration-dotted underline-offset-4",
          )}
          title={
            tx.nature
              ? "Trocado só nesta linha"
              : "Padrão da categoria · clique para trocar só aqui"
          }
          onClick={() =>
            quiet.mutate({ id: tx.id, body: { nature: nature === "fixed" ? "variable" : "fixed" } })
          }
        >
          {nature === "fixed" ? "Fixo" : "Variável"}
        </button>
      </td>
      <td className={cn(cell, "w-24 text-right max-md:[grid-area:val]")}>
        {tx.editableAmount ? (
          <TextCell
            col="val"
            ariaLabel="Valor"
            inputMode="decimal"
            className="text-right tabular-nums"
            value={plainMoney(tx.amount)}
            onCommit={(raw) => {
              const cents = parseMoney(raw)
              if (cents === null) return toast.error("Valor inválido.")
              quiet.mutate({
                id: tx.id,
                body: {
                  amount:
                    (tx.amount > 0 || (tx.amount === 0 && side === "income") ? 1 : -1) * cents,
                },
              })
            }}
          />
        ) : (
          <span
            title={
              out
                ? "Fora do total deste mês"
                : viaInvoice
                  ? `Soma pela fatura de ${dayMonth(tx.invoiceDue!)}`
                  : "Valor do banco"
            }
            className={cn(
              "block px-2 tabular-nums",
              value < 0 && "text-emerald-700 dark:text-emerald-400",
              (out || viaInvoice) && "text-muted-foreground",
            )}
          >
            {value < 0 ? "−" : ""}
            {plainMoney(value)}
          </span>
        )}
      </td>
      <td className={cn(cell, "w-40 max-md:[grid-area:note]")}>
        <div className="flex items-center gap-1 pr-1">
          <TextCell
            col="note"
            ariaLabel="Notas"
            value={tx.notes ?? ""}
            className="text-sm text-muted-foreground focus:text-foreground"
            onCommit={(notes) => quiet.mutate({ id: tx.id, body: { notes: notes || null } })}
          />
          {tx.payable && (
            <Button
              size="xs"
              variant="outline"
              className="shrink-0 not-italic"
              onClick={() => actions.onPay(tx)}
            >
              {tx.amount > 0 ? "Já recebi" : "Já paguei"}
            </Button>
          )}
          <RowMenu tx={tx} actions={actions} />
        </div>
      </td>
    </tr>
  )
}

/** Fatura do cartão (F81): uma linha só, sem edição; as compras dela aparecem nos meses delas. */
function BillRow({ bill, accounts }: { bill: Bill; accounts: FinAccount[] }) {
  const card = accounts.find((a) => a.id === bill.accountId)?.name ?? "Cartão"
  const cell = "border-b border-border/60 px-2 py-2 align-middle max-md:border-0 max-md:py-0.5"
  return (
    <tr
      className={cn(
        "bg-sky-500/5 max-md:grid max-md:grid-cols-[56px_minmax(0,1fr)_auto] max-md:border-b max-md:py-1 max-md:[grid-template-areas:'date_desc_val'_'cat_cat_acc'_'note_note_type']",
        !bill.paid && "text-muted-foreground italic",
      )}
    >
      <td className={cn(cell, "tabular-nums max-md:[grid-area:date]")}>{dayMonth(bill.dueDate)}</td>
      <td className={cn(cell, "max-md:[grid-area:desc]")}>
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate font-medium not-italic">Fatura {card}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold not-italic",
              bill.paid ? toneClass.info : toneClass.warn,
            )}
          >
            {bill.paid ? "Paga" : "A pagar"}
          </span>
        </div>
      </td>
      <td className={cn(cell, "text-muted-foreground max-md:[grid-area:cat]")}>—</td>
      <td className={cn(cell, "truncate text-muted-foreground max-md:[grid-area:acc]")}>{card}</td>
      <td className={cn(cell, "max-md:[grid-area:type]")}>Variável</td>
      <td className={cn(cell, "text-right tabular-nums max-md:[grid-area:val]")}>
        {plainMoney(bill.amount)}
      </td>
      <td className={cn(cell, "text-xs text-muted-foreground max-md:[grid-area:note]")}>
        compras até {dayMonth(bill.closingDate)}
      </td>
    </tr>
  )
}

/** Planilha do fluxo (F31/F46/F53): uma linha por lançamento, editável célula a célula. */
export function FlowTable({
  rows,
  bills = [],
  side,
  month,
  today,
  categories,
  accounts,
  actions,
  onNew,
  highlightId,
}: {
  rows: Tx[]
  /** Faturas que vencem no mês (só nas saídas, F81). */
  bills?: Bill[]
  side: "income" | "expense"
  month: string
  today: string
  categories: FinCategory[]
  accounts: FinAccount[]
  actions: RowActions
  onNew: (description: string) => void
  highlightId?: string | null
}) {
  const sign = side === "expense" ? -1 : 1
  const counted = rows.filter((t) => !notCounted(t))
  const realized =
    counted.filter((t) => t.status !== "planned").reduce((s, t) => s + sign * t.amount, 0) +
    bills.filter((b) => b.paid).reduce((s, b) => s + b.amount, 0)
  const planned =
    counted.filter((t) => t.status === "planned").reduce((s, t) => s + sign * t.amount, 0) +
    bills.filter((b) => !b.paid).reduce((s, b) => s + b.amount, 0)
  const fixed = counted
    .filter(
      (t) =>
        (t.nature ??
          categories.find((c) => c.id === (t.splits?.[0]?.categoryId ?? t.categoryId))?.nature) ===
        "fixed",
    )
    .reduce((s, t) => s + sign * t.amount, 0)
  const total = realized + planned
  const label = side === "expense" ? "Saídas" : "Entradas"
  const showToday = month === today.slice(0, 7)
  // Lançamentos e faturas na ordem das datas (a fatura na data do vencimento).
  const items = [
    ...rows.map((tx) => ({
      key: tx.id,
      date: tx.flag === "deferred_out" ? tx.deferredFrom! : tx.date,
      tx,
      bill: null,
    })),
    ...bills.map((bill) => ({
      key: `fatura-${bill.accountId}-${bill.dueDate}`,
      date: bill.dueDate,
      tx: null,
      bill,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const todayIndex = showToday ? items.findIndex((item) => item.date >= today) : -1
  const scroller = useRef<HTMLDivElement>(null)
  const todayRow = useRef<HTMLTableRowElement>(null)
  const [newText, setNewText] = useState("")

  // Abre posicionada perto de hoje (F53).
  useEffect(() => {
    if (scroller.current && todayRow.current && !highlightId) {
      scroller.current.scrollTop = Math.max(0, todayRow.current.offsetTop - 140)
    }
  }, [month, highlightId])

  const todayLine = (
    <tr ref={todayRow} aria-hidden className="max-md:block">
      <td colSpan={7} className="p-0">
        <div className="mx-0 border-t-2 border-[var(--viz-1)] px-2 pt-0.5 text-[11px] font-bold tracking-wider text-[var(--viz-1)] uppercase">
          Hoje · {dayMonth(today)}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline gap-2 border-b px-3 py-2.5">
        <h3 className="font-semibold">{label}</h3>
        <span className="ml-auto font-semibold tabular-nums">{money(total)}</span>
      </div>
      <div ref={scroller} className="max-h-[68vh] overflow-auto max-md:max-h-none">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-sm max-md:block max-md:min-w-0">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground max-md:hidden">
            <tr className="border-b">
              {["Data", "Descrição", "Categoria", "Conta", "Tipo", "Valor", "Notas"].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "px-2 py-1.5 text-left font-medium",
                    i === 5 && "text-right",
                    ["w-14", "", "w-32", "w-24", "w-20", "w-24", "w-40"][i],
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="max-md:block">
            {items.map((item, i) => (
              <FragmentRow key={item.key} showToday={i === todayIndex} todayLine={todayLine}>
                {item.bill ? (
                  <BillRow bill={item.bill} accounts={accounts} />
                ) : (
                  <FlowRow
                    tx={item.tx!}
                    side={side}
                    month={month}
                    categories={categories}
                    accounts={accounts}
                    actions={actions}
                    highlight={highlightId === item.tx!.id}
                  />
                )}
              </FragmentRow>
            ))}
            {showToday && todayIndex === -1 && todayLine}
            {!items.length && (
              <tr className="max-md:block">
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  Nada em {monthName(month)}.
                </td>
              </tr>
            )}
            <tr className="max-md:block">
              <td colSpan={7} className="p-0">
                <form
                  className="flex items-center gap-1 px-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    onNew(newText.trim())
                    setNewText("")
                  }}
                >
                  <PlusIcon className="size-4 text-muted-foreground" />
                  <input
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    aria-label={side === "expense" ? "Nova saída" : "Nova entrada"}
                    placeholder={
                      side === "expense"
                        ? "Nova saída (digite e Enter)"
                        : "Nova entrada (digite e Enter)"
                    }
                    className="h-9 w-full bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                </form>
              </td>
            </tr>
          </tbody>
          <tfoot className="sticky bottom-0 bg-muted/60 text-xs max-md:static max-md:block">
            <tr className="max-md:flex max-md:justify-between">
              <td colSpan={5} className="px-2 py-2 text-muted-foreground">
                {planned
                  ? `${money(realized)} ${side === "expense" ? "pagos" : "recebidos"} + ${money(planned)} previstos · `
                  : ""}
                fixos {money(fixed)} · variáveis {money(total - fixed)}
              </td>
              <td className="px-2 py-2 text-right text-sm font-semibold tabular-nums">
                {money(total)}
              </td>
              <td className="max-md:hidden" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function FragmentRow({
  showToday,
  todayLine,
  children,
}: {
  showToday: boolean
  todayLine: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <>
      {showToday && todayLine}
      {children}
    </>
  )
}

/** Coluna resumida (F47): total e os últimos lançamentos; clicar abre a planilha. */
export function MiniColumn({
  rows,
  bills = [],
  side,
  onOpen,
}: {
  rows: Tx[]
  bills?: Bill[]
  side: "income" | "expense"
  onOpen: (txId?: string) => void
}) {
  const sign = side === "expense" ? -1 : 1
  const counted = rows.filter((t) => !notCounted(t))
  const total =
    counted.reduce((s, t) => s + sign * t.amount, 0) + bills.reduce((s, b) => s + b.amount, 0)
  const nPlanned = counted.filter((t) => t.status === "planned").length
  const label = side === "expense" ? "Saídas" : "Entradas"
  const last = rows.slice(-8).reverse()
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-muted/30">
      <button className="flex items-baseline gap-2 px-3 pt-2.5 text-left" onClick={() => onOpen()}>
        <h3 className="font-semibold">{label}</h3>
        <span className="ml-auto font-semibold tabular-nums">{money(total)}</span>
      </button>
      <p className="border-b px-3 pb-2 text-xs text-muted-foreground">
        {counted.length} lançamentos{nPlanned ? ` · ${nPlanned} previstos` : ""}
        {bills.length ? ` · ${bills.length === 1 ? "1 fatura" : `${bills.length} faturas`}` : ""}
      </p>
      <ul className="py-1">
        {bills.map((b) => (
          <li key={`fatura-${b.accountId}-${b.dueDate}`}>
            <button
              onClick={() => onOpen()}
              className={cn(
                "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-1.5 px-3 py-1 text-left text-xs font-medium hover:bg-card",
                !b.paid && "text-muted-foreground italic",
              )}
            >
              <span className="text-muted-foreground tabular-nums">{dayMonth(b.dueDate)}</span>
              <span className="truncate">Fatura do cartão</span>
              <span className="tabular-nums">{plainMoney(b.amount)}</span>
            </button>
          </li>
        ))}
        {last.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onOpen(t.id)}
              className={cn(
                "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-1.5 px-3 py-1 text-left text-xs hover:bg-card",
                t.status === "planned" && "text-muted-foreground italic",
                notCounted(t) && "opacity-50",
              )}
            >
              <span className="text-muted-foreground tabular-nums">
                {dayMonth(t.flag === "deferred_out" ? t.deferredFrom! : t.date)}
              </span>
              <span className="truncate">{t.description}</span>
              <span className="tabular-nums">{plainMoney(sign * t.amount)}</span>
            </button>
          </li>
        ))}
      </ul>
      {rows.length > 8 && (
        <p className="px-3 text-xs text-muted-foreground">+ {rows.length - 8} mais antigos</p>
      )}
      <Button variant="outline" size="sm" className="m-2" onClick={() => onOpen()}>
        Abrir {label.toLowerCase()} ›
      </Button>
    </div>
  )
}
