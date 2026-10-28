import type { Page } from "@playwright/test"
import { E2E_API_URL } from "../playwright.config"

export const TOKEN = "token-de-teste"
export const SESSION_KEY = "personal-ai.session"

export type MockOptions = {
  loginStatus?: number
  retryAfter?: number
  meStatus?: number
  /** Atraso do POST /conversations, para testar o que acontece enquanto a conversa é criada. */
  createDelayMs?: number
  /** A primeira resposta cai no meio (sem `done`); o GET /stream entrega tudo (D68). */
  dropFirstStream?: boolean
}

const now = () => new Date().toISOString()
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const settings = {
  chatDefaultModel: "gpt-6-sol",
  chatReasoningEffort: "auto",
  customInstructions: "",
  backgroundModel: "gpt-6-luna",
  embeddingModel: "text-embedding-3-small",
  imageModel: "gpt-image-2",
  imageQuality: "medium",
  transcriptionModel: "gpt-4o-mini-transcribe",
  speechModel: "gpt-4o-mini-tts",
  speechVoice: "alloy",
  realtimeModel: "gpt-realtime-2.1-mini",
  realtimeVoice: "alloy",
  sinapsesAggressiveness: "balanced",
  sinapsesConsolidationDelaySeconds: 180,
  monthlyLimitUsd: 50,
  alertThreshold: 0.8,
  webSearchUsdPerCall: 0.01,
  codeInterpreterUsdPerContainer: 0.03,
  contextBudgetTokens: 60_000,
  savedPrompts: [
    { name: "resumir", text: "Resuma o texto abaixo em tópicos curtos:" },
    { name: "traduzir", text: "Traduza o texto abaixo para o inglês:" },
  ],
}

const models = [
  {
    id: "gpt-6-sol",
    displayName: "GPT-6 Sol",
    inputPrice: 2,
    cachedInputPrice: 0.2,
    outputPrice: 10,
    recommendation: "Padrão do chat.",
  },
  {
    id: "gpt-6-luna",
    displayName: "GPT-6 Luna",
    inputPrice: 0.1,
    cachedInputPrice: 0.01,
    outputPrice: 0.5,
    recommendation: "Barato.",
  },
].map((model) => ({
  ...model,
  kind: "chat",
  isSnapshot: false,
  extraPrices: {},
  contextWindow: null,
  example: "Oi",
  hasMetadata: true,
  available: true,
}))

type MessageRow = Record<string, unknown> & {
  id: string
  parentId: string | null
  role: string
  content: unknown[]
}

function message(
  partial: Partial<MessageRow> & { id: string; role: string; conversationId: string },
): MessageRow {
  return {
    parentId: null,
    content: [],
    contentText: null,
    model: null,
    status: "completed",
    error: null,
    tokensIn: null,
    tokensCached: null,
    tokensOut: null,
    tokensReasoning: null,
    costUsd: null,
    rating: null,
    feedbackNote: null,
    contextTokens: null,
    createdAt: now(),
    completedAt: now(),
    ...partial,
  }
}

const sse = (events: [string, unknown][]) =>
  events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("")

/**
 * API simulada para os E2E: login, conversas, streaming SSE e as listas das telas.
 * Registra os headers Authorization recebidos e os corpos enviados ao chat.
 */
