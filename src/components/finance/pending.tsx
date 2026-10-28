"use client"

import { XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
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
import { api, unwrap } from "@/lib/api"
import {
  dayMonth,
  type FinAccount,
  type FinCategory,
  money,
  parseMoney,
  type PendingItem,
  plainMoney,
  todayLocal,
  useFinanceAction,
  usePending,
} from "@/lib/finance"

const field =
  "h-9 w-full rounded-md bg-transparent px-2 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"

/** Contas sem data (F76): o que vai ter que ser pago, mas ainda sem quando. */
export function PendingSection({
  accounts,
  categories,
}: {
  accounts: FinAccount[]
  categories: FinCategory[]
}) {
  const pending = usePending()
  const [name, setName] = useState("")
  const [schedule, setSchedule] = useState<PendingItem | null>(null)
  const update = useFinanceAction(
    ({
      id,
      body,
    }: {
      id: string
      body: Partial<Pick<PendingItem, "name" | "estimate" | "categoryId" | "notes">>
    }) => unwrap(api.PATCH("/finance/pending/{id}", { params: { path: { id } }, body })),
  )
  const create = useFinanceAction(
    (body: { name: string }) => unwrap(api.POST("/finance/pending", { body })),
    { success: (_r, body) => `${body.name} anotada. Preencha o valor quando souber.` },
  )
  const remove = useFinanceAction(
    (item: PendingItem) =>
      unwrap(api.DELETE("/finance/pending/{id}", { params: { path: { id: item.id } } })),
    { success: (_r, item) => `${item.name} saiu da lista.` },
  )
  const items = pending.data ?? []
  const total = items.reduce((s, i) => s + (i.estimate ?? 0), 0)
  const unknown = items.filter((i) => !i.estimate).length

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Contas sem data
        </h2>
        {items.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {money(total)} estimados
            {unknown ? ` · ${unknown} sem valor` : ""}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-1.5 text-left font-medium">O quê</th>
              <th className="w-32 px-2 py-1.5 text-right font-medium">Valor estimado</th>
              <th className="w-40 px-2 py-1.5 text-left font-medium">Categoria</th>
              <th className="px-2 py-1.5 text-left font-medium">Notas</th>
              <th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b hover:bg-muted/30">
                <td className="px-1 py-0.5">
                  <input
                    key={item.name}
                    defaultValue={item.name}
                    aria-label="O quê"
                    className={field}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== item.name &&
                      update.mutate({ id: item.id, body: { name: e.target.value.trim() } })
                    }
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    key={item.estimate ?? "vazio"}
                    defaultValue={item.estimate ? plainMoney(item.estimate) : ""}
                    placeholder="não sei"
                    inputMode="decimal"
                    aria-label="Valor estimado"
                    className={`${field} text-right tabular-nums placeholder:text-muted-foreground`}
                    onBlur={(e) => {
                      const raw = e.target.value.trim()
                      const cents = raw ? parseMoney(raw) : null
                      if (raw && cents === null) return toast.error("Valor inválido.")
                      if (cents !== item.estimate)
                        update.mutate({ id: item.id, body: { estimate: cents } })
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <CategoryPicker
                    value={item.categoryId}
                    categories={categories}
                    onChange={(categoryId) => update.mutate({ id: item.id, body: { categoryId } })}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    key={item.notes ?? ""}
                    defaultValue={item.notes ?? ""}
                    aria-label="Notas"
                    className={`${field} text-muted-foreground focus:text-foreground`}
                    onBlur={(e) =>
                      e.target.value !== (item.notes ?? "") &&
                      update.mutate({ id: item.id, body: { notes: e.target.value.trim() || null } })
                    }
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                </td>
                <td className="px-1 py-0.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="xs" variant="outline" onClick={() => setSchedule(item)}>
                      Agendar ou já paguei
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Tirar ${item.name} da lista`}
                      title="Não vou mais precisar"
                      onClick={() => remove.mutate(item)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="px-1 py-0.5">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (name.trim()) create.mutate({ name: name.trim() })
                    setName("")
                  }}
                >
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={field}
                    aria-label="Nova conta sem data"
                    placeholder="+ Nova conta sem data (ex.: arrumar o para-choque) e Enter"
                  />
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Não entram no mês até você agendar. Agendada, vira uma prevista na data escolhida (com “Já
        paguei” e “Adiar”); se a prevista for apagada, a conta volta para cá.
      </p>
      <ScheduleDialog item={schedule} accounts={accounts} onClose={() => setSchedule(null)} />
    </section>
  )
}

function ScheduleDialog({
  item,
  accounts,
  onClose,
}: {
  item: PendingItem | null
  accounts: FinAccount[]
  onClose: () => void
}) {
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {item && <ScheduleForm key={item.id} item={item} accounts={accounts} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ScheduleForm({
  item,
  accounts,
  onClose,
}: {
  item: PendingItem
  accounts: FinAccount[]
  onClose: () => void
}) {
  const [date, setDate] = useState(todayLocal())
  const [amount, setAmount] = useState(item.estimate ? plainMoney(item.estimate) : "")
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.type !== "credit_card")?.id ?? accounts[0]?.id ?? "",
  )
  const save = useFinanceAction(
    (paid: boolean) =>
      unwrap(
        api.POST("/finance/pending/{id}/schedule", {
          params: { path: { id: item.id } },
          body: { date, accountId, amount: parseMoney(amount) ?? undefined, paid },
        }),
      ),
    {
      success: (_r, paid) =>
        paid
          ? `${item.name} registrada como paga em ${dayMonth(date)}.`
          : `${item.name} agendada para ${dayMonth(date)}.`,
    },
  )
  const valid = !!parseMoney(amount) && !!date && !!accountId
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{item.name}</DialogTitle>
        <DialogDescription>
          Agendar coloca como prevista na data; “Já paguei” registra como paga.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-amount">Valor</Label>
          <Input
            id="s-amount"
            inputMode="decimal"
            value={amount}
            autoFocus={!item.estimate}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="s-date">Data</Label>
          <Input id="s-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="s-account">Conta</Label>
        <NativeSelect
          id="s-account"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          disabled={!valid || save.isPending}
          onClick={() => save.mutate(true, { onSuccess: onClose })}
        >
          Já paguei
        </Button>
        <Button
          disabled={!valid || save.isPending}
          onClick={() => save.mutate(false, { onSuccess: onClose })}
        >
          Agendar
        </Button>
      </DialogFooter>
    </div>
  )
}
