"use client"

import { ChevronRightIcon, Loader2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { NativeSelect } from "@/components/ui-extra/native-select"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, unwrap } from "@/lib/api"
import {
  type Debt,
  dayMonth,
  type FinAccount,
  fullDate,
  money,
  parseMoney,
  plainMoney,
  todayLocal,
  useDebts,
  useFinAccounts,
  useFinanceAction,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

const field =
  "h-9 w-full rounded-md bg-transparent px-2 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"

type DebtPatch = { name?: string; amount?: number; notes?: string | null }

/** Dívidas (F84): o que alguém emprestou para vocês; pagamentos livres abatem o saldo. */
export default function DividasPage() {
  const debts = useDebts()
  const accounts = useFinAccounts()
  const [paying, setPaying] = useState<Debt | null>(null)

  if (!debts.data || !accounts.data) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const open = debts.data.filter((d) => d.remaining > 0)
  const done = debts.data.filter((d) => d.remaining === 0)
  const total = open.reduce((s, d) => s + d.remaining, 0)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Vocês devem</span>
          <span
            className={cn(
              "text-3xl font-semibold tracking-tight tabular-nums",
              total > 0 && "text-destructive",
            )}
          >
            {money(total)}
          </span>
        </div>
        <span className="pb-1 text-sm text-muted-foreground">
          {open.length === 0
            ? "Nenhuma dívida em aberto."
            : open.length === 1
              ? "1 dívida em aberto"
              : `${open.length} dívidas em aberto`}
        </span>
      </section>

      <NewDebtForm />

      {open.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Em aberto">
          {open.map((debt) => (
            <DebtCard key={debt.id} debt={debt} onPay={() => setPaying(debt)} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="s-quitadas">
          <h2
            id="s-quitadas"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Quitadas
          </h2>
          {done.map((debt) => (
            <DebtCard key={debt.id} debt={debt} onPay={() => setPaying(debt)} />
          ))}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Cada pagamento vira uma saída na conta escolhida, na categoria Dívidas, e conta no mês em
        que foi feito. Se apagar essa saída no fluxo (ou desfazer), o pagamento deixa de contar. O
        que falta pagar entra no Patrimônio, em &ldquo;Você deve&rdquo;.
      </p>

      <PayDialog debt={paying} accounts={accounts.data} onClose={() => setPaying(null)} />
    </div>
  )
}

function NewDebtForm() {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(todayLocal())
  const create = useFinanceAction(
    (body: { name: string; amount: number; startedOn: string }) =>
      unwrap(api.POST("/finance/debts", { body })),
    { success: (_r, body) => `${body.name} anotada: ${money(body.amount)}.` },
  )
  const cents = parseMoney(amount)
  const valid = !!name.trim() && !!cents && !!date
  return (
    <form
      className="grid items-end gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_140px_160px_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        create.mutate(
          { name: name.trim(), amount: cents!, startedOn: date },
          {
            onSuccess: () => {
              setName("")
              setAmount("")
            },
          },
        )
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-name">Quem emprestou / o quê</Label>
        <Input
          id="d-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: empréstimo da mãe"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-amount">Valor</Label>
        <Input
          id="d-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-date">Desde</Label>
        <Input id="d-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Button type="submit" disabled={!valid || create.isPending}>
        Adicionar dívida
      </Button>
    </form>
  )
}

function DebtCard({ debt, onPay }: { debt: Debt; onPay: () => void }) {
  const [showPayments, setShowPayments] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const update = useFinanceAction((body: DebtPatch) =>
    unwrap(api.PATCH("/finance/debts/{id}", { params: { path: { id: debt.id } }, body })),
  )
  const remove = useFinanceAction(
    () => unwrap(api.DELETE("/finance/debts/{id}", { params: { path: { id: debt.id } } })),
    { success: () => `${debt.name} saiu da lista.` },
  )
  const pct = Math.min(100, Math.round((debt.paid / Math.max(debt.amount, 1)) * 100))
  const paidOff = debt.remaining === 0

  return (
    <article
      className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3", paidOff && "opacity-70")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          key={debt.name}
          defaultValue={debt.name}
          aria-label="Nome da dívida"
          className={cn(field, "min-w-0 flex-1 text-base font-semibold")}
          onBlur={(e) =>
            e.target.value.trim() &&
            e.target.value.trim() !== debt.name &&
            update.mutate({ name: e.target.value.trim() })
          }
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="text-xs text-muted-foreground">desde {fullDate(debt.startedOn)}</span>
        {!paidOff && (
          <Button size="sm" onClick={onPay}>
            Registrar pagamento
          </Button>
        )}
        {confirmRemove ? (
          <span className="flex items-center gap-1">
            <Button size="xs" variant="destructive" onClick={() => remove.mutate(undefined)}>
              Tirar da lista
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </Button>
          </span>
        ) : (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Tirar ${debt.name} da lista`}
            title="Tirar da lista (os pagamentos feitos continuam no fluxo)"
            onClick={() => setConfirmRemove(true)}
          >
            <XIcon />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="flex flex-col">
          <span className="text-xs text-muted-foreground">Emprestado</span>
          <input
            key={debt.amount}
            defaultValue={plainMoney(debt.amount)}
            inputMode="decimal"
            aria-label="Valor emprestado"
            className={cn(field, "px-1 font-semibold tabular-nums")}
            onBlur={(e) => {
              const cents = parseMoney(e.target.value)
              if (!cents) return toast.error("Valor inválido.")
              if (cents !== debt.amount) update.mutate({ amount: cents })
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Pago</span>
          <span className="flex h-9 items-center font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
            {money(debt.paid)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Falta</span>
          <span
            className={cn(
              "flex h-9 items-center font-semibold tabular-nums",
              !paidOff && "text-destructive",
            )}
          >
            {paidOff ? "Quitada ✓" : money(debt.remaining)}
          </span>
        </div>
      </div>

      <div
        className="h-1.5 rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% pago`}
      >
        <i
          className="block h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>

      <input
        key={debt.notes ?? ""}
        defaultValue={debt.notes ?? ""}
        placeholder="Notas (ex.: combinado pagar quando der)"
        aria-label="Notas"
        className={cn(field, "text-sm text-muted-foreground focus:text-foreground")}
        onBlur={(e) =>
          e.target.value.trim() !== (debt.notes ?? "") &&
          update.mutate({ notes: e.target.value.trim() || null })
        }
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />

      {debt.payments.length > 0 && (
        <div>
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showPayments}
            onClick={() => setShowPayments((v) => !v)}
          >
            <ChevronRightIcon
              className={cn("size-3.5 transition-transform", showPayments && "rotate-90")}
            />
            {debt.payments.length === 1 ? "1 pagamento" : `${debt.payments.length} pagamentos`}
          </button>
          {showPayments && (
            <ul className="mt-1 flex flex-col gap-0.5 pl-5 text-sm">
              {debt.payments.map((p) => (
                <li key={p.id} className="flex gap-3 tabular-nums">
                  <span className="w-12 text-muted-foreground">{dayMonth(p.date)}</span>
                  <span>{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}

function PayDialog({
  debt,
  accounts,
  onClose,
}: {
  debt: Debt | null
  accounts: FinAccount[]
  onClose: () => void
}) {
  return (
    <Dialog open={!!debt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {debt && <PayForm key={debt.id} debt={debt} accounts={accounts} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PayForm({
  debt,
  accounts,
  onClose,
}: {
  debt: Debt
  accounts: FinAccount[]
  onClose: () => void
}) {
  const [amount, setAmount] = useState(plainMoney(debt.remaining))
  const [date, setDate] = useState(todayLocal())
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.type === "checking" && a.trackBalance)?.id ?? accounts[0]?.id ?? "",
  )
  const pay = useFinanceAction(
    (body: { amount: number; date: string; accountId: string }) =>
      unwrap(api.POST("/finance/debts/{id}/payments", { params: { path: { id: debt.id } }, body })),
    {
      success: (r, body) =>
        r.remaining === 0
          ? `${debt.name} quitada!`
          : `Pagamento de ${money(body.amount)} registrado. Faltam ${money(r.remaining)}.`,
    },
  )
  const cents = parseMoney(amount)
  const valid = !!cents && !!date && !!accountId
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Pagamento: {debt.name}</DialogTitle>
        <DialogDescription>
          Faltam {money(debt.remaining)}. Vira uma saída na conta escolhida, categoria Dívidas.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-amount">Valor</Label>
          <Input
            id="p-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-date">Data</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-account">Saiu de</Label>
        <NativeSelect
          id="p-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
      </div>
      {!!cents && cents > debt.remaining && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Maior do que falta ({money(debt.remaining)}): a dívida fica quitada.
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!valid || pay.isPending}
          onClick={() => pay.mutate({ amount: cents!, date, accountId }, { onSuccess: onClose })}
        >
          Registrar
        </Button>
      </DialogFooter>
    </div>
  )
}
