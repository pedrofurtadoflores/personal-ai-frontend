"use client"

import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowDownIcon,
  AudioLinesIcon,
  EyeOffIcon,
  FolderIcon,
  Loader2Icon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  clearDraft,
  Composer,
  type ComposerHandle,
  type ComposerOptions,
  type Mention,
} from "@/components/chat/composer"
import { ConversationSettingsDialog } from "@/components/chat/conversation-settings"
import { MessageItem, type EditInput } from "@/components/chat/message-item"
import { VoiceMode } from "@/components/chat/voice-mode"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api, unwrap } from "@/lib/api"
import {
  clearReplyError,
  isStreaming,
  resumeReply,
  startReply,
  stopReply,
  useLiveReply,
} from "@/lib/chat/live"
import { branch, buildTree, latestLeaf, siblings } from "@/lib/chat/tree"
import { formatNumber, formatUsd } from "@/lib/format"
import {
  useChatSuggestions,
  useConversation,
  useFolders,
  useModels,
  useSettings,
  useUpdateConversation,
} from "@/lib/queries"
import type { Message } from "@/lib/types"
import { cn } from "@/lib/utils"

const fallbackSuggestions = [
  "O que você já sabe sobre mim?",
  "Me ajude a organizar minhas ideias de projeto",
  "Resuma um artigo para mim",
  "Crie um plano de estudos",
]

type SendInput = { text: string; fileIds: string[]; mentions: Mention[] }
type ConversationData = {
  conversation: { currentLeafMessageId: string | null }
  messages: Message[]
}

/**
 * Texto digitado enquanto a conversa nova era criada. A troca de URL remonta a tela; sem
 * isso, o rascunho sumiria. Lido no primeiro render e apagado depois (seguro no StrictMode).
 */
const carriedDrafts = new Map<string, string>()

/** Uso do contexto na última resposta, contra o teto (D67). */
function ContextMeter({
  used,
  budget,
  compacted,
}: {
  used: number
  budget: number
  compacted: boolean
}) {
  const ratio = Math.min(used / budget, 1)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="flex cursor-default items-center gap-1.5 text-xs text-muted-foreground tabular-nums"
            aria-label={`Contexto: ${Math.round(ratio * 100)}% do teto`}
          />
        }
      >
        <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-muted">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              ratio > 0.75 ? "bg-amber-500" : "bg-primary/70",
            )}
            style={{ width: `${Math.max(ratio * 100, 4)}%` }}
          />
        </span>
        {Math.round(ratio * 100)}%
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        Contexto da última resposta: {formatNumber(used)} de {formatNumber(budget)} tokens.
        {compacted
          ? " O começo da conversa já está entrando como resumo."
          : " Passando do teto, o começo da conversa vira um resumo (as mensagens continuam salvas)."}
      </TooltipContent>
    </Tooltip>
  )
}

