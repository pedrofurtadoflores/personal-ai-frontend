import type { QueryClient } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { ApiError } from "@/lib/api"
import { streamSse } from "@/lib/chat/stream"
import type { Message, MessagePart } from "@/lib/types"

/**
 * Respostas em andamento, guardadas fora dos componentes: trocar de página (ex.: a conversa
 * nova que acabou de ganhar URL) não interrompe o streaming.
 */
export type LiveReply = {
  conversationId: string
  assistantId: string | null
  text: string
  parts: MessagePart[]
  status: "streaming" | "error"
  tool: { tool: string; state: string } | null
  error: string | null
}

type ConversationData = {
  conversation: { currentLeafMessageId: string | null }
  messages: Message[]
}

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

export function stopReply(conversationId: string) {
  controllers.get(conversationId)?.abort()
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
}

/** Envia (ou regenera) e acompanha a resposta em streaming. */
export async function startReply(params: {
  queryClient: QueryClient
  conversationId: string
  path: string
  body: unknown
}) {
  const { queryClient, conversationId } = params
  if (isStreaming(conversationId)) return

  const live: LiveReply = {
    conversationId,
    assistantId: null,
    text: "",
    parts: [],
    status: "streaming",
    tool: null,
    error: null,
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

  try {
    await streamSse(
      params.path,
      params.body,
      {
        onEvent(event, data) {
          switch (event) {
            case "start": {
              const assistant = data.assistantMessage as Message
              const items = [assistant, ...(data.userMessage ? [data.userMessage as Message] : [])]
              upsertMessages(queryClient, conversationId, items, assistant.id)
              update({ assistantId: assistant.id })
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
              const message = data.message as Message
              upsertMessages(queryClient, conversationId, [message])
              break
            }
          }
        },
      },
      controller.signal,
    )
    replies.delete(conversationId)
  } catch (error) {
    if (controller.signal.aborted) {
      // O backend salva o parcial como "stopped"; recarrega para mostrar o que ficou.
      replies.delete(conversationId)
    } else {
      const code = error instanceof ApiError ? error.code : "network_error"
      update({ status: "error", error: errorText[code] ?? "Não foi possível gerar a resposta." })
    }
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

export function clearReplyError(conversationId: string) {
  if (replies.get(conversationId)?.status === "error") {
    replies.delete(conversationId)
    emit()
  }
}
