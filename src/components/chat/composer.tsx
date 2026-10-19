"use client"

import {
  ArrowUpIcon,
  AtSignIcon,
  BrainIcon,
  FileIcon,
  GlobeIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  PaperclipIcon,
  SquareIcon,
  SquareTerminalIcon,
  XIcon,
} from "lucide-react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { toast } from "sonner"
import { ModelPicker } from "@/components/chat/model-picker"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toggle } from "@/components/ui/toggle"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ApiError } from "@/lib/api"
import { startRecording, transcribe } from "@/lib/audio"
import { useSettings, useSinapses } from "@/lib/queries"
import type { FileItem } from "@/lib/types"
import { uploadErrorText, uploadFile } from "@/lib/upload"
import { cn } from "@/lib/utils"

export type ComposerOptions = {
  model: string
  reasoningEffort: string
  webSearch: boolean
  imageGeneration: boolean
  codeInterpreter: boolean
}

export type Mention = { id: string; title: string }
export type ComposerSubmit = { text: string; files: FileItem[]; mentions: Mention[] }

type Pending = {
  key: string
  name: string
  progress: number
  file?: FileItem
  error?: string
  preview?: string
}

type MenuItem = { key: string; label: string; detail?: string; apply: () => void }

const efforts = [
  ["auto", "Automático"],
  ["none", "Sem raciocínio"],
  ["low", "Baixo"],
  ["medium", "Médio"],
  ["high", "Alto"],
  ["xhigh", "Máximo"],
] as const

const DRAFT_PREFIX = "personal-ai.draft."

/** Rascunho por conversa no localStorage (some no envio). Falhas de storage são ignoradas. */
function readDraft(key: string | undefined) {
  if (!key) return ""
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) ?? ""
  } catch {
    return ""
  }
}

/** Apaga o rascunho (ex.: o texto foi levado para a conversa recém-criada). */
export const clearDraft = (key: string) => writeDraft(key, "")

