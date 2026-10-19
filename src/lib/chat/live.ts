import type { QueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { api, ApiError, unwrap } from "@/lib/api"
import { streamSse } from "@/lib/chat/stream"
import type { Message, MessagePart } from "@/lib/types"

/**
 * Respostas em andamento, guardadas fora dos componentes: trocar de página (ex.: a conversa
 * nova que acabou de ganhar URL) não interrompe o streaming.
 *
 * A geração vive no servidor (D68): se a conexão cair (celular bloqueado, troca de rede),
 * o front se reconecta em `GET /conversations/:id/stream` e recebe tudo de novo desde o começo.
 */
export type LiveReply = {
  conversationId: string
  assistantId: string | null
  text: string
  parts: MessagePart[]
  status: "streaming" | "error"
  tool: { tool: string; state: string } | null
  error: string | null
  /** Conexão caiu, mas a resposta pode continuar no servidor: dá para tentar de novo. */
  reconnectable: boolean
  /** Reconectando depois de a conexão cair. */
  reconnecting: boolean
}

type ConversationData = {
  conversation: { currentLeafMessageId: string | null }
  messages: Message[]
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000]

const replies = new Map<string, LiveReply>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()
let frame: number | null = null

function emit() {
  // Agrupa as atualizações por quadro: dezenas de deltas por segundo viram um render.
  if (frame !== null) return
  frame = requestAnimationFrame(() => {
    frame = null
    listeners.forEach((listener) => listener())
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLiveReply(conversationId: string | null | undefined) {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? replies.get(conversationId) : undefined),
    () => undefined,
  )
}

export const isStreaming = (conversationId: string) =>
  replies.get(conversationId)?.status === "streaming"

/** Parar é um pedido ao servidor (D68); ele salva o parcial e encerra o streaming. */
export async function stopReply(conversationId: string) {
  try {
    await unwrap(api.POST("/conversations/{id}/stop", { params: { path: { id: conversationId } } }))
  } catch {
    // Sem servidor, pelo menos para de esperar aqui.
    controllers.get(conversationId)?.abort()
  }
}

const conversationKey = (id: string) => ["conversation", id]

function upsertMessages(
  queryClient: QueryClient,
  conversationId: string,
  items: Message[],
  leafId?: string,
) {
  queryClient.setQueryData<ConversationData>(conversationKey(conversationId), (data) => {
    if (!data) return data
    const byId = new Map(data.messages.map((message) => [message.id, message]))
    for (const item of items) byId.set(item.id, item)
    return {
      ...data,
      conversation: { ...data.conversation, ...(leafId ? { currentLeafMessageId: leafId } : {}) },
      messages: [...byId.values()],
    }
  })
}

export const errorText: Record<string, string> = {
  network_error: "Sem conexão com o servidor.",
  openai_not_configured: "A chave da OpenAI não está configurada no backend.",
  rate_limited: "Muitas mensagens seguidas. Espere um pouco.",
  empty_message: "Escreva uma mensagem ou anexe um arquivo.",
  reply_in_progress: "Já tem uma resposta em andamento nesta conversa. Espere ela terminar.",
  not_continuable: "Esta resposta não pode ser continuada.",
  anonymous_memory: "Conversa anônima não usa a memória.",
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * Acompanha uma resposta: abre o pedido inicial (enviar/regenerar/continuar, ou retomar) e,
 * se a conexão cair antes do `done`, reconecta e recebe tudo de novo.
 */
async function follow(params: {
  queryClient: QueryClient
  conversationId: string
  initial: { path: string; method?: "GET" | "POST"; body?: unknown }
}) {
  const { queryClient, conversationId } = params
  const live: LiveReply = {
    conversationId,
    assistantId: null,
    text: "",
    parts: [],
    status: "streaming",
    tool: null,
    error: null,
    reconnectable: false,
    reconnecting: false,
  }
  replies.set(conversationId, live)
  const controller = new AbortController()
  controllers.set(conversationId, controller)
  emit()

  const update = (patch: Partial<LiveReply>) => {
    Object.assign(live, patch)
    replies.set(conversationId, { ...live })
    emit()
  }

  let finished = false
  const onEvent = (event: string, data: Record<string, unknown>) => {
    switch (event) {
      case "start": {
        const assistant = data.assistantMessage as Message
        const items = [assistant, ...(data.userMessage ? [data.userMessage as Message] : [])]
        upsertMessages(queryClient, conversationId, items, assistant.id)
        // Na reconexão, o servidor manda tudo de novo: recomeça do zero.
        update({ assistantId: assistant.id, text: "", parts: [], tool: null, reconnecting: false })
        break
      }
      case "delta":
        update({ text: live.text + String(data.text), tool: null })
        break
      case "part":
        update({ parts: [...live.parts, data as MessagePart] })
        break
      case "image":
        queryClient.setQueryData(["file-url", data.fileId], data.url)
        break
      case "status":
        update({ tool: data as LiveReply["tool"] })
        break
      case "error":
        update({ error: String(data.message ?? "Erro ao gerar a resposta.") })
        break
      case "done": {
        finished = true
        upsertMessages(queryClient, conversationId, [data.message as Message])
        break
      }
    }
  }

  try {
    let request = params.initial
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await streamSse(request, { onEvent }, controller.signal)
        // Terminou, ou não há nada em andamento no servidor (o refetch abaixo mostra o estado final).
        if (finished || result === "empty") break
        throw new ApiError(0, "network_error") // conexão fechada antes do fim
      } catch (error) {
        if (controller.signal.aborted || finished) break
        const code = error instanceof ApiError ? error.code : "network_error"
        // Erro de verdade da API (409, 429, 400…): não adianta reconectar.
        if (code !== "network_error") {
          update({
            status: "error",
            error: errorText[code] ?? "Não foi possível gerar a resposta.",
          })
          return
        }
        if (attempt >= RETRY_DELAYS_MS.length) {
          update({
            status: "error",
            reconnectable: true,
            reconnecting: false,
            error: "A conexão caiu. A resposta continua no servidor: reconecte para ver.",
          })
          return
        }
        update({ reconnecting: true })
        await sleep(RETRY_DELAYS_MS[attempt]!, controller.signal)
        if (controller.signal.aborted) break
        request = { path: `/conversations/${conversationId}/stream`, method: "GET" }
      }
    }
    replies.delete(conversationId)
  } finally {
    controllers.delete(conversationId)
    emit()
    void queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
    void queryClient.invalidateQueries({ queryKey: ["conversations"] })
    void queryClient.invalidateQueries({ queryKey: ["usage-month"] })
    // O título é gerado em background logo depois da primeira resposta.
    const data = queryClient.getQueryData<{ conversation: { title?: string | null } }>(
      conversationKey(conversationId),
    )
    if (data && !data.conversation.title) {
      for (const delay of [3_000, 8_000]) {
        setTimeout(() => {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] })
          void queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
        }, delay)
      }
    }
  }
}

/** Envia, regenera ou continua, e acompanha a resposta em streaming. */
export async function startReply(params: {
  queryClient: QueryClient
  conversationId: string
  path: string
  body: unknown
}) {
  if (isStreaming(params.conversationId)) return
  await follow({
    queryClient: params.queryClient,
    conversationId: params.conversationId,
    initial: { path: params.path, method: "POST", body: params.body },
  })
}

/**
 * Retoma a resposta em andamento no servidor (aba reaberta, conexão que caiu, outro aparelho).
 * Sem nada em andamento, só recarrega a conversa.
 */
export async function resumeReply(queryClient: QueryClient, conversationId: string) {
  if (isStreaming(conversationId)) return
  await follow({
    queryClient,
    conversationId,
    initial: { path: `/conversations/${conversationId}/stream`, method: "GET" },
  })
}

export function clearReplyError(conversationId: string) {
  if (replies.get(conversationId)?.status === "error") {
    replies.delete(conversationId)
    emit()
  }
}
