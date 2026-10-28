"use client"

import { Loader2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, unwrap } from "@/lib/api"
import {
  currentMonth,
  dayMonth,
  lastDayOf,
  monthName,
  money,
  type NetWorth,
  parseMoney,
  plainMoney,
  shortMonth,
  signedMoney,
  useFinAccounts,
  useFinanceAction,
  useNetWorth,
  usePlanning,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

const thousand = (cents: number) =>
  `R$ ${(cents / 100 / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`

/** Linha da evolução (uma série, cor única, valor do primeiro e do último mês). */
function NetChart({ series }: { series: NetWorth["series"] }) {
  const points = series.filter((s): s is { month: string; total: number } => s.total !== null)
  if (points.length < 2)
    return (
      <p className="text-sm text-muted-foreground">
        A evolução aparece depois de dois meses com saldo.
      </p>
    )
  const W = 640
  const H = 200
  const padX = 12
  const padR = 84
  const padT = 26
  const padB = 28
  const values = points.map((p) => p.total)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, Math.abs(hi) * 0.02, 100)
  const min = lo - span * 0.3
  const max = hi + span * 0.3
  const x = (i: number) => padX + (i * (W - padX - padR)) / (points.length - 1)
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`)
    .join(" ")
  const lastX = x(points.length - 1)
  const lastY = y(points.at(-1)!.total)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label={`Patrimônio de ${monthName(points[0]!.month)} a ${monthName(points.at(-1)!.month)}`}
    >
      {[0.2, 0.8].map((f) => (
        <line
          key={f}
          x1={padX}
          x2={W - padR}
          y1={padT + f * (H - padT - padB)}
          y2={padT + f * (H - padT - padB)}
          className="stroke-border"
        />
      ))}
      <path
        d={`${line} L${lastX.toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`}
        className="fill-[var(--viz-1)] opacity-10"
      />
      <path
        d={line}
        className="fill-none stroke-[var(--viz-1)]"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <text
          key={p.month}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[11px]"
        >
          {shortMonth(p.month)}
        </text>
      ))}
      <circle cx={x(0)} cy={y(points[0]!.total)} r={3.5} className="fill-[var(--viz-1)]" />
      <text x={x(0)} y={y(points[0]!.total) + 18} className="fill-muted-foreground text-[11px]">
        {thousand(points[0]!.total)}
      </text>
      <circle
        cx={lastX}
        cy={lastY}
        r={5}
        className="fill-[var(--viz-1)] stroke-card"
        strokeWidth={2}
      />
      <text x={lastX + 10} y={lastY - 8} className="fill-foreground text-xs font-semibold">
        {thousand(points.at(-1)!.total)}
      </text>
      {points.map((p, i) => (
        <circle
          key={`hit-${p.month}`}
          cx={x(i)}
          cy={y(p.total)}
          r={16}
          className="fill-transparent"
        >
          <title>{`${monthName(p.month)}: ${money(p.total)}`}</title>
        </circle>
      ))}
    </svg>
  )
}

/** Patrimônio (F65): quanto tenho, o que tenho, o que devo e a evolução. */
export default function PatrimonioPage() {
  const netWorth = useNetWorth()
  const accounts = useFinAccounts()
  const planning = usePlanning(currentMonth())
  const [newAsset, setNewAsset] = useState("")
  const asset = useFinanceAction(
    ({ id, body }: { id: string; body: { name?: string; value?: number; archived?: boolean } }) =>
      unwrap(api.PATCH("/finance/assets/{id}", { params: { path: { id } }, body })),
    {
      success: (_r, input) =>
        input.body.archived
          ? "Bem removido."
          : input.body.value !== undefined
            ? "Valor atualizado."
            : null,
    },
  )
  const createAsset = useFinanceAction(
    (name: string) =>
      unwrap(
        api.POST("/finance/assets", {
          body: { name, type: "other", value: 0, source: "Valor manual" },
        }),
      ),
    {
      success: (_r, name) => `${name} adicionado. Preencha o valor.`,
    },
  )
  const invoice = useFinanceAction(({ id, body }: { id: string; body: Record<string, string> }) =>
    unwrap(api.PATCH("/finance/invoices/{id}", { params: { path: { id } }, body })),
  )

  if (!netWorth.data || !accounts.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const n = netWorth.data
  const name = (id: string) => accounts.data.find((a) => a.id === id)
  const prev = [...n.series].reverse().find((s, i) => i > 0 && s.total !== null)?.total ?? null
  const installments = planning.data?.installments ?? []

  return (
    <div className="flex flex-col gap-7">
      <section className="grid items-center gap-6 rounded-xl border bg-card p-5 md:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Patrimônio
          </span>
          <span className="text-4xl font-semibold tracking-tight tabular-nums max-sm:text-3xl">
            {money(n.total)}
          </span>
          {prev !== null && (
            <span
              className={
                n.total >= prev ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
              }
            >
              {signedMoney(n.total - prev)} desde o mês passado
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            Você tem {money(n.have)} e deve {money(n.owe)}
          </span>
        </div>
        <div className="min-w-0">
          <NetChart series={n.series} />
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Ver como tabela
            </summary>
            <ul className="mt-1 text-sm">
              {n.series.map((s) => (
                <li key={s.month} className="flex justify-between border-b py-1 last:border-0">
                  <span className="capitalize">
                    {monthName(s.month)} {s.month.slice(0, 4)}
                  </span>
                  <span className="tabular-nums">{s.total === null ? "—" : money(s.total)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Você tem
            </h2>
            <b className="ml-auto tabular-nums">{money(n.have)}</b>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card text-sm">
            <Group label="Contas" />
            {n.checking.map((c) => (
              <div key={c.accountId} className="flex items-center gap-3 border-b px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{name(c.accountId)?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {name(c.accountId)?.holder ? `${name(c.accountId)?.holder} · ` : ""}
                    {c.bankBalanceDate ? `extrato até ${dayMonth(c.bankBalanceDate)} · ` : ""}
                    {c.projectedEndOfMonth !== null && (
                      <span
                        className={cn(
                          c.projectedEndOfMonth < 0 && "font-semibold text-destructive",
                        )}
                      >
                        em {dayMonth(lastDayOf(currentMonth()))}:{" "}
                        {signedMoney(c.projectedEndOfMonth)}
                      </span>
                    )}
                  </p>
                </div>
                <b className="tabular-nums">{c.balance === null ? "—" : money(c.balance)}</b>
              </div>
            ))}
            <Group label="Bens" />
            {n.assets.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border-b px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <input
                    key={a.name}
                    defaultValue={a.name}
                    aria-label="Nome do bem"
                    className="h-8 w-full rounded-md bg-transparent px-1.5 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== a.name &&
                      asset.mutate({ id: a.id, body: { name: e.target.value.trim() } })
                    }
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                  <p className="px-1.5 text-xs text-muted-foreground">
                    {a.source ?? "Valor manual"}
                    {a.valuedAt ? ` · ${dayMonth(a.valuedAt)}/${a.valuedAt.slice(0, 4)}` : ""}
                  </p>
                </div>
                <input
                  key={a.value}
                  defaultValue={plainMoney(a.value)}
                  inputMode="decimal"
                  aria-label={`Valor de ${a.name}`}
                  className="h-8 w-32 rounded-md bg-transparent px-1.5 text-right tabular-nums outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"
                  onBlur={(e) => {
                    const cents = parseMoney(e.target.value)
                    if (cents === null) return toast.error("Valor inválido.")
                    if (cents !== a.value) asset.mutate({ id: a.id, body: { value: cents } })
                  }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remover ${a.name}`}
                  onClick={() => asset.mutate({ id: a.id, body: { archived: true } })}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <form
              className="px-2 py-1"
              onSubmit={(e) => {
                e.preventDefault()
                if (newAsset.trim()) createAsset.mutate(newAsset.trim())
                setNewAsset("")
              }}
            >
              <input
                value={newAsset}
                onChange={(e) => setNewAsset(e.target.value)}
                placeholder="+ Adicionar bem (ex.: moto, investimento) e Enter"
                aria-label="Novo bem"
                className="h-8 w-full bg-transparent px-1.5 outline-none placeholder:text-muted-foreground"
              />
            </form>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-center">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Você deve
            </h2>
            <b className="ml-auto tabular-nums">{money(n.owe)}</b>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card text-sm">
            <Group label="Cartão" />
            {n.cards.map((c) => (
              <div key={c.accountId} className="flex items-center gap-3 border-b px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Fatura aberta · {name(c.accountId)?.name}</p>
                  {c.invoice && (
                    <p className="text-xs text-muted-foreground">
                      fecha {dayMonth(c.invoice.closingDate)} · vence {dayMonth(c.invoice.dueDate)}
                    </p>
                  )}
                </div>
                <b className="tabular-nums">{money(Math.max(0, c.open))}</b>
              </div>
            ))}
            <Group label="Parcelas a vencer" />
            {installments.length ? (
              installments.map((i) => (
                <div
                  key={i.group}
                  className="flex items-center gap-3 border-b px-3 py-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{i.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.total - i.currentNumber} × {money(i.amount)} · até {monthName(i.lastMonth)}
                    </p>
                  </div>
                  <span className="tabular-nums">{money(i.remaining)}</span>
                </div>
              ))
            ) : (
              <p className="px-3 py-2 text-muted-foreground">Nenhuma.</p>
            )}
            <Group label="Dívidas" />
            <Link
              href="/financeiro/dividas"
              className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1">
                {n.debtsLeft ? "Quanto falta pagar" : "Nenhuma em aberto"}
              </span>
              <span className="tabular-nums">{money(n.debtsLeft)}</span>
            </Link>
          </div>
        </section>
      </div>

      {n.cards.map((c) =>
        c.invoice ? (
          <section key={c.accountId} className="flex flex-col gap-2.5">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {name(c.accountId)?.name} · fatura de{" "}
              {monthName(c.invoice.referenceMonth.slice(0, 7))}
            </h2>
            <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Até agora</span>
                <b className="text-lg tabular-nums">{money(Math.max(0, c.open))}</b>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Total informado pelo banco</span>
                <b className="text-lg tabular-nums">
                  {c.invoice.statementTotal !== null ? money(c.invoice.statementTotal) : "—"}
                </b>
              </div>
              {(
                [
                  ["closingDate", "Fecha"],
                  ["bestPurchaseDate", "Melhor data de compra"],
                  ["dueDate", "Vence"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Input
                    type="date"
                    defaultValue={c.invoice![field]}
                    key={c.invoice![field]}
                    onBlur={(e) =>
                      e.target.value &&
                      e.target.value !== c.invoice![field] &&
                      invoice.mutate({ id: c.invoice!.id, body: { [field]: e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  )
}

function Group({ label }: { label: string }) {
  return (
    <div className="border-b bg-muted/40 px-3 py-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {label}
    </div>
  )
}
