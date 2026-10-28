"use client"

import { ChevronLeftIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CategoryPicker } from "@/components/finance/category-picker"
import { NativeSelect } from "@/components/ui-extra/native-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api, unwrap } from "@/lib/api"
import {
  errorText,
  type FinAccount,
  type FinCategory,
  signedMoney,
  useFinAccounts,
  useFinanceAction,
  useFinCategories,
  useRules,
} from "@/lib/finance"

/** Ajustes do Financeiro (F66): contas, categorias e regras. */
export default function AjustesPage() {
  const accounts = useFinAccounts()
  const categories = useFinCategories()
  const rules = useRules()
  const categorize = useFinanceAction(() => unwrap(api.POST("/finance/categorize")), {
    success: "A IA vai categorizar as pendentes em segundo plano.",
  })
  if (!accounts.data || !categories.data || !rules.data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/financeiro" />} nativeButton={false}>
          <ChevronLeftIcon /> Voltar
        </Button>
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Ajustes
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => categorize.mutate(undefined)}
        >
          <SparklesIcon /> Pedir à IA para categorizar as pendentes
        </Button>
      </div>
      <Accounts accounts={accounts.data} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Rules categories={categories.data} rules={rules.data} />
        <Categories categories={categories.data} />
      </div>
    </div>
  )
}

const field =
  "h-8 w-full rounded-md bg-transparent px-2 outline-none hover:ring-1 hover:ring-border focus:ring-2 focus:ring-ring"

function Accounts({ accounts }: { accounts: FinAccount[] }) {
  const update = useFinanceAction(({ id, body }: { id: string; body: Record<string, unknown> }) =>
    unwrap(api.PATCH("/finance/accounts/{id}", { params: { path: { id } }, body })),
  )
  const create = useFinanceAction(
    (body: {
      name: string
      type: "checking" | "credit_card"
      institution: "nubank" | "bradesco" | "other"
    }) => unwrap(api.POST("/finance/accounts", { body })),
    { success: (_r, body) => `${body.name} criada.` },
  )
  const [form, setForm] = useState({
    name: "",
    type: "checking" as "checking" | "credit_card",
    institution: "other" as "nubank" | "bradesco" | "other",
  })
  const text = (a: FinAccount, key: "name" | "holder", label: string) => (
    <input
      key={`${a.id}-${a[key]}`}
      defaultValue={a[key] ?? ""}
      aria-label={label}
      className={field}
      onBlur={(e) =>
        e.target.value !== (a[key] ?? "") &&
        update.mutate({ id: a.id, body: { [key]: e.target.value.trim() || null } })
      }
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  )
  const dayField = (a: FinAccount, key: "closingDay" | "dueDay", label: string) => (
    <input
      key={`${a.id}-${a[key]}`}
      defaultValue={a[key] ?? ""}
      inputMode="numeric"
      aria-label={label}
      className={`${field} w-14 tabular-nums`}
      onBlur={(e) => {
        const day = Number(e.target.value)
        if (day >= 1 && day <= 31 && day !== a[key])
          update.mutate({ id: a.id, body: { [key]: day } })
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  )
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Contas e cartões
      </h3>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-1.5 text-left font-medium">Nome</th>
              <th className="px-2 py-1.5 text-left font-medium">Titular</th>
              <th className="px-2 py-1.5 text-left font-medium">Tipo</th>
              <th className="px-2 py-1.5 text-left font-medium">Ciclo do cartão</th>
              <th className="px-2 py-1.5 text-left font-medium">Só repasse</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="px-1 py-0.5">{text(a, "name", "Nome")}</td>
                <td className="w-40 px-1 py-0.5">{text(a, "holder", "Titular")}</td>
                <td className="px-2 py-0.5 text-muted-foreground">
                  {a.type === "credit_card" ? "Cartão de crédito" : "Conta corrente"}
                </td>
                <td className="px-1 py-0.5">
                  {a.type === "credit_card" ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      fecha dia {dayField(a, "closingDay", "Dia do fechamento")} vence dia{" "}
                      {dayField(a, "dueDay", "Dia do vencimento")}
                    </span>
                  ) : (
                    <span className="px-1 text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-0.5">
                  {a.type !== "credit_card" && (
                    <label
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                      title="Conta sem extrato, só de passagem: fica fora do patrimônio e dos extratos, e o previsto nela se confirma sozinho na data"
                    >
                      <Switch
                        checked={!a.trackBalance}
                        onCheckedChange={(on) =>
                          update.mutate({ id: a.id, body: { trackBalance: !on } })
                        }
                        aria-label={`${a.name}: conta só de repasse`}
                      />
                      {a.trackBalance ? "não" : "sim"}
                    </label>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim()) return
          create.mutate({ ...form, name: form.name.trim() })
          setForm((f) => ({ ...f, name: "" }))
        }}
      >
        <Input
          className="w-56"
          placeholder="Nova conta"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          aria-label="Nome da nova conta"
        />
        <NativeSelect
          className="w-44"
          value={form.type}
          aria-label="Tipo da nova conta"
          onChange={(e) =>
            setForm((f) => ({ ...f, type: e.target.value as "checking" | "credit_card" }))
          }
          options={[
            { value: "checking", label: "Conta corrente" },
            { value: "credit_card", label: "Cartão de crédito" },
          ]}
        />
        <NativeSelect
          className="w-36"
          value={form.institution}
          aria-label="Banco da nova conta"
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              institution: e.target.value as "nubank" | "bradesco" | "other",
            }))
          }
          options={[
            { value: "nubank", label: "Nubank" },
            { value: "bradesco", label: "Bradesco" },
            { value: "other", label: "Outro" },
          ]}
        />
        <Button type="submit" variant="outline" size="sm">
          Adicionar
        </Button>
      </form>
    </section>
  )
}

