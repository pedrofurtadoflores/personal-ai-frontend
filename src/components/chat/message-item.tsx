"use client"

import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
  Volume2Icon,
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Markdown } from "@/components/chat/markdown"
import {
  Attachment,
  ContextUsed,
  GeneratedImage,
  LiveStatus,
  SinapseChip,
  Sources,
  ToolUses,
} from "@/components/chat/message-parts"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { speak } from "@/lib/audio"
import type { LiveReply } from "@/lib/chat/live"
import { textOf } from "@/lib/chat/tree"
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format"
import type { Message, MessagePart } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  message: Message
  live?: LiveReply
  versions: { index: number; total: number }
  onVersion: (direction: -1 | 1) => void
  onEdit?: (text: string) => void
  onRegenerate?: () => void
  busy: boolean
}

function IconAction({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
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

function UserMessage({ message, versions, onVersion, onEdit, busy }: Props) {
  const [editing, setEditing] = useState(false)
  const text = textOf(message)
  const [draft, setDraft] = useState(text)
  const { copied, copy } = useCopy()
  const files = message.content.filter(
    (part): part is Extract<MessagePart, { type: "file" }> => part.type === "file",
  )

  return (
    <div className="group/message flex flex-col items-end gap-1.5">
      {files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {files.map((part) => (
            <Attachment key={part.fileId} part={part} />
          ))}
        </div>
      )}
      {editing ? (
        <div className="w-full max-w-[85%] rounded-2xl border bg-muted/40 p-2">
          <textarea
            value={draft}
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-20 w-full resize-y bg-transparent p-1 text-sm outline-none"
            aria-label="Editar mensagem"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!draft.trim() || busy}
              onClick={() => {
                setEditing(false)
                onEdit?.(draft.trim())
              }}
            >
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
        {onEdit && (
          <IconAction
            label="Editar (cria uma nova versão)"
            disabled={busy}
            onClick={() => {
              setDraft(text)
              setEditing(true)
            }}
          >
            <PencilIcon />
          </IconAction>
        )}
      </div>
    </div>
  )
}

function AssistantMessage({ message, live, versions, onVersion, onRegenerate, busy }: Props) {
  const isLive = live && live.assistantId === message.id
  const text = isLive ? live.text : textOf(message)
  const parts = isLive ? live.parts : message.content
  const { copied, copy } = useCopy()

  const images = parts.filter((part) => part.type === "image")
  const sources = parts.find((part) => part.type === "sources")
  const chips = parts.filter((part) => part.type === "sinapse")
  const context = parts.find((part) => part.type === "context")
  const tools = parts.filter((part) => part.type === "tool")
  const streaming = isLive && live.status === "streaming"
  const status = isLive ? null : message.status

  return (
    <div className="group/message flex flex-col gap-2">
      {context && <ContextUsed part={context} />}
      {tools.length > 0 && <ToolUses parts={tools} />}
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
      {images.map((part) => (
        <GeneratedImage key={part.fileId} part={part} />
      ))}
      {sources && <Sources part={sources} />}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((part, index) => (
            <SinapseChip key={`${part.sinapseId}-${index}`} part={part} />
          ))}
        </div>
      )}
      {(status === "stopped" || status === "error" || (isLive && live.error)) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangleIcon className="size-3.5" />
          {status === "stopped"
            ? "Resposta interrompida."
            : (live?.error ?? message.error ?? "Erro ao gerar a resposta.")}
        </div>
      )}
      {!streaming && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 max-md:opacity-100">
          <VersionNav versions={versions} onVersion={onVersion} disabled={busy} />
          {text && (
            <IconAction label="Copiar" onClick={() => copy(text)}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </IconAction>
          )}
          {text && <Speak text={text} />}
          {onRegenerate && (
            <IconAction
              label="Regenerar (cria uma nova versão)"
              disabled={busy}
              onClick={onRegenerate}
            >
              <RefreshCwIcon />
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