export async function mockApi(page: Page, options: MockOptions = {}) {
  const {
    loginStatus = 200,
    retryAfter,
    meStatus = 200,
    createDelayMs = 0,
    dropFirstStream = false,
  } = options
  const authHeaders: string[] = []
  const sent: Record<string, unknown>[] = []
  const feedback: Record<string, unknown>[] = []
  /** Eventos completos da última resposta, para o GET /stream (reconexão). */
  const pendingReplay = new Map<string, [string, unknown][]>()
  let dropped = false
  let counter = 1
  const conversations = new Map<
    string,
    { conversation: Record<string, unknown>; messages: MessageRow[] }
  >()

  await page.route(`${E2E_API_URL}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE",
      "access-control-expose-headers": "retry-after",
    }
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: cors, json: body })
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors })
    const authorization = await request.headerValue("authorization")
    if (authorization) authHeaders.push(authorization)

    if (path === "/auth/login") {
      if (loginStatus === 200)
        return json({ token: TOKEN, expiresAt: new Date(Date.now() + 86_400_000).toISOString() })
      return route.fulfill({
        status: loginStatus,
        headers: { ...cors, ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
        json: { error: loginStatus === 401 ? "invalid_password" : "rate_limited" },
      })
    }
    if (path === "/auth/me")
      return meStatus === 200
        ? json({ authenticated: true })
        : json({ error: "unauthorized" }, meStatus)
    if (path === "/settings") return json({ settings, voices: ["alloy", "marin"] })
    if (path === "/models") return json({ models, pricesSource: "teste" })
    if (path === "/folders") return json({ folders: [] })
    if (path === "/chat/suggestions")
      return json({
        suggestions: ["Retomar a receita de pão", "Planejar a semana de treinos"],
        personalized: true,
      })
    if (path === "/usage")
      return json({
        days: [],
        byModel: [],
        bySource: [],
        topConversations: [],
        month: { costUsd: 0, limitUsd: 50, alert: "ok" },
      })
    if (path === "/sinapses") return json({ sinapses: [], tags: [], pendingSuggestions: 0 })
    if (path === "/sinapses/suggestions") return json({ suggestions: [] })
    if (path === "/sinapses/graph") return json({ nodes: [], edges: [] })
    if (path === "/files") return json({ files: [] })
    if (path === "/images") return json({ images: [] })
    if (path === "/backups") return json({ backups: [] })

    // Financeiro: uma conta, uma categoria e um lançamento, o suficiente para as telas abrirem.
    if (path.startsWith("/finance/")) {
      const today = new Date().toISOString().slice(0, 10)
      const month = today.slice(0, 7)
      const account = {
        id: uuid(500),
        name: "Bradesco",
        type: "checking",
        institution: "bradesco",
        holder: "Pedro",
        closingDay: null,
        dueDay: null,
        openingBalance: 100000,
        openingDate: `${month}-01`,
        bankBalance: 100000,
        bankBalanceDate: today,
        position: 0,
        archivedAt: null,
      }
      const category = {
        id: uuid(501),
        name: "Alimentação",
        kind: "expense",
        nature: "variable",
        position: 0,
        archivedAt: null,
      }
      const tx = {
        id: uuid(502),
        accountId: account.id,
        date: today,
        amount: -4800,
        class: "normal",
        description: "Feira",
        originalDescription: "PIX ENVIADO",
        categoryId: category.id,
        nature: null,
        status: "confirmed",
        categorySource: "user",
        aiConfidence: null,
        aiQuestion: null,
        aiSuggestions: [],
        installment: null,
        recurringId: null,
        recurringPeriod: null,
        deferredFrom: null,
        deferralReason: null,
        manual: false,
        notes: null,
        splits: null,
        invoiceDue: null,
        flag: null,
        payable: false,
        editableAmount: false,
      }
      const totals = {
        incomeRealized: 0,
        incomePlanned: 0,
        expenseRealized: 4800,
        expensePlanned: 0,
        fixedIncome: 0,
        variableIncome: 0,
        fixedExpense: 0,
        variableExpense: 4800,
        surplus: -4800,
        goal: 50000,
        free: -54800,
        daysLeft: 3,
        freePerDay: null,
      }
      const finance: Record<string, unknown> = {
        "/finance/accounts": { accounts: [account] },
        "/finance/categories": { categories: [category] },
        "/finance/settings": { monthlySavingGoal: 50000, aiConfidenceThreshold: 0.85 },
        "/finance/review": { items: [], ruleSuggestions: [] },
        "/finance/rules": { rules: [] },
        "/finance/pending": { items: [] },
        "/finance/debts": { items: [] },
        "/finance/overview": {
          month,
          today,
          totals,
          categories: [{ categoryId: category.id, amount: 4800, average: null }],
          flow: { income: [], expense: [tx] },
          bills: [],
          cash: null,
          balances: [],
          alerts: { reviewCount: 0, overdue: [], negativeAccounts: [], statementsUntil: today },
        },
        "/finance/statements": {
          today,
          months: [
            {
              month,
              accounts: [
                {
                  accountId: account.id,
                  status: "open",
                  coveredUntil: today,
                  lastImportAt: null,
                  files: [],
                },
              ],
            },
          ],
        },
        "/finance/planning": {
          month,
          recurring: [],
          installments: [],
          commitments: [],
          totals: { fixedIncome: 0, fixedExpenses: 0 },
        },
        "/finance/net-worth": {
          today,
          checking: [
            {
              accountId: account.id,
              balance: 95200,
              projectedEndOfMonth: 95200,
              bankBalance: 100000,
              bankBalanceDate: today,
            },
          ],
          cards: [],
          assets: [],
          installmentsLeft: 0,
          debtsLeft: 0,
          have: 95200,
          owe: 0,
          total: 95200,
          series: [{ month, total: 95200 }],
        },
      }
      if (method === "GET" && path in finance) return json(finance[path])
    }

    if (path === "/conversations" && method === "GET") {
      return json({ conversations: [...conversations.values()].map((item) => item.conversation) })
    }
    if (path === "/conversations" && method === "POST") {
      if (createDelayMs) await new Promise((resolve) => setTimeout(resolve, createDelayMs))
      const id = uuid(counter++)
      const body = request.postDataJSON() as Record<string, unknown>
      const conversation = {
        id,
        title: null,
        folderId: null,
        model: body.model ?? null,
        systemPrompt: null,
        settings: body.settings ?? {},
        anonymous: body.anonymous ?? false,
        pinned: false,
        archived: false,
        currentLeafMessageId: null,
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null,
      }
      conversations.set(id, { conversation, messages: [] })
      return json(conversation, 201)
    }

    const match = path.match(/^\/conversations\/([^/]+)(\/.*)?$/)
    if (match) {
      const data = conversations.get(match[1]!)
      if (!data) return json({ error: "not_found" }, 404)
      const rest = match[2] ?? ""
      if (rest === "" && method === "GET") return json(data)
      if (rest === "" && method === "PATCH") return json(data.conversation)

      if (rest === "/messages" || rest.endsWith("/regenerate")) {
        const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
        sent.push(body)
        const conversationId = match[1]!
        const regenerating = rest.endsWith("/regenerate")
        const dropThis = dropFirstStream && !dropped
        dropped = true
        const parent = regenerating
          ? (data.messages.find((item) => item.id === rest.split("/")[2])?.parentId ?? null)
          : null
        const user = regenerating
          ? null
          : message({
              id: uuid(counter++),
              conversationId,
              role: "user",
              parentId: (body.parentId as string | null) ?? null,
              content: [{ type: "text", text: body.text }],
              contentText: String(body.text),
            })
        const text = regenerating ? "Segunda versão da resposta." : "Olá! **Tudo certo** por aqui."
        const assistant = message({
          id: uuid(counter++),
          conversationId,
          role: "assistant",
          parentId: user?.id ?? parent,
          status: "streaming",
        })
        const chip = {
          type: "sinapse",
          action: "updated",
          sinapseId: uuid(999),
          title: "Sobre mim",
          versionId: uuid(998),
          suggestionId: null,
        }
        const done = {
          ...assistant,
          status: "completed",
          content: [{ type: "text", text }, chip],
          contentText: text,
          model: "gpt-6-sol",
          costUsd: 0.0012,
          contextTokens: 1_200,
        }
        if (user) data.messages.push(user)
        data.messages.push(done)
        data.conversation.currentLeafMessageId = done.id
        const events: [string, unknown][] = [
          ["start", { ...(user ? { userMessage: user } : {}), assistantMessage: assistant }],
          ...text.match(/.{1,6}/g)!.map((delta) => ["delta", { text: delta }] as [string, unknown]),
          ["part", chip],
          ["done", { message: done }],
        ]
        if (dropThis) {
          // Conexão cai antes do fim; o servidor continua e entrega tudo na reconexão.
          pendingReplay.set(conversationId, events)
        }
        return route.fulfill({
          status: 200,
          headers: { ...cors, "content-type": "text/event-stream" },
          body: sse(dropThis ? events.slice(0, 3) : events),
        })
      }
      if (rest === "/stream") {
        const replay = pendingReplay.get(match[1]!)
        if (!replay) return route.fulfill({ status: 204, headers: cors })
        pendingReplay.delete(match[1]!)
        return route.fulfill({
          status: 200,
          headers: { ...cors, "content-type": "text/event-stream" },
          body: sse(replay),
        })
      }
      if (rest === "/stop") return json({ stopped: false })
      const feedbackMatch = rest.match(/^\/messages\/([^/]+)\/feedback$/)
      if (feedbackMatch && method === "PUT") {
        const body = request.postDataJSON() as { rating: string | null; note?: string }
        feedback.push(body)
        const target = data.messages.find((item) => item.id === feedbackMatch[1])!
        Object.assign(target, { rating: body.rating, feedbackNote: body.note ?? null })
        return json(target)
      }
      if (rest === "/leaf") {
        const body = request.postDataJSON() as { messageId: string }
        data.conversation.currentLeafMessageId = body.messageId
        return json({ currentLeafMessageId: body.messageId })
      }
    }
    return json({ error: "not_found" }, 404)
  })

  return { authHeaders, sent, conversations, feedback }
}