export function ChatView({
  conversationId,
  folderId = null,
}: {
  conversationId: string | null
  /** Conversa nova dentro de um projeto (D73). */
  folderId?: string | null
}) {
  const [initialText] = useState(() => (conversationId && carriedDrafts.get(conversationId)) || "")
  useEffect(() => {
    if (conversationId) carriedDrafts.delete(conversationId)
  }, [conversationId])
  const router = useRouter()
  const queryClient = useQueryClient()
  const settings = useSettings()
  const models = useModels("chat")
  const folders = useFolders()
  const suggestions = useChatSuggestions()
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
  const [atBottom, setAtBottom] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftOptions, setDraftOptions] = useState<Partial<ComposerOptions>>({})
  const [anonymous, setAnonymous] = useState(false)

  const newDraftKey = folderId ? `new:${folderId}` : "new"
  const data = conversation.data
  const tree = useMemo(() => buildTree(data?.messages ?? []), [data?.messages])
  const visible = useMemo(
    () => branch(tree, data?.conversation.currentLeafMessageId ?? null),
    [tree, data?.conversation.currentLeafMessageId],
  )
  const streaming = live?.status === "streaming"
  const projectId = data?.conversation.folderId ?? folderId
  const project = (folders.data ?? []).find((folder) => folder.id === projectId)

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
    codeInterpreter: draftOptions.codeInterpreter ?? convSettings.codeInterpreter ?? false,
  }
  const replyOptions = {
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    webSearch: options.webSearch,
    imageGeneration: options.imageGeneration,
    codeInterpreter: options.codeInterpreter,
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

  // D68: resposta em andamento no servidor (aba reaberta, outro aparelho) → retoma.
  const hasStreamingMessage = visible.some((message) => message.status === "streaming")
  useEffect(() => {
    if (conversationId && hasStreamingMessage && !live)
      void resumeReply(queryClient, conversationId)
  }, [conversationId, hasStreamingMessage, live, queryClient])

  // Conexão caiu de vez: tenta de novo ao voltar para a aba ou quando a rede volta.
  useEffect(() => {
    if (!activeId || !live?.reconnectable) return
    const retry = () => {
      if (document.visibilityState !== "visible") return
      clearReplyError(activeId)
      void resumeReply(queryClient, activeId)
    }
    window.addEventListener("online", retry)
    document.addEventListener("visibilitychange", retry)
    return () => {
      window.removeEventListener("online", retry)
      document.removeEventListener("visibilitychange", retry)
    }
  }, [activeId, live?.reconnectable, queryClient])

  const send = useCallback(
    async ({ text, fileIds, mentions }: SendInput, parentOverride?: string | null) => {
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
                ...(folderId ? { folderId } : {}),
                settings: {
                  reasoningEffort: options.reasoningEffort,
                  webSearch: options.webSearch,
                  imageGeneration: options.imageGeneration,
                  codeInterpreter: options.codeInterpreter,
                },
              },
            }),
          )
          id = created.id
          queryClient.setQueryData(["conversation", id], { conversation: created, messages: [] })
          setCreatedId(id)
          const draft = composer.current?.getText()
          if (draft) carriedDrafts.set(id, draft)
          // O texto segue com a conversa nova; não pode ficar também no rascunho da tela inicial.
          clearDraft(newDraftKey)
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
        body: {
          parentId,
          text,
          fileIds,
          sinapseIds: mentions.map((mention) => mention.id),
          ...replyOptions,
        },
      })
    },
    // replyOptions é derivado de `options` (já nas dependências pelos campos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeId,
      anonymous,
      folderId,
      newDraftKey,
      options.codeInterpreter,
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
  function trySend(input: SendInput, parentOverride?: string | null) {
    if (creating.current || (activeId && isStreaming(activeId))) return false
    void send(input, parentOverride)
    return true
  }

  function regenerate(message: Message, model?: string) {
    if (!conversationId) return
    stickToBottom.current = true
    void startReply({
      queryClient,
      conversationId,
      path: `/conversations/${conversationId}/messages/${message.id}/regenerate`,
      body: { ...replyOptions, ...(model ? { model } : {}) },
    })
  }

  function continueReply(message: Message) {
    if (!conversationId) return
    stickToBottom.current = true
    void startReply({
      queryClient,
      conversationId,
      path: `/conversations/${conversationId}/messages/${message.id}/continue`,
      body: {},
    })
  }

  async function fork(message: Message) {
    if (!conversationId) return
    try {
      const created = await unwrap(
        api.POST("/conversations/{id}/fork", {
          params: { path: { id: conversationId } },
          body: { messageId: message.id },
        }),
      )
      void queryClient.invalidateQueries({ queryKey: ["conversations"] })
      router.push(`/c/${created.id}`)
    } catch {
      toast.error("Não foi possível abrir em nova conversa.")
    }
  }

  async function feedback(message: Message, rating: "up" | "down" | null, note?: string) {
    if (!conversationId) return
    try {
      const saved = await unwrap(
        api.PUT("/conversations/{id}/messages/{messageId}/feedback", {
          params: { path: { id: conversationId, messageId: message.id } },
          body: { rating, ...(note ? { note } : {}) },
        }),
      )
      queryClient.setQueryData<ConversationData>(["conversation", conversationId], (old) =>
        old
          ? { ...old, messages: old.messages.map((item) => (item.id === saved.id ? saved : item)) }
          : old,
      )
      if (note) toast.success("Obrigado! A IA vai levar isso em conta.")
    } catch {
      toast.error("Não foi possível salvar a avaliação.")
    }
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

  function scrollToBottom() {
    const element = scroller.current
    if (!element) return
    stickToBottom.current = true
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }

  const totalCost = (data?.messages ?? []).reduce((sum, message) => sum + (message.costUsd ?? 0), 0)

  // Medidor de contexto: última resposta com o número real, contra o teto efetivo.
  const lastMeasured = visible.findLast(
    (message) => message.role === "assistant" && (message.contextTokens ?? 0) > 0,
  )
  const contextWindow = (models.data?.models ?? []).find(
    (model) => model.id === options.model,
  )?.contextWindow
  const configuredBudget = settings.data?.settings.contextBudgetTokens ?? 60_000
  const budget = contextWindow
    ? Math.min(configuredBudget, Math.floor(contextWindow * 0.75))
    : configuredBudget
  const compacted = !!lastMeasured?.content.some((part) => part.type === "compacted")

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
  const homeSuggestions = suggestions.data?.suggestions ?? fallbackSuggestions

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
          {project && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <FolderIcon className="size-3" /> {project.name}
            </span>
          )}
          {isAnonymous && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3" /> anônima
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {lastMeasured?.contextTokens ? (
              <ContextMeter
                used={lastMeasured.contextTokens}
                budget={budget}
                compacted={compacted}
              />
            ) : null}
            {totalCost > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatUsd(totalCost)}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Configurar conversa"
                    onClick={() => setSettingsOpen(true)}
                  />
                }
              >
                <SlidersHorizontalIcon />
              </TooltipTrigger>
              <TooltipContent>Instruções e temperatura desta conversa</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget
          const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80
          stickToBottom.current = bottom
          if (bottom !== atBottom) setAtBottom(bottom)
        }}
      >
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
            <h1 className="text-2xl font-semibold">Como posso ajudar?</h1>
            {project && (
              <p className="-mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                <FolderIcon className="size-4" /> No projeto {project.name}
              </p>
            )}
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {homeSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="rounded-xl border px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  disabled={isCreating || streaming}
                  onClick={() => trySend({ text: suggestion, fileIds: [], mentions: [] })}
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
                      ? (input: EditInput) => trySend(input, message.parentId)
                      : undefined
                  }
                  onRegenerate={
                    message.role === "assistant"
                      ? (model?: string) => regenerate(message, model)
                      : undefined
                  }
                  onContinue={
                    message.role === "assistant" ? () => continueReply(message) : undefined
                  }
                  onFork={message.role === "assistant" ? () => void fork(message) : undefined}
                  onFeedback={
                    message.role === "assistant"
                      ? (rating, note) => void feedback(message, rating, note)
                      : undefined
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
                  onClick={() => activeId && clearReplyError(activeId)}
                >
                  ok
                </Button>
              </div>
            )}
            {live?.status === "error" && live.reconnectable && activeId && (
              <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
                {live.error}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    clearReplyError(activeId)
                    void resumeReply(queryClient, activeId)
                  }}
                >
                  <RefreshCwIcon /> Reconectar
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-4">
        {!atBottom && !empty && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Ir para o fim"
            className="absolute -top-11 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-sm"
            onClick={scrollToBottom}
          >
            <ArrowDownIcon />
          </Button>
        )}
        <Composer
          ref={composer}
          conversationId={conversationId}
          options={options}
          onOptionsChange={changeOptions}
          onSubmit={(input) =>
            trySend({
              text: input.text,
              fileIds: input.files.map((file) => file.id),
              mentions: input.mentions,
            })
          }
          onStop={() => activeId && void stopReply(activeId)}
          streaming={streaming}
          disabled={isCreating}
          initialText={initialText}
          draftKey={conversationId ?? newDraftKey}
          anonymous={isAnonymous}
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
      {data && settingsOpen && (
        <ConversationSettingsDialog
          conversation={data.conversation}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