function Categories({ categories }: { categories: FinCategory[] }) {
  const update = useFinanceAction(
    ({
      id,
      body,
    }: {
      id: string
      body: { name?: string; nature?: "fixed" | "variable"; archived?: boolean }
    }) => unwrap(api.PATCH("/finance/categories/{id}", { params: { path: { id } }, body })),
    { success: (_r, input) => (input.body.archived ? "Categoria arquivada." : null) },
  )
  const create = useFinanceAction(
    (body: { name: string; kind: "income" | "expense" }) =>
      unwrap(api.POST("/finance/categories", { body: { ...body, nature: "variable" } })),
    { success: (_r, body) => `${body.name} criada.` },
  )
  const [form, setForm] = useState({ name: "", kind: "expense" as "income" | "expense" })
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Categorias
      </h3>
      <div className="rounded-xl border bg-card px-2 py-1 text-sm">
        {(["expense", "income"] as const).map((kind) => (
          <div key={kind}>
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              {kind === "expense" ? "Despesas" : "Receitas"}
            </p>
            {categories
              .filter((c) => c.kind === kind)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-2 border-b py-0.5 last:border-0">
                  <input
                    key={c.name}
                    defaultValue={c.name}
                    aria-label="Nome da categoria"
                    className={field}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== c.name &&
                      update.mutate({ id: c.id, body: { name: e.target.value.trim() } })
                    }
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    title="Tipo padrão das transações desta categoria"
                    onClick={() =>
                      update.mutate({
                        id: c.id,
                        body: { nature: c.nature === "fixed" ? "variable" : "fixed" },
                      })
                    }
                  >
                    {c.nature === "fixed" ? "Fixo" : "Variável"}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Arquivar ${c.name}`}
                    onClick={() => update.mutate({ id: c.id, body: { archived: true } })}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
          </div>
        ))}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!form.name.trim()) return
          create.mutate({ name: form.name.trim(), kind: form.kind })
          setForm((f) => ({ ...f, name: "" }))
        }}
      >
        <Input
          className="w-48"
          placeholder="Nova categoria"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          aria-label="Nome da nova categoria"
        />
        <NativeSelect
          className="w-32"
          value={form.kind}
          aria-label="Tipo da nova categoria"
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "income" | "expense" }))}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
          ]}
        />
        <Button type="submit" variant="outline" size="sm">
          Adicionar
        </Button>
      </form>
    </section>
  )
}

function Rules({
  categories,
  rules,
}: {
  categories: FinCategory[]
  rules: ReturnType<typeof useRules>["data"] & object
}) {
  const toggle = useFinanceAction(({ id, enabled }: { id: string; enabled: boolean }) =>
    unwrap(api.PATCH("/finance/rules/{id}", { params: { path: { id } }, body: { enabled } })),
  )
  const remove = useFinanceAction(
    (id: string) => unwrap(api.DELETE("/finance/rules/{id}", { params: { path: { id } } })),
    { success: "Regra apagada." },
  )
  const create = useFinanceAction(
    (body: {
      pattern: string
      action: "categorize" | "ask" | "transfer"
      categoryId: string | null
    }) => unwrap(api.POST("/finance/rules", { body })),
    {
      success: (_r, body) =>
        `Regra criada para “${body.pattern}”. Vale para as próximas importações.`,
    },
  )
  const [pattern, setPattern] = useState("")
  const [action, setAction] = useState<"categorize" | "ask" | "transfer">("categorize")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [test, setTest] = useState<{
    count: number
    sample: { id: string; date: string; amount: number; description: string }[]
  } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "?"

  async function runTest() {
    if (!pattern.trim()) return setTest(null)
    try {
      setTest(
        await unwrap(
          api.POST("/finance/rules/test", {
            body: { pattern: pattern.trim(), matchType: "contains" },
          }),
        ),
      )
      setTestError(null)
    } catch (error) {
      setTestError(errorText(error))
    }
  }

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Regras · rodam antes da IA, no texto original do banco
      </h3>
      <form
        className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!pattern.trim() || (action === "categorize" && !categoryId)) return
          create.mutate({
            pattern: pattern.trim(),
            action,
            categoryId: action === "categorize" ? categoryId : null,
          })
          setPattern("")
          setTest(null)
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-40 flex-1"
            placeholder="Texto contém… (ex.: DROGASIL)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onBlur={runTest}
            aria-label="Padrão da regra"
          />
          <NativeSelect
            className="w-44"
            value={action}
            aria-label="Ação da regra"
            onChange={(e) => setAction(e.target.value as typeof action)}
            options={[
              { value: "categorize", label: "Categorizar como" },
              { value: "ask", label: "Sempre perguntar" },
              { value: "transfer", label: "Transferência" },
            ]}
          />
          {action === "categorize" && (
            <div className="w-44">
              <CategoryPicker
                variant="field"
                value={categoryId}
                categories={categories}
                onChange={setCategoryId}
                allowNone={false}
              />
            </div>
          )}
          <Button type="submit" size="sm" className="self-center">
            Criar regra
          </Button>
        </div>
        {testError && <p className="text-xs text-destructive">{testError}</p>}
        {test && (
          <p className="text-xs text-muted-foreground">
            {test.count} lançamentos dos últimos 90 dias casam
            {test.sample.length
              ? `: ${test.sample.map((s) => `${s.description} (${signedMoney(s.amount)})`).join(", ")}${test.count > test.sample.length ? "…" : ""}`
              : "."}
          </p>
        )}
      </form>
      <div className="rounded-xl border bg-card text-sm">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
            <Switch
              checked={r.enabled}
              onCheckedChange={(enabled) => toggle.mutate({ id: r.id, enabled })}
              aria-label="Ativar regra"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate">
                Texto{" "}
                {r.matchType === "regex"
                  ? "casa com"
                  : r.matchType === "equals"
                    ? "igual a"
                    : "contém"}{" "}
                <span className="font-mono text-xs">{r.pattern}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {r.action === "categorize"
                  ? `→ ${catName(r.categoryId)}`
                  : r.action === "ask"
                    ? "→ sempre perguntar (a IA não chuta)"
                    : "→ transferência entre contas"}
                {r.renameTo ? ` · renomeia para “${r.renameTo}”` : ""}
              </p>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">{r.hits} usos</span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Apagar regra"
              onClick={() => remove.mutate(r.id)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        {!rules.length && <p className="px-3 py-4 text-muted-foreground">Nenhuma regra ainda.</p>}
      </div>
    </section>
  )
}
