"use client"

import { useQueryClient } from "@tanstack/react-query"
import { AudioLinesIcon, EyeOffIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Composer,
  type ComposerHandle,
  type ComposerOptions,
  type ComposerSubmit,
} from "@/components/chat/composer"
import { MessageItem } from "@/components/chat/message-item"
import { VoiceMode } from "@/components/chat/voice-mode"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, unwrap } from "@/lib/api"
import { clearReplyError, isStreaming, startReply, stopReply, useLiveReply } from "@/lib/chat/live"
import { branch, buildTree, latestLeaf, siblings } from "@/lib/chat/tree"
import { formatUsd } from "@/lib/format"
import { useConversation, useSettings, useUpdateConversation } from "@/lib/queries"
import type { Message } from "@/lib/types"

const suggestions = [
  "O que você já sabe sobre mim?",
  "Me ajude a organizar minhas ideias de projeto",
  "Resuma um artigo para mim",
  "Crie um plano de estudos",
]

/**
 * Texto digitado enquanto a conversa nova era criada. A troca de URL remonta a tela; sem
 * isso, o rascunho sumiria. Lido no primeiro render e apagado depois (seguro no StrictMode).
 */
const carriedDrafts = new Map<string, string>()

export function ChatView({ conversationId }: { conversationId: string | null }) {
  const [initialText] = useState(() => (conversationId && carriedDrafts.get(conversationId)) || "")
  useEffect(() => {
    if (conversationId) carriedDrafts.delete(conversationId)
  }, [conversationId])
  const router = useRouter()
  const queryClient = useQueryClient()
  const settings = useSettings()
  const conversation = useConversation(conversationId)
  const updateConversation = useUpdateConversation()
  // Conversa criada aqui mesmo, antes de a URL mudar: o streaming dela já vale para esta tela.
  const [createdId, setCreatedId] = useState<string | null>(null)
  const activeId = conversationId ?? createdId
  const live = useLiveReply(activeId)
  // Criando a conversa (POST /conversations): ainda não há streaming, mas já está ocupado.
  const creating = useRef(false)
  const [isCreating, setIsCreating] = useState(false)
  const composer = useRef<ComposerHandle>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [dragging, setDragging] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [draftOptions, setDraftOptions] = useState<Partial<ComposerOptions>>({})
  const [anonymous, setAnonymous] = useState(false)

  const data = conversation.data
  const tree = useMemo(() => buildTree(data?.messages ?? []), [data?.messages])
  const visible = useMemo(
    () => branch(tree, data?.conversation.currentLeafMessageId ?? null),
    [tree, data?.conversation.currentLeafMessageId],
  )
  const streaming = live?.status === "streaming"

  const convSettings = (data?.conversation.settings ?? {}) as Partial<ComposerOptions>
  const options: ComposerOptions = {
    model:
      draftOptions.model ??
      data?.conversation.model ??
      settings.data?.settings.chatDefaultModel ??
      "gpt-6-sol",
    reasoningEffort:
      draftOptions.reasoningEffort ??
      convSettings.reasoningEffort ??
      settings.data?.settings.chatReasoningEffort ??
      "auto",
    webSearch: draftOptions.webSearch ?? convSettings.webSearch ?? false,
    imageGeneration: draftOptions.imageGeneration ?? convSettings.imageGeneration ?? false,
  }

  function changeOptions(patch: Partial<ComposerOptions>) {
    setDraftOptions((current) => ({ ...current, ...patch }))
    if (!conversationId) return
    const { model, ...rest } = patch
    updateConversation.mutate({
      id: conversationId,
      ...(model ? { model } : {}),
      ...(Object.keys(rest).length ? { settings: rest } : {}),
    })
  }

  // Rola junto com a resposta, a menos que o usuário tenha subido para ler.
  useEffect(() => {
    const element = scroller.current
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight
  }, [visible.length, live?.text, live?.parts.length])

  const send = useCallback(
    async ({ text, files }: ComposerSubmit, parentOverride?: string | null) => {
      const replyOptions = {
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        webSearch: options.webSearch,
        imageGeneration: options.imageGeneration,
      }
      let id = activeId
      if (!id) {
        creating.current = true
        setIsCreating(true)
        try {
          const created = await unwrap(
            api.POST("/conversations", {
              body: {
                model: options.model,
                anonymous,
                settings: {
                  reasoningEffort: options.reasoningEffort,
                  webSearch: options.webSearch,
                  imageGeneration: options.imageGeneration,
                },
              },
            }),
          )
          id = created.id
          queryClient.setQueryData(["conversation", id], { conversation: created, messages: [] })
          setCreatedId(id)
          const draft = composer.current?.getText()
          if (draft) carriedDrafts.set(id, draft)
          router.replace(`/c/${id}`)
        } catch {
          toast.error("Não foi possível criar a conversa.")
          composer.current?.setText(text)
          return
        } finally {
          creating.current = false
          setIsCreating(false)
        }
      }
      stickToBottom.current = true
      const parentId = parentOverride !== undefined ? parentOverride : (visible.at(-1)?.id ?? null)
      void startReply({
        queryClient,
        conversationId: id,
        path: `/conversations/${id}/messages`,
        body: { parentId, text, fileIds: files.map((file) => file.id), ...replyOptions },
      })
    },
    [
      activeId,
      anonymous,
      options.imageGeneration,
      options.model,
      options.reasoningEffort,
      options.webSearch,
      queryClient,
      router,
      visible,
    ],
  )

  /**
   * Uma mensagem por vez: enquanto a conversa é criada ou a resposta chega, recusa o envio
   * (o composer mantém o texto). Confere o estado na hora, sem esperar o próximo render.
   */
  function trySend(input: ComposerSubmit, parentOverride?: string | null) {
    if (creating.current || (activeId && isStreaming(activeId))) return false
    void send(input, parentOverride)
    return true
  }

  function regenerate(message: Message) {
    if (!conversationId) return
    stickToBottom.current = true
    void startReply({
      queryClient,
      conversationId,
      path: `/conversations/${conversationId}/messages/${message.id}/regenerate`,
      body: {
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        webSearch: options.webSearch,
        imageGeneration: options.imageGeneration,
      },
    })
  }

  async function switchVersion(message: Message, direction: -1 | 1) {
    if (!conversationId) return
    const { list, index } = siblings(tree, message)
    const target = list[index + direction]
    if (!target) return
    const leaf = latestLeaf(tree, target.id)
    queryClient.setQueryData(["conversation", conversationId], (old: typeof data) =>
      old ? { ...old, conversation: { ...old.conversation, currentLeafMessageId: leaf } } : old,
    )
    await unwrap(
      api.PUT("/conversations/{id}/leaf", {
        params: { path: { id: conversationId } },
        body: { messageId: target.id },
      }),
    )
  }

  const totalCost = (data?.messages ?? []).reduce((sum, message) => sum + (message.costUsd ?? 0), 0)

  if (conversationId && conversation.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (conversationId && conversation.isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Conversa não encontrada.
      </div>
    )
  }

  const isAnonymous = data?.conversation.anonymous ?? anonymous
  const empty = visible.length === 0

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        composer.current?.addFiles([...event.dataTransfer.files])
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/80 text-sm font-medium">
          Solte para anexar
        </div>
      )}

      {data && (
        <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
          <h1 className="truncate font-medium">{data.conversation.title ?? "Nova conversa"}</h1>
          {isAnonymous && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3" /> anônima
            </span>
          )}
          {totalCost > 0 && (
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
              {formatUsd(totalCost)}
            </span>
          )}
        </div>
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
      >
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
            <h1 className="text-2xl font-semibold">Como posso ajudar?</h1>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-xl border px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  disabled={isCreating || streaming}
                  onClick={() => trySend({ text: suggestion, files: [] })}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
            {visible.map((message) => {
              const { list, index } = siblings(tree, message)
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  live={live?.assistantId === message.id ? live : undefined}
                  versions={{ index, total: list.length }}
                  onVersion={(direction) => void switchVersion(message, direction)}
                  busy={streaming}
                  onEdit={
                    message.role === "user"
                      ? (text) => {
                          const files = message.content.flatMap((part) =>
                            part.type === "file"
                              ? [{ id: part.fileId } as ComposerSubmit["files"][number]]
                              : [],
                          )
                          trySend({ text, files }, message.parentId)
                        }
                      : undefined
                  }
                  onRegenerate={
                    message.role === "assistant" ? () => regenerate(message) : undefined
                  }
                />
              )
            })}
            {live?.status === "error" && !live.assistantId && (
              <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {live.error}
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => conversationId && clearReplyError(conversationId)}
                >
                  ok
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Composer
          ref={composer}
          conversationId={conversationId}
          options={options}
          onOptionsChange={changeOptions}
          onSubmit={(input) => trySend(input)}
          onStop={() => activeId && stopReply(activeId)}
          streaming={streaming}
          disabled={isCreating}
          initialText={initialText}
          autoFocus
          extraActions={
            conversationId ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Modo voz"
                      onClick={() => setVoiceOpen(true)}
                    />
                  }
                >
                  <AudioLinesIcon />
                </TooltipTrigger>
                <TooltipContent>Modo voz</TooltipContent>
              </Tooltip>
            ) : null
          }
        />
        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {!conversationId ? (
            <label className="flex cursor-pointer items-center gap-2">
              <Switch
                checked={anonymous}
                onCheckedChange={setAnonymous}
                aria-label="Conversa anônima"
              />
              Conversa anônima (sem memória)
            </label>
          ) : (
            <span>A IA pode errar. Confira informações importantes.</span>
          )}
        </div>
      </div>

      {conversationId && voiceOpen && (
        <VoiceMode
          conversationId={conversationId}
          open={voiceOpen}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </div>
  )
}
