"use client"

import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { CategoryPicker } from "@/components/finance/category-picker"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { api, unwrap } from "@/lib/api"
import {
  addMonths,
  dayMonth,
  type FinAccount,
  type FinCategory,
  monthName,
  money,
  parseMoney,
  plainMoney,
  signedMoney,
  todayLocal,
  type Tx,
  useFinanceAction,
} from "@/lib/finance"

const accountOptions = (accounts: FinAccount[], withCard = true) =>
  accounts
    .filter((a) => withCard || a.type !== "credit_card")
    .map((a) => ({ value: a.id, label: a.name }))

// ─── Lançamento rápido (F35) ─────────────────────────────────────────────────

export type QuickDraft = {
  description: string
  amount: number | null
  direction: "in" | "out"
  date: string
  accountId: string | null
  categoryId: string | null
}

export function QuickAddDialog({
  draft,
  onClose,
  accounts,
  categories,
}: {
  draft: QuickDraft | null
  onClose: () => void
  accounts: FinAccount[]
  categories: FinCategory[]
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {draft && (
          <QuickForm
            key={JSON.stringify(draft)}
            draft={draft}
            onClose={onClose}
            accounts={accounts}
            categories={categories}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function QuickForm({
  draft,
  onClose,
  accounts,
  categories,
}: {
  draft: QuickDraft
  onClose: () => void
  accounts: FinAccount[]
  categories: FinCategory[]
}) {
  const [direction, setDirection] = useState(draft.direction)
  const [description, setDescription] = useState(draft.description)
  const [amount, setAmount] = useState(draft.amount ? plainMoney(draft.amount) : "")
  const [date, setDate] = useState(draft.date)
  const [accountId, setAccountId] = useState(draft.accountId ?? accounts[0]?.id ?? "")
  const [categoryId, setCategoryId] = useState(draft.categoryId)
  const create = useFinanceAction(
    (body: {
      accountId: string
      date: string
      amount: number
      description: string
      categoryId: string | null
    }) => unwrap(api.POST("/finance/transactions", { body })),
    { success: (_r, input) => `Lançado: ${input.description} ${signedMoney(input.amount)}` },
  )
  const cents = parseMoney(amount)
  const valid = !!cents && !!accountId && !!date
  const submit = () => {
    if (!valid) return
    create.mutate(
      {
        accountId,
        date,
        amount: direction === "out" ? -cents : cents,
        description: description.trim() || "Lançamento",
        categoryId,
      },
      { onSuccess: onClose },
    )
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>Novo lançamento</DialogTitle>
        <DialogDescription>
          Quando o extrato chegar, ele se junta com o lançamento do banco em vez de duplicar.
        </DialogDescription>
      </DialogHeader>
      <ToggleGroup
        value={[direction]}
        onValueChange={(value: string[]) => value[0] && setDirection(value[0] as "in" | "out")}
        variant="outline"
        className="self-start"
      >
        <ToggleGroupItem value="out">Saída</ToggleGroupItem>
        <ToggleGroupItem value="in">Entrada</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-desc">Descrição</Label>
          <Input id="q-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-amount">Valor</Label>
          <Input
            id="q-amount"
            inputMode="decimal"
            value={amount}
            autoFocus={!draft.amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-account">Conta</Label>
          <NativeSelect
            id="q-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accountOptions(accounts)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q-date">Data</Label>
          <Input id="q-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Categoria</span>
        <CategoryPicker
          variant="field"
          value={categoryId}
          categories={categories}
          onChange={setCategoryId}
          placeholder="Escolher (ou deixe para revisar)"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!valid || create.isPending} autoFocus={!!draft.amount}>
          Lançar
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Adiar (F29) ─────────────────────────────────────────────────────────────

export function DeferDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  return (
    <Dialog open={!!tx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {tx && <DeferForm key={tx.id} tx={tx} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function DeferForm({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const next = `${addMonths(tx.date.slice(0, 7), 1)}-${tx.date.slice(8)}`
  const [date, setDate] = useState(next)
  const [reason, setReason] = useState("")
  const defer = useFinanceAction(
    () =>
      unwrap(
        api.POST("/finance/transactions/{id}/defer", {
          params: { path: { id: tx.id } },
          body: { date, reason: reason || null },
        }),
      ),
    {
      success: () =>
        `${tx.description} adiada para ${dayMonth(date)}. Os outros meses não mudaram.`,
    },
  )
  const period = (tx.recurringPeriod ?? tx.deferredFrom ?? tx.date).slice(0, 7)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        defer.mutate(undefined, { onSuccess: onClose })
      }}
    >
      <DialogHeader>
        <DialogTitle>Adiar {tx.description}</DialogTitle>
        <DialogDescription>
          Ocorrência de {monthName(period)} · {signedMoney(tx.amount)} · prevista para{" "}
          {dayMonth(tx.date)}. Só ela muda; os outros meses e o cadastro continuam iguais.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-date">Nova data</Label>
        <Input id="d-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="d-reason">Motivo (opcional)</Label>
        <Input
          id="d-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex.: só depois do salário"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!date || defer.isPending}>
          Adiar
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Já paguei / Já recebi (F57) ─────────────────────────────────────────────

export function PayDialog({
  tx,
  accounts,
  onClose,
}: {
  tx: Tx | null
  accounts: FinAccount[]
  onClose: () => void
}) {
  return (
    <Dialog open={!!tx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {tx && <PayForm key={tx.id} tx={tx} accounts={accounts} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function PayForm({
  tx,
  accounts,
  onClose,
}: {
  tx: Tx
  accounts: FinAccount[]
  onClose: () => void
}) {
  const income = tx.amount > 0
  const [amount, setAmount] = useState(plainMoney(tx.amount))
  const [date, setDate] = useState(todayLocal())
  const [accountId, setAccountId] = useState(tx.accountId)
  const pay = useFinanceAction(
    () =>
      unwrap(
        api.POST("/finance/transactions/{id}/pay", {
          params: { path: { id: tx.id } },
          body: { date, accountId, amount: parseMoney(amount) ?? undefined },
        }),
      ),
    {
      success: () =>
        `${tx.description} marcada como ${income ? "recebida" : "paga"} em ${dayMonth(date)}.`,
    },
  )
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        pay.mutate(undefined, { onSuccess: onClose })
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {income ? "Já recebi" : "Já paguei"}: {tx.description}
        </DialogTitle>
        <DialogDescription>
          Fica marcada como {income ? "recebida" : "paga"}. Quando o extrato chegar, ela se junta
          com o lançamento do banco.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-amount">Valor</Label>
          <Input
            id="p-amount"
            inputMode="decimal"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-date">Data</Label>
          <Input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="p-account">Conta</Label>
        <NativeSelect
          id="p-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accountOptions(accounts, false)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!parseMoney(amount) || pay.isPending}>
          Confirmar
        </Button>
      </DialogFooter>
    </form>
  )
}

// ─── Dividir (F36) ───────────────────────────────────────────────────────────

export function SplitDialog({
  tx,
  categories,
  onClose,
}: {
  tx: Tx | null
  categories: FinCategory[]
  onClose: () => void
}) {
  return (
    <Dialog open={!!tx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {tx && <SplitForm key={tx.id} tx={tx} categories={categories} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function SplitForm({
  tx,
  categories,
  onClose,
}: {
  tx: Tx
  categories: FinCategory[]
  onClose: () => void
}) {
  const total = Math.abs(tx.amount)
  const sign = tx.amount < 0 ? -1 : 1
  const [rows, setRows] = useState<{ categoryId: string | null; value: string }[]>(
    tx.splits?.length
      ? tx.splits.map((s) => ({ categoryId: s.categoryId, value: plainMoney(s.amount) }))
      : [
          { categoryId: tx.categoryId, value: plainMoney(total) },
          { categoryId: null, value: "" },
        ],
  )
  const used = rows.reduce((s, r) => s + (parseMoney(r.value) ?? 0), 0)
  const rest = total - used
  const valid =
    rest === 0 && rows.length >= 2 && rows.every((r) => r.categoryId && parseMoney(r.value))
  const save = useFinanceAction(
    (parts: { categoryId: string | null; amount: number }[]) =>
      unwrap(
        api.PUT("/finance/transactions/{id}/splits", {
          params: { path: { id: tx.id } },
          body: { parts },
        }),
      ),
    {
      success: (_r, parts) =>
        parts.length
          ? `${tx.description} dividida em ${parts.length} categorias.`
          : "Divisão desfeita.",
    },
  )
  const update = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Dividir {tx.description}</DialogTitle>
        <DialogDescription>
          {signedMoney(tx.amount)} em {dayMonth(tx.date)}. Cada parte conta na sua categoria.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2">
            <CategoryPicker
              variant="field"
              value={row.categoryId}
              categories={categories}
              onChange={(id) => update(i, { categoryId: id })}
              ariaLabel={`Categoria da parte ${i + 1}`}
            />
            <Input
              inputMode="decimal"
              className="text-right"
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              aria-label={`Valor da parte ${i + 1}`}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remover parte"
              disabled={rows.length < 3}
              onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((all) => [
              ...all,
              { categoryId: null, value: rest > 0 ? plainMoney(rest) : "" },
            ])
          }
        >
          <PlusIcon /> Parte
        </Button>
        <span
          className={`ml-auto tabular-nums ${rest === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
        >
          {rest === 0
            ? "Tudo distribuído"
            : rest > 0
              ? `Falta distribuir ${money(rest)}`
              : `Passou ${money(-rest)}`}
        </span>
      </div>
      <DialogFooter>
        {tx.splits?.length ? (
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => save.mutate([], { onSuccess: onClose })}
          >
            Desfazer divisão
          </Button>
        ) : null}
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={!valid || save.isPending}
          onClick={() =>
            save.mutate(
              rows.map((r) => ({
                categoryId: r.categoryId,
                amount: sign * (parseMoney(r.value) ?? 0),
              })),
              { onSuccess: onClose },
            )
          }
        >
          Salvar divisão
        </Button>
      </DialogFooter>
    </div>
  )
}
