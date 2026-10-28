"use client"

import { Loader2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CategoryPicker } from "@/components/finance/category-picker"
import { DeferDialog, PayDialog } from "@/components/finance/dialogs"
import { FlagPill } from "@/components/finance/flow-table"
import { PendingSection } from "@/components/finance/pending"
import { useFinanceMonth } from "@/components/finance/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, unwrap } from "@/lib/api"
import {
  dayMonth,
  type FinAccount,
  type FinCategory,
  monthName,
  money,
  parseMoney,
  plainMoney,
  type Planning,
  signedMoney,
  type Tx,
  useFinAccounts,
  useFinanceAction,
  useFinCategories,
  useFinSettings,
  useOverview,
  usePlanning,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

type Recurring = Planning["recurring"][number]
type RecurringPatch = {
  name?: string
  dayOfMonth?: number
  expectedAmount?: number
  accountId?: string
  categoryId?: string | null
}

/** Planejamento (F42/F64/F75): meta, contas fixas e salários, parcelas e compromissos. */
export default function PlanejamentoPage() {
  const month = useFinanceMonth()
  const planning = usePlanning(month)
  const overview = useOverview(month)
  const settings = useFinSettings()
  const accounts = useFinAccounts()
  const categories = useFinCategories()
  const [pay, setPay] = useState<Tx | null>(null)
  const [defer, setDefer] = useState<Tx | null>(null)

  const saveGoal = useFinanceAction(
    (goal: number) => unwrap(api.PATCH("/finance/settings", { body: { monthlySavingGoal: goal } })),
    {
      success: (_r, goal) => `Meta de guardar: ${money(goal)} por mês.`,
    },
  )

  if (!planning.data || !accounts.data || !categories.data || !settings.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const { recurring, installments, commitments, totals } = planning.data
  const t = overview.data?.totals

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/30 px-4 py-2.5">
        <label htmlFor="goal" className="text-sm font-semibold">
          Meta de guardar por mês
        </label>
        <Input
          id="goal"
          key={settings.data.monthlySavingGoal}
          className="w-32 tabular-nums"
          inputMode="decimal"
          defaultValue={plainMoney(settings.data.monthlySavingGoal)}
          onBlur={(e) => {
            const cents = parseMoney(e.target.value)
            if (cents !== null && cents !== settings.data.monthlySavingGoal) saveGoal.mutate(cents)
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {t && (
          <span className="text-sm text-muted-foreground">
            Sobra de {monthName(month)}:{" "}
            <b className="text-foreground tabular-nums">{signedMoney(t.surplus)}</b> · livre:{" "}
            <b className="text-foreground tabular-nums">{money(Math.max(0, t.free))}</b>
            {t.freePerDay !== null && t.free > 0 && (
              <span className="tabular-nums"> ({money(t.freePerDay)}/dia)</span>
            )}
          </span>
        )}
      </div>

      <section className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Contas fixas e salários · {monthName(month)}
          </h2>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            entradas {money(totals.fixedIncome)}/mês · saídas {money(totals.fixedExpenses)}/mês
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left font-medium">Nome</th>
                <th className="w-16 px-2 py-1.5 text-left font-medium">Dia</th>
                <th className="w-32 px-2 py-1.5 text-right font-medium">Valor</th>
                <th className="w-32 px-2 py-1.5 text-left font-medium">Conta</th>
                <th className="w-40 px-2 py-1.5 text-left font-medium">Categoria</th>
                <th className="w-44 px-2 py-1.5 text-left font-medium capitalize">
                  {monthName(month)}
                </th>
                <th className="w-52" />
              </tr>
            </thead>
            <tbody>
              {(["in", "out"] as const).map((dir) => (
                <RecurringGroup
                  key={dir}
                  dir={dir}
                  rows={recurring.filter((r) => r.direction === dir)}
                  accounts={accounts.data}
                  categories={categories.data}
                  onPay={setPay}
                  onDefer={setDefer}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Editar aqui muda o cadastro e as próximas ocorrências ainda não pagas nem adiadas. “Já
          paguei” e “Adiar” mudam só o mês.
        </p>
      </section>

      <PendingSection accounts={accounts.data} categories={categories.data} />

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Compras parceladas
        </h2>
        {installments.length ? (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-1.5 text-left font-medium">Compra</th>
                  <th className="px-3 py-1.5 text-left font-medium">Parcela</th>
                  <th className="px-3 py-1.5 text-right font-medium">Valor da parcela</th>
                  <th className="px-3 py-1.5 text-left font-medium">Última</th>
                  <th className="px-3 py-1.5 text-right font-medium">Falta pagar</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((i) => (
                  <tr key={i.group} className="border-b last:border-0">
                    <td className="px-3 py-2">{i.description}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {i.currentNumber} de {i.total}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.amount)}</td>
                    <td className="px-3 py-2 capitalize">
                      {monthName(i.lastMonth)} {i.lastMonth.slice(0, 4)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {money(i.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma compra parcelada em aberto.</p>
        )}
        <p className="text-xs text-muted-foreground">Vêm das faturas importadas.</p>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Já comprometido nos próximos meses
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                {[
                  "Mês",
                  "Parcelas",
                  "Contas fixas",
                  "Comprometido",
                  "Entradas fixas",
                  "Sobra antes dos variáveis",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={cn("px-3 py-1.5 font-medium", i ? "text-right" : "text-left")}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => (
                <tr key={c.month} className="border-b last:border-0">
                  <td className="px-3 py-2 capitalize">{monthName(c.month)}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    title={c.installmentNames.join(", ")}
                  >
                    {c.installments ? money(c.installments) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.fixedExpenses)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {money(c.committed)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.fixedIncome)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      c.leftBeforeVariable >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {signedMoney(c.leftBeforeVariable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PayDialog tx={pay} accounts={accounts.data} onClose={() => setPay(null)} />
      <DeferDialog tx={defer} onClose={() => setDefer(null)} />
    </div>
  )
}

function RecurringGroup({
  dir,
  rows,
  accounts,
  categories,
  onPay,
  onDefer,
}: {
  dir: "in" | "out"
  rows: Recurring[]
  accounts: FinAccount[]
  categories: FinCategory[]
  onPay: (tx: Tx) => void
  onDefer: (tx: Tx) => void
}) {
  const [name, setName] = useState("")
  const update = useFinanceAction(({ id, body }: { id: string; body: RecurringPatch }) =>
    unwrap(api.PATCH("/finance/recurring/{id}", { params: { path: { id } }, body })),
  )
  const end = useFinanceAction(
    (r: Recurring) =>
      unwrap(api.DELETE("/finance/recurring/{id}", { params: { path: { id: r.id } } })),
    {
      success: (_res, r) => `${r.name} encerrada: some dos próximos meses.`,
    },
  )
  const create = useFinanceAction(
    (body: {
      name: string
      direction: "in" | "out"
      dayOfMonth: number
      expectedAmount: number
      accountId: string
    }) => unwrap(api.POST("/finance/recurring", { body })),
    { success: (_r, body) => `${body.name} cadastrada. Preencha dia, valor e categoria.` },
  )
  const undefer = useFinanceAction(
    (tx: Tx) =>
      unwrap(api.POST("/finance/transactions/{id}/undefer", { params: { path: { id: tx.id } } })),
    {
      success: (_r, tx) => `${tx.description} voltou para ${dayMonth(tx.deferredFrom!)}.`,
    },
  )
  const defaultAccount = accounts.find((a) => a.type !== "credit_card")?.id ?? accounts[0]?.id
  const cell = "border-b px-1 py-0.5"
  const field =
    "h-9 w-full rounded-md bg-transparent px-2 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"

  return (
    <>
      <tr>
        <td
          colSpan={7}
          className="bg-muted/40 px-3 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
        >
          {dir === "in" ? "Entradas" : "Saídas"}
        </td>
      </tr>
      {rows.map((r) => {
        const occ = r.occurrence
        const card = accounts.find((a) => a.id === r.accountId)?.type === "credit_card"
        return (
          <tr key={r.id} className="hover:bg-muted/30">
            <td className={cell}>
              <input
                className={field}
                defaultValue={r.name}
                key={r.name}
                aria-label="Nome"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== r.name &&
                  update.mutate({ id: r.id, body: { name: e.target.value.trim() } })
                }
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              {r.late.map((t) => (
                <p
                  key={t.id}
                  className="flex flex-wrap items-center gap-1.5 px-2 pb-1 text-xs text-muted-foreground"
                >
                  + de {monthName((t.recurringPeriod ?? t.date).slice(0, 7))}:{" "}
                  {t.status === "planned"
                    ? `adiada para ${dayMonth(t.date)}`
                    : `paga com atraso em ${dayMonth(t.date)}`}
                  {t.payable && (
                    <Button size="xs" variant="outline" onClick={() => onPay(t)}>
                      {dir === "in" ? "Já recebi" : "Já paguei"}
                    </Button>
                  )}
                </p>
              ))}
            </td>
            <td className={cell}>
              <input
                className={cn(field, "tabular-nums")}
                inputMode="numeric"
                defaultValue={r.dayOfMonth}
                key={r.dayOfMonth}
                aria-label="Dia do mês"
                onBlur={(e) => {
                  const day = Number(e.target.value)
                  if (day >= 1 && day <= 31 && day !== r.dayOfMonth)
                    update.mutate({ id: r.id, body: { dayOfMonth: day } })
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </td>
            <td className={cell}>
              <input
                className={cn(field, "text-right tabular-nums")}
                inputMode="decimal"
                defaultValue={plainMoney(r.expectedAmount)}
                key={r.expectedAmount}
                aria-label="Valor esperado"
                onBlur={(e) => {
                  const cents = parseMoney(e.target.value)
                  if (cents === null) return toast.error("Valor inválido.")
                  if (cents !== r.expectedAmount)
                    update.mutate({ id: r.id, body: { expectedAmount: cents } })
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
            </td>
            <td className={cell}>
              <select
                className={field}
                value={r.accountId}
                aria-label="Conta"
                onChange={(e) => update.mutate({ id: r.id, body: { accountId: e.target.value } })}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </td>
            <td className={cell}>
              <CategoryPicker
                value={r.categoryId}
                categories={categories}
                onChange={(categoryId) => update.mutate({ id: r.id, body: { categoryId } })}
              />
            </td>
            <td className={cn(cell, "px-2")}>
              {!occ ? (
                <span className="text-xs text-muted-foreground">Sem lançamento</span>
              ) : occ.flag ? (
                <FlagPill tx={occ} />
              ) : occ.status === "planned" ? (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                  Prevista {dayMonth(occ.date)}
                </span>
              ) : (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {dir === "in" ? "Recebida" : "Paga"} {dayMonth(occ.date)}
                </span>
              )}
            </td>
            <td className={cn(cell, "text-right")}>
              <div className="flex items-center justify-end gap-1">
                {occ?.flag === "deferred_out" ? (
                  <Button size="xs" variant="ghost" onClick={() => undefer.mutate(occ)}>
                    Desfazer adiamento
                  </Button>
                ) : occ?.status === "planned" ? (
                  <>
                    {occ.payable ? (
                      <Button size="xs" variant="outline" onClick={() => onPay(occ)}>
                        {dir === "in" ? "Já recebi" : "Já paguei"}
                      </Button>
                    ) : card ? (
                      <span className="text-xs text-muted-foreground">cai no cartão</span>
                    ) : null}
                    <Button size="xs" variant="ghost" onClick={() => onDefer(occ)}>
                      Adiar
                    </Button>
                  </>
                ) : null}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Encerrar ${r.name}`}
                  title="Encerrar: some dos próximos meses"
                  onClick={() => end.mutate(r)}
                >
                  <XIcon />
                </Button>
              </div>
            </td>
          </tr>
        )
      })}
      <tr>
        <td colSpan={7} className="border-b px-1 py-0.5">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim() || !defaultAccount) return
              create.mutate({
                name: name.trim(),
                direction: dir,
                dayOfMonth: 10,
                expectedAmount: 0,
                accountId: defaultAccount,
              })
              setName("")
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
              aria-label={dir === "in" ? "Nova entrada fixa" : "Nova conta fixa"}
              placeholder={
                dir === "in"
                  ? "+ Nova entrada fixa (digite o nome e Enter)"
                  : "+ Nova conta fixa (digite o nome e Enter)"
              }
            />
          </form>
        </td>
      </tr>
    </>
  )
}
