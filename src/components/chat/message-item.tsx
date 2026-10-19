"use client"

import {
  AlertTriangleIcon,
  AtSignIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FastForwardIcon,
  FileIcon,
  GitBranchPlusIcon,
  Loader2Icon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { Mention } from "@/components/chat/composer"
import { Markdown } from "@/components/chat/markdown"
import {
  Attachment,
  CodeRun,
  CompactedNote,
  ContextUsed,
  GeneratedImage,
  LiveStatus,
  SinapseChip,
  Sources,
  ToolUses,
} from "@/components/chat/message-parts"
import { FEATURED } from "@/components/chat/model-picker"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"
import { speak } from "@/lib/audio"
import type { LiveReply } from "@/lib/chat/live"
import { textOf } from "@/lib/chat/tree"
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format"
import { useModels } from "@/lib/queries"
import type { Message, MessagePart } from "@/lib/types"
import { uploadErrorText, uploadFile } from "@/lib/upload"
import { cn } from "@/lib/utils"

export type EditInput = { text: string; fileIds: string[]; mentions: Mention[] }
type Rating = "up" | "down"

type Props = {
  message: Message
  live?: LiveReply
  versions: { index: number; total: number }
  onVersion: (direction: -1 | 1) => void
  onEdit?: (input: EditInput) => void
  /** Sem modelo = o da conversa; com modelo = "Regenerar com…". */
  onRegenerate?: (model?: string) => void
  onContinue?: () => void
  onFork?: () => void
  onFeedback?: (rating: Rating | null, note?: string) => void
  busy: boolean
}

type Part<T extends MessagePart["type"]> = Extract<MessagePart, { type: T }>

function IconAction({
  label,
  onClick,
  children,
  disabled,
  active,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function VersionNav({
  versions,
  onVersion,
  disabled,
}: Pick<Props, "versions" | "onVersion"> & { disabled: boolean }) {
  if (versions.total < 2) return null
  return (
    <div className="flex items-center text-xs text-muted-foreground tabular-nums">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Versão anterior"
        disabled={disabled || versions.index === 0}
        onClick={() => onVersion(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      {versions.index + 1}/{versions.total}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Próxima versão"
        disabled={disabled || versions.index === versions.total - 1}
        onClick={() => onVersion(1)}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  return {
    copied,
    copy: async (text: string) => {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1_500)
    },
  }
}

function Speak({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle")
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  return (
    <IconAction
      label={state === "playing" ? "Parar leitura" : "Ler em voz alta"}
      disabled={state === "loading"}
      onClick={async () => {
        if (state === "playing") {
          audio.current?.pause()
          setState("idle")
          return
        }
        setState("loading")
        try {
          const url = await speak(text)
          audio.current = new Audio(url)
          audio.current.onended = () => {
            setState("idle")
            URL.revokeObjectURL(url)
          }
          await audio.current.play()
          setState("playing")
        } catch {
          toast.error("Não foi possível ler em voz alta.")
          setState("idle")
        }
      }}
    >
      {state === "loading" ? (
        <Loader2Icon className="animate-spin" />
      ) : state === "playing" ? (
        <SquareIcon />
      ) : (
        <Volume2Icon />
      )}
    </IconAction>
  )
}

/** 👍/👎 (D77): a avaliação salva na hora; o comentário opcional ensina a IA. */
function Feedback({
  rating,
  onFeedback,
}: {
  rating: Rating | null
  onFeedback: NonNullable<Props["onFeedback"]>
}) {
  const [open, setOpen] = useState<Rating | null>(null)
  const [note, setNote] = useState("")

  const button = (value: Rating) => {
    const Icon = value === "up" ? ThumbsUpIcon : ThumbsDownIcon
    const label = value === "up" ? "Gostei" : "Não gostei"
    return (
      <Popover
        open={open === value}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant={rating === value ? "secondary" : "ghost"}
              size="icon-xs"
              aria-label={label}
              aria-pressed={rating === value}
              onClick={() => {
                if (rating === value) {
                  onFeedback(null)
                  return
                }
                onFeedback(value)
                setNote("")
                setOpen(value)
              }}
            />
          }
        >
          <Icon />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (note.trim()) onFeedback(value, note.trim())
              setOpen(null)
            }}
          >
            <label className="text-xs font-medium" htmlFor="feedback-note">
              {value === "up" ? "O que você gostou?" : "O que poderia ser melhor?"}{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Textarea
              id="feedback-note"
              value={note}
              autoFocus
              rows={3}
              placeholder={
                value === "up"
                  ? "Ex.: gostei do formato em tabela"
                  : "Ex.: longo demais, prefiro direto ao ponto"
              }
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Com comentário, a IA guarda a preferência em “Preferências de resposta”.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(null)}>
                Fechar
              </Button>
              <Button type="submit" size="sm" disabled={!note.trim()}>
                Enviar
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <>
      {button("up")}
      {button("down")}
    </>
  )
}

function RegenerateMenu({
  onRegenerate,
  busy,
  current,
}: {
  onRegenerate: NonNullable<Props["onRegenerate"]>
  busy: boolean
  current: string | null
}) {
  const models = useModels("chat")
  const list = models.data?.models ?? []
  const featured = FEATURED.map((id) => list.find((model) => model.id === id)).filter(
    (model) => model !== undefined,
  )
  return (
    <div className="flex items-center">
      <IconAction
        label="Regenerar (cria uma nova versão)"
        disabled={busy}
        onClick={() => onRegenerate()}
      >
        <RefreshCwIcon />
      </IconAction>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="w-4"
              aria-label="Regenerar com outro modelo"
              disabled={busy || !featured.length}
            />
          }
        >
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Regenerar com…</DropdownMenuLabel>
            {featured.map((model) => (
              <DropdownMenuItem key={model.id} onClick={() => onRegenerate(model.id)}>
                {model.displayName ?? model.id}
                {model.id === current && (
                  <span className="ml-auto text-xs text-muted-foreground">atual</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

type EditFile = { id: string; name: string; uploading?: boolean }

function UserMessage({ message, versions, onVersion, onEdit, busy }: Props) {
  const [editing, setEditing] = useState(false)
  const text = textOf(message)
  const files = message.content.filter((part): part is Part<"file"> => part.type === "file")
  const mentions = message.content.filter(
    (part): part is Part<"mention"> => part.type === "mention",
  )
  const [draft, setDraft] = useState(text)
  const [draftFiles, setDraftFiles] = useState<EditFile[]>([])
  const [draftMentions, setDraftMentions] = useState<Mention[]>([])
  const { copied, copy } = useCopy()

  function startEditing() {
    setDraft(text)
    setDraftFiles(files.map((part) => ({ id: part.fileId, name: part.name })))
    setDraftMentions(mentions.map((part) => ({ id: part.sinapseId, title: part.title })))
    setEditing(true)
  }

  function addFiles(list: File[]) {
    for (const file of list) {
      const key = `upload-${Math.random()}`
      setDraftFiles((current) => [...current, { id: key, name: file.name, uploading: true }])
      uploadFile(file, { conversationId: message.conversationId })
        .then((uploaded) =>
          setDraftFiles((current) =>
            current.map((item) => (item.id === key ? { id: uploaded.id, name: item.name } : item)),
          ),
        )
        .catch((error: unknown) => {
          const code = error instanceof ApiError ? error.code : ""
          toast.error(`${file.name}: ${uploadErrorText[code] ?? "Não foi possível enviar."}`)
          setDraftFiles((current) => current.filter((item) => item.id !== key))
        })
    }
  }

  const uploading = draftFiles.some((file) => file.uploading)
  const canSend = (draft.trim() || draftFiles.length > 0) && !busy && !uploading

  function submit() {
    if (!canSend) return
    setEditing(false)
    onEdit?.({
      text: draft.trim(),
      fileIds: draftFiles.map((file) => file.id),
      mentions: draftMentions,
    })
  }

  return (
    <div className="group/message flex flex-col items-end gap-1.5">
      {!editing && files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {files.map((part) => (
            <Attachment key={part.fileId} part={part} />
          ))}
        </div>
      )}
      {!editing && mentions.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {mentions.map((part) => (
            <span
              key={part.sinapseId}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs"
            >
              <AtSignIcon className="size-3 text-primary" /> {part.title}
            </span>
          ))}
        </div>
      )}
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border bg-muted/40 p-2">
          {(draftFiles.length > 0 || draftMentions.length > 0) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {draftMentions.map((mention) => (
                <span
                  key={mention.id}
                  className="inline-flex items-center gap-1 rounded-lg border bg-background py-0.5 pr-1 pl-2 text-xs"
                >
                  <AtSignIcon className="size-3 text-primary" />
                  <span className="max-w-40 truncate">{mention.title}</span>
                  <button
                    type="button"
                    aria-label={`Remover menção a ${mention.title}`}
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() =>
                      setDraftMentions((list) => list.filter((item) => item.id !== mention.id))
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
              {draftFiles.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-1 rounded-lg border bg-background py-0.5 pr-1 pl-2 text-xs"
                >
                  {file.uploading ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <FileIcon className="size-3" />
                  )}
                  <span className="max-w-40 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${file.name}`}
                    className="rounded p-0.5 hover:bg-muted"
                    onClick={() =>
                      setDraftFiles((list) => list.filter((item) => item.id !== file.id))
                    }
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault()
                submit()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setEditing(false)
              }
            }}
            className="min-h-20 w-full resize-y bg-transparent p-1 text-sm outline-none"
            aria-label="Editar mensagem"
          />
          <div className="flex items-center justify-end gap-2">
            <label className="mr-auto">
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  addFiles([...(event.target.files ?? [])])
                  event.target.value = ""
                }}
              />
              <span className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
                <PaperclipIcon className="size-4" />
                <span className="sr-only">Anexar arquivo</span>
              </span>
            </label>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Ctrl+Enter envia · Esc cancela
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={!canSend} onClick={submit}>
              Enviar
            </Button>
          </div>
        </div>
      ) : (
        text && (
          <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap">
            {text}
          </div>
        )
      )}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 max-md:opacity-100">
        <VersionNav versions={versions} onVersion={onVersion} disabled={busy} />
        {text && (
          <IconAction label="Copiar" onClick={() => copy(text)}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconAction>
        )}
        {onEdit && !editing && (
          <IconAction label="Editar (cria uma nova versão)" disabled={busy} onClick={startEditing}>
            <PencilIcon />
          </IconAction>
        )}
      </div>
    </div>
  )
}

function AssistantMessage({
  message,
  live,
  versions,
  onVersion,
  onRegenerate,
  onContinue,
  onFork,
  onFeedback,
  busy,
}: Props) {
  const isLive = live && live.assistantId === message.id
  const text = isLive ? live.text : textOf(message)
  const parts = isLive ? live.parts : message.content
  const { copied, copy } = useCopy()

  const images = parts.filter((part) => part.type === "image")
  const generatedFiles = parts.filter((part): part is Part<"file"> => part.type === "file")
  const codeRuns = parts.filter((part): part is Part<"code"> => part.type === "code")
  const sources = parts.find((part) => part.type === "sources")
  const chips = parts.filter((part) => part.type === "sinapse")
  const context = parts.find((part) => part.type === "context")
  const compacted = parts.find((part): part is Part<"compacted"> => part.type === "compacted")
  const tools = parts.filter((part) => part.type === "tool")
  const streaming = isLive && live.status === "streaming"
  const status = isLive ? null : message.status
  const continuable = !!onContinue && !!text && (status === "stopped" || status === "incomplete")

  return (
    <div className="group/message flex flex-col gap-2">
      {compacted && <CompactedNote part={compacted} />}
      {context && <ContextUsed part={context} />}
      {tools.length > 0 && <ToolUses parts={tools} />}
      {codeRuns.map((part, index) => (
        <CodeRun key={index} part={part} />
      ))}
      {text ? (
        <Markdown text={text} />
      ) : streaming && !live.tool ? (
        <div className="flex gap-1 py-2" aria-label="Gerando resposta">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
              style={{ animationDelay: `${dot * 120}ms` }}
            />
          ))}
        </div>
      ) : null}
      {streaming && live.tool && <LiveStatus tool={live.tool} />}
      {streaming && live.reconnecting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" /> Reconectando…
        </div>
      )}
      {images.map((part) => (
        <GeneratedImage key={part.fileId} part={part} />
      ))}
      {generatedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {generatedFiles.map((part) => (
            <Attachment key={part.fileId} part={part} />
          ))}
        </div>
      )}
      {sources && <Sources part={sources} />}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((part, index) => (
            <SinapseChip key={`${part.sinapseId}-${index}`} part={part} />
          ))}
        </div>
      )}
      {(status === "stopped" ||
        status === "error" ||
        status === "incomplete" ||
        (isLive && live.error)) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangleIcon className="size-3.5" />
          {status === "stopped"
            ? "Resposta interrompida."
            : (live?.error ?? message.error ?? "Erro ao gerar a resposta.")}
          {continuable && (
            <Button variant="outline" size="xs" disabled={busy} onClick={onContinue}>
              <FastForwardIcon /> Continuar
            </Button>
          )}
        </div>
      )}
      {!streaming && (
        <div className="flex flex-wrap items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <VersionNav versions={versions} onVersion={onVersion} disabled={busy} />
          {text && (
            <IconAction label="Copiar" onClick={() => copy(text)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconAction>
          )}
          {text && <Speak text={text} />}
          {onFeedback && status !== "error" && (
            <Feedback rating={message.rating} onFeedback={onFeedback} />
          )}
          {onRegenerate && (
            <RegenerateMenu onRegenerate={onRegenerate} busy={busy} current={message.model} />
          )}
          {onFork && (
            <IconAction label="Abrir em nova conversa" disabled={busy} onClick={onFork}>
              <GitBranchPlusIcon />
            </IconAction>
          )}
          {message.model && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="ml-1 cursor-default text-xs text-muted-foreground tabular-nums" />
                }
              >
                {message.model}
                {message.costUsd ? ` · ${formatUsd(message.costUsd)}` : ""}
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                <div>{formatDateTime(message.createdAt)}</div>
                <div>
                  {formatNumber(message.tokensIn ?? 0)} tokens de entrada (
                  {formatNumber(message.tokensCached ?? 0)} em cache)
                </div>
                <div>
                  {formatNumber(message.tokensOut ?? 0)} de saída
                  {message.tokensReasoning
                    ? ` (${formatNumber(message.tokensReasoning)} de raciocínio)`
                    : ""}
                </div>
                {message.contextTokens ? (
                  <div>Contexto: {formatNumber(message.contextTokens)} tokens</div>
                ) : null}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

export const MessageItem = memo(function MessageItem(props: Props) {
  return (
    <div
      className={cn("w-full", props.message.role === "user" ? "pt-2" : "")}
      data-role={props.message.role}
    >
      {props.message.role === "user" ? <UserMessage {...props} /> : <AssistantMessage {...props} />}
    </div>
  )
})