function writeDraft(key: string | undefined, text: string) {
  if (!key) return
  try {
    if (text.trim()) localStorage.setItem(DRAFT_PREFIX + key, text)
    else localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {}
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

export type ComposerHandle = {
  addFiles: (files: File[]) => void
  focus: () => void
  getText: () => string
  setText: (text: string) => void
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    conversationId: string | null
    options: ComposerOptions
    onOptionsChange: (options: Partial<ComposerOptions>) => void
    /** Devolve `false` se o envio foi recusado (o texto e os anexos ficam no composer). */
    onSubmit: (input: ComposerSubmit) => boolean
    onStop: () => void
    streaming: boolean
    disabled?: boolean
    autoFocus?: boolean
    initialText?: string
    /** Chave do rascunho salvo (por conversa). */
    draftKey?: string
    /** Conversa anônima: sem @menção de sinapses. */
    anonymous?: boolean
    extraActions?: React.ReactNode
  }
>(function Composer(props, ref) {
  const { options, onOptionsChange, streaming, draftKey } = props
  const [text, setText] = useState(() => props.initialText || readDraft(draftKey))
  const [pending, setPending] = useState<Pending[]>([])
  const [mentions, setMentions] = useState<Mention[]>([])
  const [recording, setRecording] = useState<null | "recording" | "transcribing">(null)
  const [caret, setCaret] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [menuDismissedAt, setMenuDismissedAt] = useState<string | null>(null)
  const recorder = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const settings = useSettings()
  const sinapses = useSinapses()

  // Altura automática até ~10 linhas.
  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 260)}px`
  }, [text])

  useEffect(() => writeDraft(draftKey, text), [draftKey, text])

  const addFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        const key = `${file.name}-${file.size}-${Math.random()}`
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined
        setPending((list) => [...list, { key, name: file.name, progress: 0, preview }])
        uploadFile(file, {
          conversationId: props.conversationId,
          onProgress: (progress) =>
            setPending((list) =>
              list.map((item) => (item.key === key ? { ...item, progress } : item)),
            ),
        })
          .then((uploaded) =>
            setPending((list) =>
              list.map((item) =>
                item.key === key ? { ...item, progress: 1, file: uploaded } : item,
              ),
            ),
          )
          .catch((error: unknown) => {
            const code = error instanceof ApiError ? error.code : ""
            const message = uploadErrorText[code] ?? "Não foi possível enviar o arquivo."
            toast.error(`${file.name}: ${message}`)
            setPending((list) =>
              list.map((item) => (item.key === key ? { ...item, error: message } : item)),
            )
          })
      }
    },
    [props.conversationId],
  )

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => textarea.current?.focus(),
    getText: () => text,
    setText: (value) => setText(value),
  }))

  /** Troca o texto e põe o cursor em `position` (depois do render). */
  function replaceText(value: string, position: number) {
    setText(value)
    setCaret(position)
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(position, position)
    })
  }

  // Menu de @menção (sinapses) e de "/" (prompts salvos, D76).
  const beforeCaret = text.slice(0, caret)
  const mentionQuery = props.anonymous
    ? null
    : (beforeCaret.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u)?.[1] ?? null)
  const slashQuery = text.match(/^\/([\p{L}\p{N}_-]*)$/u)?.[1] ?? null
  let menu: MenuItem[] = []
  if (mentionQuery !== null) {
    const query = normalize(mentionQuery)
    menu = (sinapses.data?.sinapses ?? [])
      .filter((sinapse) => !mentions.some((mention) => mention.id === sinapse.id))
      .filter((sinapse) => normalize(sinapse.title).includes(query))
      .slice(0, 6)
      .map((sinapse) => ({
        key: sinapse.id,
        label: `${sinapse.emoji ?? "🧠"} ${sinapse.title}`,
        detail: sinapse.summary,
        apply: () => {
          const start = caret - mentionQuery.length - 1
          replaceText(text.slice(0, start) + text.slice(caret), start)
          setMentions((list) => [...list, { id: sinapse.id, title: sinapse.title }])
        },
      }))
  } else if (slashQuery !== null) {
    const query = normalize(slashQuery)
    menu = (settings.data?.settings.savedPrompts ?? [])
      .filter((prompt) => normalize(prompt.name).startsWith(query))
      .slice(0, 8)
      .map((prompt) => ({
        key: prompt.name,
        label: `/${prompt.name}`,
        detail: prompt.text,
        apply: () => {
          const value = `${prompt.text}\n\n`
          replaceText(value, value.length)
        },
      }))
  }
  const menuOpen = menu.length > 0 && menuDismissedAt !== text
  const activeIndex = Math.min(menuIndex, Math.max(menu.length - 1, 0))

  const uploading = pending.some((item) => !item.file && !item.error)
  const ready = pending.filter((item) => item.file).map((item) => item.file!)
  const canSend =
    !streaming && !uploading && !props.disabled && (text.trim().length > 0 || ready.length > 0)

  function submit() {
    if (!canSend) return
    if (!props.onSubmit({ text: text.trim(), files: ready, mentions })) return
    setText("")
    setMentions([])
    writeDraft(draftKey, "")
    pending.forEach((item) => item.preview && URL.revokeObjectURL(item.preview))
    setPending([])
  }

  async function toggleRecording() {
    if (recording === "recording") {
      setRecording("transcribing")
      try {
        const audio = await recorder.current!.stop()
        const transcript = await transcribe(audio)
        setText((current) => (current ? `${current} ${transcript}` : transcript))
        textarea.current?.focus()
      } catch {
        toast.error("Não foi possível transcrever o áudio.")
      } finally {
        recorder.current = null
        setRecording(null)
      }
      return
    }
    try {
      recorder.current = await startRecording()
      setRecording("recording")
    } catch {
      toast.error("Sem acesso ao microfone.")
    }
  }

  return (
    <div className="relative rounded-2xl border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
      {menuOpen && (
        <div
          role="listbox"
          aria-label={mentionQuery !== null ? "Sinapses" : "Prompts salvos"}
          className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {mentionQuery !== null ? "Mencionar sinapse" : "Prompts salvos"} · ↑↓ e Enter
          </div>
          {menu.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm",
                index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setMenuIndex(index)}
              onClick={() => item.apply()}
            >
              <span className="font-medium">{item.label}</span>
              {item.detail && (
                <span className="line-clamp-1 text-xs text-muted-foreground">{item.detail}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {(pending.length > 0 || mentions.length > 0) && (
        <div className="flex flex-wrap gap-2 border-b p-2">
          {mentions.map((mention) => (
            <span
              key={mention.id}
              className="relative inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 py-1 pr-7 pl-2 text-xs"
            >
              <AtSignIcon className="size-3.5 text-primary" />
              <span className="max-w-40 truncate">{mention.title}</span>
              <button
                type="button"
                aria-label={`Remover menção a ${mention.title}`}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 hover:bg-muted"
                onClick={() =>
                  setMentions((list) => list.filter((other) => other.id !== mention.id))
                }
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
          {pending.map((item) => (
            <div
              key={item.key}
              className={cn(
                "relative flex items-center gap-2 rounded-lg border bg-muted/40 py-1 pr-7 pl-1 text-xs",
                item.error && "border-destructive/50 text-destructive",
              )}
            >
              {item.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.preview} alt="" className="size-8 rounded object-cover" />
              ) : (
                <FileIcon className="ml-1 size-4" />
              )}
              <span className="max-w-40 truncate">{item.name}</span>
              {!item.file && !item.error && (
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(item.progress * 100)}%
                </span>
              )}
              <button
                type="button"
                aria-label={`Remover ${item.name}`}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 hover:bg-muted"
                onClick={() => setPending((list) => list.filter((other) => other.key !== item.key))}
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={textarea}
        value={text}
        autoFocus={props.autoFocus}
        rows={1}
        placeholder={
          recording === "recording"
            ? "Ouvindo… clique no microfone para terminar"
            : props.anonymous
              ? "Pergunte qualquer coisa"
              : "Pergunte qualquer coisa · @ menciona uma sinapse · / usa um prompt salvo"
        }
        aria-label="Mensagem"
        className="block max-h-64 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        onChange={(event) => {
          setText(event.target.value)
          setCaret(event.target.selectionStart)
          setMenuIndex(0)
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={(event) => {
          if (menuOpen) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault()
              const step = event.key === "ArrowDown" ? 1 : -1
              setMenuIndex((activeIndex + step + menu.length) % menu.length)
              return
            }
            if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
              event.preventDefault()
              menu[activeIndex]?.apply()
              return
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setMenuDismissedAt(text)
              return
            }
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
          if (event.key === "Escape" && streaming) props.onStop()
        }}
        onPaste={(event) => {
          const files = [...event.clipboardData.files]
          if (files.length) {
            event.preventDefault()
            addFiles(files)
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
        <label className="contents">
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              addFiles([...(event.target.files ?? [])])
              event.target.value = ""
            }}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className={cn(
                    "inline-flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-muted",
                  )}
                />
              }
            >
              <PaperclipIcon className="size-4" />
              <span className="sr-only">Anexar arquivo</span>
            </TooltipTrigger>
            <TooltipContent>Anexar (ou arraste / cole)</TooltipContent>
          </Tooltip>
        </label>

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                pressed={options.webSearch}
                onPressedChange={(webSearch) => onOptionsChange({ webSearch })}
                aria-label="Busca na web"
              />
            }
          >
            <GlobeIcon />
          </TooltipTrigger>
          <TooltipContent>Busca na web</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                pressed={options.imageGeneration}
                onPressedChange={(imageGeneration) => onOptionsChange({ imageGeneration })}
                aria-label="Gerar imagens"
              />
            }
          >
            <ImageIcon />
          </TooltipTrigger>
          <TooltipContent>Gerar imagens</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                size="sm"
                pressed={options.codeInterpreter}
                onPressedChange={(codeInterpreter) => onOptionsChange({ codeInterpreter })}
                aria-label="Interpretador de código"
              />
            }
          >
            <SquareTerminalIcon />
          </TooltipTrigger>
          <TooltipContent>
            Interpretador de código: analisa planilhas e CSV, faz contas e gráficos (~US$ 0,03 por
            sessão)
          </TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 font-normal"
                aria-label="Nível de raciocínio"
              />
            }
          >
            <BrainIcon className="size-3.5" />
            <span className="hidden sm:inline">
              {efforts.find(([value]) => value === options.reasoningEffort)?.[1] ?? "Automático"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Raciocínio</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={options.reasoningEffort}
              onValueChange={(reasoningEffort) => onOptionsChange({ reasoningEffort })}
            >
              {efforts.map(([value, label]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ModelPicker value={options.model} onChange={(model) => onOptionsChange({ model })} />

        <div className="ml-auto flex items-center gap-1">
          {props.extraActions}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={recording === "recording" ? "destructive" : "ghost"}
                  size="icon"
                  aria-label={recording === "recording" ? "Parar ditado" : "Ditar"}
                  disabled={recording === "transcribing"}
                  onClick={toggleRecording}
                />
              }
            >
              {recording === "transcribing" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <MicIcon />
              )}
            </TooltipTrigger>
            <TooltipContent>Ditar</TooltipContent>
          </Tooltip>

          {streaming ? (
            <Button
              size="icon"
              className="rounded-full"
              aria-label="Parar resposta"
              onClick={props.onStop}
            >
              <SquareIcon className="fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="rounded-full"
              aria-label="Enviar"
              disabled={!canSend}
              onClick={submit}
            >
              {uploading ? <Loader2Icon className="animate-spin" /> : <ArrowUpIcon />}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})
