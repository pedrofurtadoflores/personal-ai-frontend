"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { API_URL, api, ApiError, unwrap } from "@/lib/api"
import type { paths } from "@/lib/api-schema"
import { auth } from "@/lib/auth"

// ─── Tipos (derivados do contrato) ───────────────────────────────────────────

type JsonOf<T> = T extends { content: { "application/json": infer B } } ? B : never
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: infer R
}
  ? JsonOf<R[200 & keyof R]> | JsonOf<R[201 & keyof R]>
  : never
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  requestBody?: { content: { "application/json": infer B } }
}
  ? B
  : never

export type FinAccount = Ok<"/finance/accounts", "get">["accounts"][number]
export type FinCategory = Ok<"/finance/categories", "get">["categories"][number]
export type Overview = Ok<"/finance/overview", "get">
export type Tx = Overview["flow"]["expense"][number]
/** Fatura do cartão que vence no mês: entra nas saídas no lugar das compras (F81). */
export type Bill = Overview["bills"][number]
export type Planning = Ok<"/finance/planning", "get">
export type NetWorth = Ok<"/finance/net-worth", "get">
export type Statements = Ok<"/finance/statements", "get">
export type Review = Ok<"/finance/review", "get">
export type ReviewItem = Review["items"][number]
export type Rule = Ok<"/finance/rules", "get">["rules"][number]
export type TxPatch = Body<"/finance/transactions/{id}", "patch">

// ─── Dinheiro e datas ────────────────────────────────────────────────────────

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centavos → "R$ 1.234,56" (sempre positivo; o sinal é decidido por quem chama). */
export const money = (cents: number) => brl.format(Math.abs(cents) / 100)
/** Com sinal: "−R$ 10,00" / "+R$ 10,00". */
export const signedMoney = (cents: number) =>
  (cents < 0 ? "−" : cents > 0 ? "+" : "") + money(cents)
/** Sem símbolo: "1.234,56". */
export const plainMoney = (cents: number) => plain.format(Math.abs(cents) / 100)

/** "1.234,56", "12,5", "12.50" ou "8.200" → centavos. Inválido → null. */
export function parseMoney(raw: string): number | null {
  let s = raw.trim().replace(/\s|R\$/g, "")
  if (!s) return null
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "")
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : null
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]
const pad = (n: number) => String(n).padStart(2, "0")

