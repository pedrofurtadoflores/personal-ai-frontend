"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  BrainCircuitIcon,
  CheckIcon,
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  Link2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Undo2Icon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Skeleton } from "@/components/ui/skeleton"
import { api, unwrap } from "@/lib/api"
import { useFileUrl } from "@/lib/queries"
import type { MessagePart } from "@/lib/types"

type Part<T extends MessagePart["type"]> = Extract<MessagePart, { type: T }>

const chipIcon = {
  created: PlusIcon,
  updated: PencilIcon,
  linked: Link2Icon,
  suggested: LightbulbIcon,
}
const chipText = {
  created: "Sinapse criada",
  updated: "Sinapse atualizada",
  linked: "Sinapses conectadas",
  suggested: "Sugestão de memória",
}

/** Chip "🧠 Sinapse 'X' atualizada · ver · desfazer" (seção 4.3). */
export function SinapseChip({ part }: { part: Part<"sinapse"> }) {
  const queryClient = useQueryClient()
  const [undone, setUndone] = useState(false)
  const undo = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/sinapses/versions/{versionId}/undo", {
          params: { path: { versionId: part.versionId! } },
        }),
      ),
    onSuccess: () => {
      setUndone(true)
      void queryClient.invalidateQueries({ queryKey: ["sinapses"] })
      void queryClient.invalidateQueries({ queryKey: ["sinapse", part.sinapseId] })
      toast.success("Mudança desfeita.")
    },
    onError: () => toast.error("Não foi possível desfazer."),
  })
  const Icon = chipIcon[part.action]

  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs">
      <BrainCircuitIcon className="size-3.5 shrink-0 text-primary" />
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">
        {chipText[part.action]}: <strong className="font-medium">{part.title}</strong>
      </span>
      {part.sinapseId && part.action !== "suggested" && (
        <Button
          variant="ghost"
          size="xs"
          nativeButton={false}
          render={<Link href={`/sinapses/${part.sinapseId}`} />}
        >
          ver
        </Button>
      )}
      {part.action === "suggested" && (
        <Button
          variant="ghost"
          size="xs"
          nativeButton={false}
          render={<Link href="/sinapses/sugestoes" />}
        >
          revisar
        </Button>
      )}
      {part.versionId && !undone && (
        <Button variant="ghost" size="xs" disabled={undo.isPending} onClick={() => undo.mutate()}>
          {undo.isPending ? <Loader2Icon className="animate-spin" /> : <Undo2Icon />} desfazer
        </Button>
      )}
      {undone && (
        <span className="flex items-center gap-1 pr-1.5 text-muted-foreground">
          <CheckIcon className="size-3" /> desfeito
        </span>
      )}
    </div>
  )
}

export function Sources({ part }: { part: Part<"sources"> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {part.items.map((source, index) => {
        let host = source.url
        try {
          host = new URL(source.url).hostname.replace(/^www\./, "")
        } catch {}
        return (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={source.title}
            className="inline-flex max-w-64 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
          >
            <span className="font-mono text-muted-foreground">{index + 1}</span>
            <span className="truncate">{host}</span>
          </a>
        )
      })}
    </div>
  )
}

export function GeneratedImage({ part }: { part: Part<"image"> }) {
  const url = useFileUrl(part.fileId)
  if (!url.data) return <Skeleton className="aspect-square w-full max-w-md rounded-xl" />
  return (
    <a href={url.data} target="_blank" rel="noopener noreferrer" className="block max-w-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url.data}
        alt={part.prompt ?? "Imagem gerada"}
        className="w-full rounded-xl border"
        loading="lazy"
      />
      {part.prompt && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{part.prompt}</p>
      )}
    </a>
  )
}

export function Attachment({ part }: { part: Part<"file"> }) {
  const isImage = part.mime.startsWith("image/")
  const url = useFileUrl(part.fileId)
  if (isImage && url.data) {
    return (
      <a href={url.data} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url.data}
          alt={part.name}
          className="max-h-60 max-w-60 rounded-lg border object-cover"
          loading="lazy"
        />
      </a>
    )
  }
  return (
    <a
      href={url.data ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-60 items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
    >
      <FileTextIcon className="size-4 shrink-0" />
      <span className="truncate">{part.name}</span>
    </a>
  )
}

/** Memória e arquivos que entraram no contexto desta resposta. */
export function ContextUsed({ part }: { part: Part<"context"> }) {
  const total = part.sinapses.length + part.files.length
  if (!total) return null
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <BrainCircuitIcon className="size-3.5" /> Usou {total}{" "}
        {total === 1 ? "lembrança" : "lembranças"}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 flex flex-wrap gap-1.5">
        {part.sinapses.map((sinapse) => (
          <Link
            key={sinapse.id}
            href={`/sinapses/${sinapse.id}`}
            className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
          >
            {sinapse.title}
          </Link>
        ))}
        {part.files.map((file) => (
          <span key={file.id} className="rounded-full border px-2 py-0.5 text-xs">
            📎 {file.name}
          </span>
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ToolUses({ parts }: { parts: Part<"tool">[] }) {
  const searches = parts.filter((part) => part.name === "web_search")
  if (!searches.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <GlobeIcon className="size-3.5" />
      {searches.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1">
          <SearchIcon className="size-3" />
          {part.detail ?? "busca"}
        </span>
      ))}
    </div>
  )
}

/** Status de tool enquanto a resposta é gerada. */
export function LiveStatus({ tool }: { tool: { tool: string; state: string } }) {
  const labels: Record<string, string> = {
    web_search: "Pesquisando na web…",
    image_generation: "Gerando imagem…",
    search_sinapses: "Consultando a memória…",
    read_sinapse: "Lendo a memória…",
    create_sinapse: "Guardando na memória…",
    update_sinapse: "Atualizando a memória…",
    link_sinapses: "Conectando sinapses…",
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2Icon className="size-3.5 animate-spin" /> {labels[tool.tool] ?? "Trabalhando…"}
    </div>
  )
}
