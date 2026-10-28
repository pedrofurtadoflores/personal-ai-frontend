"use client"

import { ChevronDownIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api, unwrap } from "@/lib/api"
import {
  dayMonth,
  errorText,
  type FinAccount,
  fullDate,
  importStatement,
  monthName,
  money,
  type Statements,
  useFinAccounts,
  useFinanceAction,
  useFinanceRefresh,
  useStatements,
} from "@/lib/finance"
import { cn } from "@/lib/utils"

type Row = Statements["months"][number]["accounts"][number]

const STATUS: Record<Row["status"], { label: (row: Row) => string; tone: string }> = {
  done: {
    label: () => "Concluído",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  pending: {
    label: (r) =>
      r.coveredUntil ? `Pendente · dados até ${dayMonth(r.coveredUntil)}` : "Pendente",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  open: {
    label: (r) =>
      r.coveredUntil
        ? `Em aberto · dados até ${dayMonth(r.coveredUntil)}`
        : "Em aberto · sem extrato",
    tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  none: { label: () => "Nenhum extrato", tone: "bg-muted text-muted-foreground" },
  future: { label: () => "Ainda não começou", tone: "bg-muted text-muted-foreground" },
}

const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} de ${d.toLocaleDateString("pt-BR")}`
}

/** Extratos por mês e conta (F61). */
export default function ExtratosPage() {
  const statements = useStatements()
  const accounts = useFinAccounts()
  if (!statements.data || !accounts.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-7">
      <p className="text-sm text-muted-foreground">
        Adicione quantos extratos quiser em cada mês: o que já foi importado não duplica. Quando um
        mês fechado fica completo, não precisa mais de nada.
      </p>
      {statements.data.months.map((m) => {
        const closed = m.month < statements.data.today.slice(0, 7)
        const done = m.accounts.filter((a) => a.status === "done").length
        return (
          <section key={m.month} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {monthName(m.month)} {m.month.slice(0, 4)}
              </h2>
              <span
                className={cn(
                  "ml-auto text-xs",
                  closed && done === m.accounts.length
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-muted-foreground",
                )}
              >
                {!closed
                  ? "mês em andamento"
                  : done === m.accounts.length
                    ? "✓ mês completo"
                    : `${done} de ${m.accounts.length} completos`}
              </span>
            </div>
            <div className="divide-y rounded-xl border bg-card">
              {m.accounts.map((row) => (
                <StatementRow
                  key={row.accountId}
                  row={row}
                  account={accounts.data.find((a) => a.id === row.accountId)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StatementRow({ row, account }: { row: Row; account?: FinAccount }) {
  const input = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const refresh = useFinanceRefresh()
  const undo = useFinanceAction(
    (id: string) => unwrap(api.POST("/finance/imports/{id}/undo", { params: { path: { id } } })),
    {
      success: "Importação desfeita: as linhas novas saíram e as juntadas voltaram ao que eram.",
    },
  )
  const status = STATUS[row.status]
  const fmt =
    account?.type === "credit_card"
      ? ".ofx"
      : account?.institution === "bradesco"
        ? ".csv"
        : ".ofx ou .csv"

  async function upload(file: File | undefined) {
    if (!file || !account) return
    setBusy(true)
    try {
      const result = await importStatement(file, account.id)
      const c = result.counts
      const parts = [
        `${c.inserted ?? 0} novas`,
        c.duplicates ? `${c.duplicates} já existiam` : "",
        c.merged ? `${c.merged} juntadas` : "",
        c.review ? `${c.review} para revisar` : "",
      ].filter(Boolean)
      const check = result.balanceCheck
      toast.success(`${file.name}: ${parts.join(", ")}.`, {
        description: check
          ? check.bank === check.computed
            ? `Saldo confere com o banco (${money(check.bank)}).`
            : `Saldo do banco ${money(check.bank)} × calculado ${money(check.computed)}.`
          : undefined,
      })
      await refresh()
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div
      className={cn("transition-colors", drag && "bg-primary/10")}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        if (row.status === "done") return toast("Esse mês já está completo para essa conta.")
        void upload(e.dataTransfer.files[0])
      }}
    >
      <div className="grid items-center gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1.2fr)_minmax(190px,1fr)_minmax(200px,1fr)_auto]">
        <div className="min-w-0">
          <p className="font-semibold">{account?.name ?? "Conta"}</p>
          <p className="text-xs text-muted-foreground">
            {account?.holder ? `${account.holder} · ` : ""}arquivo {fmt}
          </p>
        </div>
        <div>
          {busy ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Loader2Icon className="size-3.5 animate-spin" /> Importando…
            </span>
          ) : (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.tone)}>
              {status.label(row)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {row.lastImportAt ? `Última atualização ${stamp(row.lastImportAt)}` : "Ainda sem extrato"}
        </p>
        <div className="flex flex-wrap justify-end gap-1.5 max-md:justify-start">
          {row.status !== "done" && row.status !== "future" && (
            <>
              <input
                ref={input}
                type="file"
                accept=".ofx,.csv"
                hidden
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
                <UploadIcon /> Adicionar ({fmt})
              </Button>
            </>
          )}
          {row.files.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {row.files.length} {row.files.length > 1 ? "arquivos" : "arquivo"}
              <ChevronDownIcon className={cn("transition-transform", open && "rotate-180")} />
            </Button>
          )}
        </div>
      </div>
      {open && (
        <ul className="border-t border-dashed px-4 py-1">
          {row.files.map((f) => {
            const c = f.counts
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-2 border-b py-2 text-xs last:border-0"
              >
                <span className="flex-1 truncate font-mono">{f.fileName}</span>
                <span className="text-muted-foreground">
                  {stamp(f.createdAt)}
                  {f.periodEnd ? ` · dados até ${fullDate(f.periodEnd)}` : ""} · {c.inserted ?? 0}{" "}
                  novas
                  {c.duplicates ? `, ${c.duplicates} já existiam` : ""}
                  {c.merged ? `, ${c.merged} juntadas` : ""}
                  {c.review ? `, ${c.review} para revisar` : ""}
                </span>
                {f.status === "undone" ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Desfeita</span>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => undo.mutate(f.id)}>
                    Desfazer
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