export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const currentMonth = () => todayLocal().slice(0, 7)
export const monthName = (month: string) => MONTH_NAMES[Number(month.slice(5, 7)) - 1]!
export const monthLabel = (month: string) => {
  const name = monthName(month)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${month.slice(0, 4)}`
}
export const shortMonth = (month: string) => monthName(month).slice(0, 3)
export function addMonths(month: string, n: number) {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
/** "2026-10-05" → "05/10". */
export const dayMonth = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
export const fullDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
export const lastDayOf = (month: string) =>
  `${month}-${pad(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())}`

/** "5", "05/11" ou "05/11/2026" dentro do mês de referência → "AAAA-MM-DD". Inválido → null. */
export function parseDayInput(raw: string, month: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?:\/(\d{1,2})(?:\/(\d{4}))?)?$/)
  if (!m) return null
  const year = Number(m[3] ?? month.slice(0, 4))
  const mm = Number(m[2] ?? month.slice(5, 7))
  const dd = Number(m[1])
  const max = new Date(year, mm, 0).getDate()
  if (mm < 1 || mm > 12 || dd < 1 || dd > max) return null
  return `${year}-${pad(mm)}-${pad(dd)}`
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

export function useFinAccounts() {
  return useQuery({
    queryKey: ["finance", "accounts"],
    queryFn: () => unwrap(api.GET("/finance/accounts")),
    select: (data) => data.accounts.filter((a) => !a.archivedAt),
  })
}

export function useFinCategories() {
  return useQuery({
    queryKey: ["finance", "categories"],
    queryFn: () => unwrap(api.GET("/finance/categories")),
    select: (data) => data.categories.filter((c) => !c.archivedAt),
  })
}

export function useFinSettings() {
  return useQuery({
    queryKey: ["finance", "settings"],
    queryFn: () => unwrap(api.GET("/finance/settings")),
  })
}

export function useOverview(month: string) {
  return useQuery({
    queryKey: ["finance", "overview", month],
    queryFn: () => unwrap(api.GET("/finance/overview", { params: { query: { month } } })),
    placeholderData: (previous) => previous,
  })
}

export function usePlanning(month: string) {
  return useQuery({
    queryKey: ["finance", "planning", month],
    queryFn: () => unwrap(api.GET("/finance/planning", { params: { query: { month } } })),
    placeholderData: (previous) => previous,
  })
}

export function useNetWorth() {
  return useQuery({
    queryKey: ["finance", "net-worth"],
    queryFn: () => unwrap(api.GET("/finance/net-worth")),
  })
}

export function useStatements() {
  return useQuery({
    queryKey: ["finance", "statements"],
    queryFn: () => unwrap(api.GET("/finance/statements", { params: { query: { monthsBack: 3 } } })),
  })
}

export function useReview() {
  return useQuery({
    queryKey: ["finance", "review"],
    queryFn: () => unwrap(api.GET("/finance/review")),
  })
}

export function useRules() {
  return useQuery({
    queryKey: ["finance", "rules"],
    queryFn: () => unwrap(api.GET("/finance/rules")),
    select: (data) => data.rules,
  })
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/** Recarrega tudo do Financeiro (as telas dependem umas das outras). */
export function useFinanceRefresh() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["finance"] })
}

export const errorText = (error: unknown) => {
  const code = error instanceof ApiError ? error.code : ""
  const messages: Record<string, string> = {
    bank_value_locked: "O valor do banco não muda. Divida ou marque como transferência.",
    split_mismatch: "A soma das partes precisa ser igual ao valor.",
    not_planned: "Esta transação não está mais prevista.",
    card_charge: "Cobranças do cartão caem sozinhas na fatura.",
    category_exists: "Já existe uma categoria com esse nome.",
    invalid_pattern: "Padrão inválido.",
    invalid_statement: "Não consegui ler o arquivo. Use o OFX ou CSV exportado do banco.",
    account_mismatch: "Esse arquivo é de outro tipo de conta.",
    account_required: "Escolha a conta deste extrato.",
    payload_too_large: "O arquivo passa de 2 MB.",
    network_error: "Sem conexão com o servidor.",
  }
  return messages[code] ?? "Não deu certo. Tente de novo."
}

/** Desfaz uma operação do Financeiro (F22). */
export async function undoOperation(operationId: string) {
  await unwrap(api.POST("/finance/operations/{id}/undo", { params: { path: { id: operationId } } }))
}

/**
 * Mutação do Financeiro: recarrega as telas e, se a resposta trouxer `operationId`, mostra o
 * toast com "Desfazer".
 */
export function useFinanceAction<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  opts: { success?: string | ((result: TResult, input: TInput) => string | null) } = {},
) {
  const refresh = useFinanceRefresh()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, input) => {
      await refresh()
      const message =
        typeof opts.success === "function" ? opts.success(result, input) : opts.success
      const operationId = (result as { operationId?: string } | undefined)?.operationId
      if (message) {
        toast.success(message, {
          action: operationId
            ? {
                label: "Desfazer",
                onClick: () => {
                  void undoOperation(operationId).then(refresh, () =>
                    toast.error("Não deu para desfazer."),
                  )
                },
              }
            : undefined,
        })
      }
    },
    onError: (error) => toast.error(errorText(error)),
  })
}

export const patchTransaction = (id: string, body: TxPatch) =>
  unwrap(api.PATCH("/finance/transactions/{id}", { params: { path: { id } }, body }))

/** Importa um extrato (multipart). */
export async function importStatement(file: File, accountId: string) {
  const form = new FormData()
  form.append("file", file)
  const token = auth.getToken()
  const response = await fetch(
    `${API_URL}/finance/imports?accountId=${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    },
  )
  const body = (await response.json().catch(() => ({}))) as Ok<"/finance/imports", "post"> & {
    error?: string
  }
  if (!response.ok) {
    if (response.status === 401) auth.clear()
    throw new ApiError(response.status, body.error ?? "request_failed")
  }
  return body
}

// ─── Contas sem data (F76) ───────────────────────────────────────────────────

export type PendingItem = Ok<"/finance/pending", "get">["items"][number]

export function usePending() {
  return useQuery({
    queryKey: ["finance", "pending"],
    queryFn: () => unwrap(api.GET("/finance/pending")),
    select: (data) => data.items,
  })
}

// ─── Dívidas (F84) ───────────────────────────────────────────────────────────

export type Debt = Ok<"/finance/debts", "get">["items"][number]

export function useDebts() {
  return useQuery({
    queryKey: ["finance", "debts"],
    queryFn: () => unwrap(api.GET("/finance/debts")),
    select: (data) => data.items,
  })
}
