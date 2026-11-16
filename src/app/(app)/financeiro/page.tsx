"use client"

import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  Loader2Icon,
  ScaleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import {
  DeferDialog,
  PayDialog,
  QuickAddDialog,
  type QuickDraft,
  SplitDialog,
} from "@/components/finance/dialogs"
import { FlowTable, MiniColumn } from "@/components/finance/flow-table"
import { useFinanceMonth } from "@/components/finance/shell"
import { Button } from "@/components/ui/button"
import {
  currentMonth,
  dayMonth,
  lastDayOf,
  monthName,
  money,
  type Overview,
  signedMoney,
  tone,
  type Tx,
  useFinAccounts,
  useFinCategories,
  useOverview,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

/** Gastos por categoria aberto ou recolhido: lembrado só neste navegador. */
const CATS_OPEN_KEY = "financeiro.categorias.aberto"
function readCatsOpen() {
  try {
    return typeof window === "undefined" || localStorage.getItem(CATS_OPEN_KEY) !== "0"
  } catch {
    return true
  }
}

/** Visão geral (financeiro.md, 6.1): Precisa de você, Resumo, categorias e Fluxo do mês. */
export default function VisaoGeralPage() {
  const month = useFinanceMonth()
  const overview = useOverview(month)
  const accounts = useFinAccounts()
  const categories = useFinCategories()
  const [focus, setFocus] = useState<"income" | "expense">("expense")
  const [filter, setFilter] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [catsOpen, setCatsOpen] = useState(readCatsOpen)
  const toggleCats = () => {
    const next = !catsOpen
    setCatsOpen(next)
    try {
      localStorage.setItem(CATS_OPEN_KEY, next ? "1" : "0")
    } catch {
      // Sem armazenamento (aba anônima): só não lembra.
    }
  }
  const [highlight, setHighlight] = useState<string | null>(null)
  const [defer, setDefer] = useState<Tx | null>(null)
  const [pay, setPay] = useState<Tx | null>(null)
  const [split, setSplit] = useState<Tx | null>(null)
  const [draft, setDraft] = useState<QuickDraft | null>(null)

  if (!overview.data || !accounts.data || !categories.data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!accounts.data.length) {
    return (
      <div className="rounded-xl border p-8 text-center">
        <h2 className="font-semibold">Nenhuma conta ainda</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Rode a carga inicial ou cadastre as contas em Ajustes.
        </p>
        <Button className="mt-4" render={<Link href="/financeiro/ajustes" />} nativeButton={false}>
          Abrir Ajustes
        </Button>
      </div>
    )
  }

  const { totals, flow, alerts, today } = overview.data
  const cats = categories.data
  const catName = (id: string | null) =>
    id ? (cats.find((c) => c.id === id)?.name ?? "?") : "Sem categoria"
  const isCurrent = month === currentMonth()
  const matches = (tx: Tx) =>
    !filter ||
    (filter === "none"
      ? !tx.categoryId && !tx.splits?.length
      : tx.categoryId === filter || !!tx.splits?.some((s) => s.categoryId === filter))
  const sides = { income: flow.income.filter(matches), expense: flow.expense.filter(matches) }
  const actions = { onDefer: setDefer, onPay: setPay, onSplit: setSplit }
  const openSide = (side: "income" | "expense", txId?: string) => {
    setFocus(side)
    setHighlight(txId ?? null)
    if (txId) setTimeout(() => setHighlight(null), 1800)
  }
  const defaultAccount =
    accounts.data.find((a) => a.type !== "credit_card")?.id ?? accounts.data[0]!.id
  const newRow = (side: "income" | "expense") => (description: string) =>
    setDraft({
      description,
      amount: null,
      direction: side === "income" ? "in" : "out",
      date: isCurrent ? today : `${month}-01`,
      accountId: defaultAccount,
      categoryId: null,
    })

  const attn = [
    alerts.reviewCount > 0 && (
      <Chip key="r" href="/financeiro/revisar" tone="warn">
        {alerts.reviewCount} para categorizar
      </Chip>
    ),
    ...alerts.overdue.map((tx) => (
      <Chip key={tx.id} tone="crit" onClick={tx.payable ? () => setPay(tx) : undefined}>
        {tx.description} venceu em {dayMonth(tx.date)}
        {tx.payable ? " · já paguei?" : ""}
      </Chip>
    )),
    ...alerts.negativeAccounts.map((a) => (
      <Chip key={a.accountId} href="/financeiro/patrimonio" tone="crit">
        {accounts.data.find((x) => x.id === a.accountId)?.name} fica negativo até{" "}
        {dayMonth(lastDayOf(month))}
      </Chip>
    )),
    isCurrent && alerts.statementsUntil && (
      <Chip key="s" href="/financeiro/extratos" tone="info">
        Extratos até {dayMonth(alerts.statementsUntil)}
      </Chip>
    ),
  ].filter(Boolean)

  const expenseCats = overview.data.categories
  const named = expenseCats.filter((c) => c.categoryId)
  const none = expenseCats.find((c) => !c.categoryId)
  const shown = [...(showAll ? named : named.slice(0, 6)), ...(none ? [none] : [])]
  const totalOut = expenseCats.reduce((s, c) => s + c.amount, 0)
  // Parte de cada categoria sobre as entradas do mês; sem entradas, sobre as saídas.
  const totalIn = totals.incomeRealized + totals.incomePlanned
  const shareBase = totalIn > 0 ? totalIn : totalOut
  const shareOf = shareBase > 0 ? (amount: number) => Math.round((amount / shareBase) * 100) : null
  const shareLabel = totalIn > 0 ? "das entradas" : "das saídas"
  const scale = Math.max(...expenseCats.map((c) => Math.max(c.amount, c.average ?? 0)), 1)

  return (
    <div className="flex flex-col gap-7">
      {attn.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 px-3 py-2"
          role="region"
          aria-label="Precisa de você"
        >
          <span className="mr-1 text-xs font-semibold">Precisa de você</span>
          {attn}
        </div>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="s-resumo">
        <h2
          id="s-resumo"
          className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
        >
          Resumo de {monthName(month)}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <BalancesCard balances={overview.data.balances} accounts={accounts.data} today={today} />
          <MonthEndCard
            cash={overview.data.cash}
            accountName={accounts.data.find((a) => a.id === overview.data.cash?.accountId)?.name}
            month={month}
            today={today}
          />
        </div>
        <div className="grid divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <MiniStat
            icon={<ArrowDownLeftIcon />}
            iconClass={tone.income.soft}
            label="Entradas totais"
            value={money(totals.incomeRealized + totals.incomePlanned)}
            valueClass={tone.income.text}
            sub={
              totals.incomePlanned ? `${money(totals.incomePlanned)} a receber` : "tudo recebido"
            }
            onClick={() => openSide("income")}
          />
          <MiniStat
            icon={<ArrowUpRightIcon />}
            iconClass={tone.expense.soft}
            label="Saídas totais"
            value={money(totals.expenseRealized + totals.expensePlanned)}
            valueClass={tone.expense.text}
            sub={totals.expensePlanned ? `${money(totals.expensePlanned)} a pagar` : "tudo pago"}
            onClick={() => openSide("expense")}
          />
          <MiniStat
            icon={<ScaleIcon />}
            iconClass={totals.surplus >= 0 ? tone.income.soft : tone.expense.soft}
            label="Diferença"
            value={signedMoney(totals.surplus)}
            valueClass={totals.surplus >= 0 ? tone.income.text : tone.expense.text}
            sub={totals.surplus >= 0 ? "entrou mais do que saiu" : "saiu mais do que entrou"}
          />
        </div>

        {shown.length > 0 && (
          <div className="rounded-xl border bg-card px-2 py-2">
            <div className="flex flex-wrap items-center gap-3 px-2">
              <button
                className="flex items-center gap-1.5 text-sm font-semibold"
                aria-expanded={catsOpen}
                aria-controls="gastos-categoria"
                onClick={() => toggleCats()}
              >
                <ChevronRightIcon
                  className={cn("size-4 transition-transform", catsOpen && "rotate-90")}
                />
                Gastos por categoria
                {!catsOpen && (
                  <span className={cn("font-normal tabular-nums", tone.expense.text)}>
                    · {money(totalOut)}
                  </span>
                )}
              </button>
              {catsOpen && (
                <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="h-2.5 w-0.5 rounded-sm bg-foreground/50" aria-hidden /> média de 3
                    meses
                  </span>
                  {shareOf && <span>% = parte {shareLabel} do mês</span>}
                </span>
              )}
              {catsOpen && named.length > 6 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Mostrar menos" : `Ver todas (${named.length})`}
                </Button>
              )}
            </div>
            <ul id="gastos-categoria" aria-label="Gastos por categoria" hidden={!catsOpen}>
              {shown.map((c) => {
                const pct = c.average
                  ? Math.round(((c.amount - c.average) / c.average) * 100)
                  : null
                const key = c.categoryId ?? "none"
                return (
                  <li key={key} className="border-t first:border-0">
                    <button
                      aria-pressed={filter === key}
                      onClick={() => {
                        setFilter(filter === key ? null : key)
                        const cat = cats.find((x) => x.id === c.categoryId)
                        setFocus(cat?.kind === "income" ? "income" : "expense")
                        document
                          .getElementById("s-fluxo")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }}
                      title={`${catName(c.categoryId)}: ${money(c.amount)} · ${Math.round((c.amount / Math.max(totalOut, 1)) * 100)}% das saídas${totalIn > 0 ? ` · ${shareOf!(c.amount)}% das entradas` : ""}${c.average !== null ? ` · média ${money(c.average)}` : ""}`}
                      className={cn(
                        "grid w-full grid-cols-[minmax(0,170px)_minmax(0,1fr)_56px_110px_150px] items-center gap-4 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted max-md:grid-cols-[minmax(0,1fr)_auto_auto] max-md:gap-x-3 max-md:gap-y-1.5",
                        filter === key && "bg-primary/10",
                      )}
                    >
                      <span
                        className={cn(
                          "truncate",
                          !c.categoryId && "font-semibold text-amber-700 dark:text-amber-400",
                        )}
                      >
                        {catName(c.categoryId)}
                      </span>
                      <span className="relative h-2 rounded-full bg-muted max-md:col-span-3 max-md:row-start-2">
                        <i
                          className={cn(
                            "block h-full rounded-full",
                            c.categoryId ? tone.expense.bar : "bg-amber-500",
                          )}
                          style={{ width: `${Math.max((c.amount / scale) * 100, 1)}%` }}
                        />
                        {c.average !== null && c.average > 0 && (
                          <b
                            className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-sm bg-foreground/50"
                            style={{ left: `${(c.average / scale) * 100}%` }}
                          />
                        )}
                      </span>
                      <span
                        className="text-right text-xs font-semibold text-muted-foreground tabular-nums max-md:col-start-2 max-md:row-start-1"
                        title={shareOf ? `${shareOf(c.amount)}% ${shareLabel} do mês` : undefined}
                      >
                        {shareOf ? `${shareOf(c.amount)}%` : ""}
                      </span>
                      <span
                        className={cn(
                          "text-right font-semibold tabular-nums max-md:col-start-3 max-md:row-start-1",
                          tone.expense.text,
                        )}
                      >
                        {money(c.amount)}
                      </span>
                      <span className="text-right text-xs text-muted-foreground max-md:col-span-3 max-md:text-left">
                        {pct === null ? (
                          !c.categoryId ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              categorize para contar certo
                            </span>
                          ) : null
                        ) : Math.abs(pct) < 10 ? (
                          "na média"
                        ) : (
                          <span
                            className={cn(
                              "font-semibold",
                              pct > 0
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-emerald-700 dark:text-emerald-400",
                            )}
                          >
                            {pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs média
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="s-fluxo">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="s-fluxo"
            className="scroll-mt-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            title="Transferências entre suas contas ficam de fora"
          >
            Fluxo de {monthName(month)}
          </h2>
          {filter && (
            <span className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-semibold text-primary">
              Só {catName(filter === "none" ? null : filter).toLowerCase()}
              <button
                aria-label="Mostrar todas as categorias"
                onClick={() => setFilter(null)}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          )}
        </div>
        <div
          className={cn(
            "grid items-start gap-4 max-md:grid-cols-1",
            focus === "expense"
              ? "md:grid-cols-[280px_minmax(0,1fr)]"
              : "md:grid-cols-[minmax(0,1fr)_280px]",
          )}
        >
          {(["income", "expense"] as const).map((side) =>
            side === focus ? (
              <FlowTable
                key={side}
                rows={sides[side]}
                bills={side === "expense" && !filter ? overview.data.bills : []}
                side={side}
                month={month}
                today={today}
                categories={cats}
                accounts={accounts.data}
                actions={actions}
                onNew={newRow(side)}
                highlightId={highlight}
              />
            ) : (
              <div key={side} className="max-md:order-last">
                <MiniColumn
                  rows={sides[side]}
                  bills={side === "expense" && !filter ? overview.data.bills : []}
                  side={side}
                  onOpen={(txId) => openSide(side, txId)}
                />
              </div>
            ),
          )}
        </div>
      </section>

      <DeferDialog tx={defer} onClose={() => setDefer(null)} />
      <PayDialog tx={pay} accounts={accounts.data} onClose={() => setPay(null)} />
      <SplitDialog tx={split} categories={cats} onClose={() => setSplit(null)} />
      <QuickAddDialog
        draft={draft}
        onClose={() => setDraft(null)}
        accounts={accounts.data}
        categories={cats}
      />
    </div>
  )
}

function Chip({
  children,
  href,
  onClick,
  tone,
}: {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  tone: "warn" | "crit" | "info"
}) {
  const dot = { warn: "bg-amber-500", crit: "bg-destructive", info: "bg-[var(--viz-1)]" }[tone]
  const className =
    "flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-0.5 text-xs hover:bg-muted"
  const content = (
    <>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {children}
    </>
  )
  if (href)
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    )
  return (
    <button className={className} onClick={onClick} disabled={!onClick}>
      {content}
    </button>
  )
}

/** Número pequeno do resumo: ícone colorido, rótulo, valor e uma linha de apoio. */
function MiniStat({
  icon,
  iconClass,
  label,
  value,
  valueClass,
  sub,
  onClick,
}: {
  icon: React.ReactNode
  iconClass: string
  label: string
  value: string
  valueClass: string
  sub: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4",
          iconClass,
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-base font-semibold tabular-nums", valueClass)}>{value}</span>
        <span className="truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
    </>
  )
  const className = "flex items-center gap-3 px-4 py-2.5 text-left"
  return onClick ? (
    <button className={cn(className, "transition-colors hover:bg-muted/50")} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** Saldos de hoje das contas correntes (F83); as só de repasse aparecem zeradas. */
function BalancesCard({
  balances,
  accounts,
  today,
}: {
  balances: Overview["balances"]
  accounts: { id: string; name: string }[]
  today: string
}) {
  return (
    <Link
      href="/financeiro/patrimonio"
      className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3.5 transition-colors hover:bg-muted/50"
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <WalletIcon className="size-4" aria-hidden />
        Saldos atuais · {dayMonth(today)}
      </span>
      {balances.length ? (
        <ul className="flex flex-col gap-1">
          {balances.map((b) => (
            <li key={b.accountId} className="flex items-baseline gap-2">
              <span className="truncate">
                {accounts.find((a) => a.id === b.accountId)?.name ?? "Conta"}
              </span>
              {b.balance === null && (
                <span className="text-xs text-muted-foreground">só repasse</span>
              )}
              <span
                className={cn(
                  "ml-auto text-lg font-semibold tabular-nums",
                  b.balance === null && "text-muted-foreground",
                  (b.balance ?? 0) < 0 && "text-destructive",
                )}
              >
                {money(b.balance ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-muted-foreground">Nenhuma conta corrente.</span>
      )}
    </Link>
  )
}

/**
 * Balanço final do mês (F82/F83): no mês atual e nos próximos, saldo de hoje + previstas + repasse
 * − faturas que vencem; nos que passaram, o saldo real no último dia.
 */
function MonthEndCard({
  cash,
  accountName,
  month,
  today,
}: {
  cash: Overview["cash"]
  accountName?: string
  month: string
  today: string
}) {
  const end = lastDayOf(month)
  const closed = end < today
  const parts = cash
    ? [
        `hoje ${money(cash.balance)}`,
        cash.planned && `${cash.planned > 0 ? "+" : "−"} ${money(Math.abs(cash.planned))} previsto`,
        cash.passThrough && `+ ${money(cash.passThrough)} do repasse`,
        ...cash.bills.map((b) => `− ${money(b.amount)} da fatura de ${dayMonth(b.dueDate)}`),
      ].filter(Boolean)
    : []
  const positive = (cash?.projected ?? 0) >= 0
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-xl border border-l-4 bg-card px-4 py-3.5",
        cash && (positive ? "border-l-emerald-500" : "border-l-rose-500"),
      )}
      title={
        closed
          ? "Saldo real da conta no último dia do mês"
          : "Saldo de hoje, mais o que está previsto na conta até o fim do mês (inclusive o vencido), mais o que entra nas contas só de repasse, menos as faturas do cartão que vencem até lá"
      }
    >
      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        {positive ? (
          <TrendingUpIcon className={cn("size-4", tone.income.text)} aria-hidden />
        ) : (
          <TrendingDownIcon className={cn("size-4", tone.expense.text)} aria-hidden />
        )}
        Balanço final
      </span>
      {cash ? (
        <>
          <span
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              positive ? tone.income.text : tone.expense.text,
            )}
          >
            {signedMoney(cash.projected)}
          </span>
          <span className="text-xs text-muted-foreground">
            {accountName ?? "Conta"} em {dayMonth(end)}
            {closed ? " (saldo real)" : ""}
          </span>
          {!closed && (
            <span className="text-xs text-muted-foreground tabular-nums">{parts.join(" · ")}</span>
          )}
        </>
      ) : (
        <span className="text-sm text-muted-foreground">
          Sem saldo da conta para este mês (o extrato começa depois).
        </span>
      )}
    </div>
  )
}
