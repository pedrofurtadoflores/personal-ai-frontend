"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  BotIcon,
  CombineIcon,
  Link2Icon,
  Loader2Icon,
  LockIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RotateCcwIcon,
  ScissorsIcon,
  Trash2Icon,
  UnlockIcon,
  UserIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Markdown } from "@/components/chat/markdown"
import { SinapsePicker } from "@/components/sinapses/sinapse-picker"
import { VersionDiff } from "@/components/sinapses/version-diff"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap } from "@/lib/api"
import { formatDateTime, formatRelative } from "@/lib/format"
import { useSinapse, useSinapseVersions } from "@/lib/queries"
import type { Sinapse, SinapseVersion } from "@/lib/types"
import { cn } from "@/lib/utils"

type Patch = Partial<
  Pick<Sinapse, "title" | "emoji" | "summary" | "content" | "tags" | "locked" | "pinned" | "status">
>

function useRefresh(id: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["sinapse", id] })
    void queryClient.invalidateQueries({ queryKey: ["sinapse-versions", id] })
    void queryClient.invalidateQueries({ queryKey: ["sinapses"] })
    void queryClient.invalidateQueries({ queryKey: ["graph"] })
  }
}

function Editor({ sinapse, onDone }: { sinapse: Sinapse; onDone: () => void }) {
  const refresh = useRefresh(sinapse.id)
  const [draft, setDraft] = useState({
    title: sinapse.title,
    emoji: sinapse.emoji ?? "",
    summary: sinapse.summary,
    content: sinapse.content,
    tags: sinapse.tags.join(", "),
  })
  const [preview, setPreview] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH("/sinapses/{id}", {
          params: { path: { id: sinapse.id } },
          body: {
            title: draft.title,
            emoji: draft.emoji || null,
            summary: draft.summary,
            content: draft.content,
            tags: draft.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          },
        }),
      ),
    onSuccess: () => {
      refresh()
      toast.success("Sinapse salva (nova versão criada).")
      onDone()
    },
    onError: () => toast.error("Não foi possível salvar."),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          className="w-16 text-center text-lg"
          value={draft.emoji}
          onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
          aria-label="Emoji"
          maxLength={4}
        />
        <Input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          aria-label="Título"
        />
      </div>
      <Textarea
        value={draft.summary}
        onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
        aria-label="Resumo"
        placeholder="Resumo (vai sempre para o contexto do chat)"
        rows={2}
      />
      <Input
        value={draft.tags}
        onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
        aria-label="Tags"
        placeholder="Tags separadas por vírgula"
      />
      <Tabs
        value={preview ? "preview" : "edit"}
        onValueChange={(value) => setPreview(value === "preview")}
      >
        <TabsList>
          <TabsTrigger value="edit">Markdown</TabsTrigger>
          <TabsTrigger value="preview">Visualizar</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Textarea
            value={draft.content}
            onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            aria-label="Conteúdo"
            className="min-h-[24rem] font-mono text-sm"
          />
        </TabsContent>
        <TabsContent value="preview" className="min-h-[24rem] rounded-lg border p-4">
          <Markdown text={draft.content || "*Vazio*"} />
        </TabsContent>
      </Tabs>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={!draft.title.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Loader2Icon className="animate-spin" />} Salvar
        </Button>
      </div>
    </div>
  )
}

function Versions({ sinapse }: { sinapse: Sinapse }) {
  const versions = useSinapseVersions(sinapse.id)
  const refresh = useRefresh(sinapse.id)
  const [selected, setSelected] = useState<SinapseVersion | null>(null)
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      unwrap(
        api.POST("/sinapses/{id}/versions/{versionId}/restore", {
          params: { path: { id: sinapse.id, versionId } },
        }),
      ),
    onSuccess: () => {
      refresh()
      toast.success("Versão restaurada.")
    },
  })
  const list = versions.data ?? []
  const current = selected ?? list[0] ?? null
  const index = current ? list.findIndex((version) => version.id === current.id) : -1
  const previous = index >= 0 ? list[index + 1] : undefined

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <ol className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto">
        {list.map((version, position) => (
          <li key={version.id}>
            <button
              onClick={() => setSelected(version)}
              className={cn(
                "w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted",
                current?.id === version.id && "bg-muted",
              )}
            >
              <div className="flex items-center gap-1.5">
                {version.author === "ai" ? (
                  <BotIcon className="size-3.5" />
                ) : (
                  <UserIcon className="size-3.5" />
                )}
                <span className="font-medium">
                  {position === 0 ? "Atual" : formatRelative(version.createdAt)}
                </span>
              </div>
              <div className="line-clamp-2 text-xs text-muted-foreground">
                {version.reason ?? "Sem descrição"}
              </div>
            </button>
          </li>
        ))}
      </ol>
      {current && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{formatDateTime(current.createdAt)}</span>
            <Badge variant="outline">{current.author === "ai" ? "IA" : "Você"}</Badge>
            {current.sourceMessageId && (
              <span className="text-xs text-muted-foreground">da conversa</span>
            )}
            {index > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={restore.isPending}
                onClick={() => restore.mutate(current.id)}
              >
                <RotateCcwIcon /> Restaurar esta versão
              </Button>
            )}
          </div>
          {previous ? (
            <VersionDiff before={previous.content} after={current.content} />
          ) : (
            <p className="text-sm text-muted-foreground">Primeira versão.</p>
          )}
        </div>
      )}
    </div>
  )
}

function MergeDialog({ sinapse, onClose }: { sinapse: Sinapse; onClose: () => void }) {
  const refresh = useRefresh(sinapse.id)
  const [picked, setPicked] = useState<{ id: string; title: string }[]>([])
  const merge = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/sinapses/{id}/merge", {
          params: { path: { id: sinapse.id } },
          body: { sourceIds: picked.map((item) => item.id) },
        }),
      ),
    onSuccess: () => {
      refresh()
      toast.success("Sinapses mescladas.")
      onClose()
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mesclar em “{sinapse.title}”</DialogTitle>
          <DialogDescription>
            O conteúdo das escolhidas entra aqui como seções; elas são arquivadas (dá para
            recuperar).
          </DialogDescription>
        </DialogHeader>
        <SinapsePicker
          exclude={[sinapse.id]}
          selected={picked.map((item) => item.id)}
          onPick={(id, title) =>
            setPicked((current) =>
              current.some((item) => item.id === id)
                ? current.filter((item) => item.id !== id)
                : [...current, { id, title }],
            )
          }
        />
        <div className="flex flex-wrap gap-1.5">
          {picked.map((item) => (
            <Badge key={item.id} variant="secondary">
              {item.title}
            </Badge>
          ))}
        </div>
        <DialogFooter>
          <Button disabled={!picked.length || merge.isPending} onClick={() => merge.mutate()}>
            <CombineIcon /> Mesclar {picked.length || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Dividir: escolhe seções (## ...) para virarem uma sinapse nova. */
function SplitDialog({ sinapse, onClose }: { sinapse: Sinapse; onClose: () => void }) {
  const router = useRouter()
  const sections = sinapse.content.split(/\n(?=## )/).map((text, index) => ({
    index,
    text,
    title: text.match(/^##\s+(.+)/)?.[1] ?? `Trecho ${index + 1}`,
  }))
  const [picked, setPicked] = useState<number[]>([])
  const [title, setTitle] = useState("")
  const split = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/sinapses/{id}/split", {
          params: { path: { id: sinapse.id } },
          body: {
            remainingContent: sections
              .filter((section) => !picked.includes(section.index))
              .map((section) => section.text)
              .join("\n"),
            extracted: {
              title,
              summary: "",
              content: sections
                .filter((section) => picked.includes(section.index))
                .map((section) => section.text)
                .join("\n"),
              tags: sinapse.tags,
            },
          },
        }),
      ),
    onSuccess: (created) => {
      toast.success("Sinapse dividida.")
      router.push(`/sinapses/${created.id}`)
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dividir “{sinapse.title}”</DialogTitle>
          <DialogDescription>
            Escolha as seções que vão para uma sinapse nova (as duas ficam conectadas).
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {sections.map((section) => (
            <label
              key={section.index}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={picked.includes(section.index)}
                onChange={() =>
                  setPicked((current) =>
                    current.includes(section.index)
                      ? current.filter((item) => item !== section.index)
                      : [...current, section.index],
                  )
                }
              />
              {section.title}
            </label>
          ))}
        </div>
        <Input
          placeholder="Título da sinapse nova"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Título da nova sinapse"
        />
        <DialogFooter>
          <Button
            disabled={
              !picked.length ||
              picked.length === sections.length ||
              !title.trim() ||
              split.isPending
            }
            onClick={() => split.mutate()}
          >
            <ScissorsIcon /> Dividir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function SinapsePage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const detail = useSinapse(id)
  const refresh = useRefresh(id)
  const [editing, setEditing] = useState(searchParams.get("editar") === "1")
  const [dialog, setDialog] = useState<"merge" | "split" | "link" | null>(null)

  const patch = useMutation({
    mutationFn: (body: Patch) =>
      unwrap(api.PATCH("/sinapses/{id}", { params: { path: { id } }, body })),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/sinapses/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      refresh()
      toast.success("Sinapse apagada.")
      router.push("/sinapses")
    },
  })
  const link = useMutation({
    mutationFn: (other: string) =>
      unwrap(api.POST("/sinapses/links", { body: { a: id, b: other, reason: null } })),
    onSuccess: () => {
      refresh()
      setDialog(null)
    },
  })
  const unlink = useMutation({
    mutationFn: (other: string) =>
      unwrap(api.DELETE("/sinapses/links/{a}/{b}", { params: { path: { a: id, b: other } } })),
    onSuccess: refresh,
  })

  if (detail.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!detail.data)
    return <div className="p-8 text-sm text-muted-foreground">Sinapse não encontrada.</div>
  const { sinapse, links, sources } = detail.data

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-8">
      <Link
        href="/sinapses"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Sinapses
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <span className="text-3xl leading-none">{sinapse.emoji ?? "🧠"}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{sinapse.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sinapse.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {sinapse.pinned && (
              <Badge variant="secondary">
                <PinIcon /> fixada no contexto
              </Badge>
            )}
            {sinapse.locked && (
              <Badge variant="secondary">
                <LockIcon /> travada (a IA só sugere)
              </Badge>
            )}
            {sinapse.status === "archived" && <Badge variant="outline">arquivada</Badge>}
            {sinapse.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
            <span>· atualizada {formatRelative(sinapse.updatedAt)}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Editar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Mais ações" />}
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => patch.mutate({ pinned: !sinapse.pinned })}>
                {sinapse.pinned ? <PinOffIcon /> : <PinIcon />}{" "}
                {sinapse.pinned ? "Desafixar do contexto" : "Fixar no contexto"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => patch.mutate({ locked: !sinapse.locked })}>
                {sinapse.locked ? <UnlockIcon /> : <LockIcon />}{" "}
                {sinapse.locked ? "Destravar" : "Travar (IA só sugere)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("merge")}>
                <CombineIcon /> Mesclar outras aqui
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog("split")}>
                <ScissorsIcon /> Dividir
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  patch.mutate({ status: sinapse.status === "archived" ? "active" : "archived" })
                }
              >
                {sinapse.status === "archived" ? <ArchiveRestoreIcon /> : <ArchiveIcon />}{" "}
                {sinapse.status === "archived" ? "Desarquivar" : "Arquivar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => remove.mutate()}>
                <Trash2Icon /> Apagar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Conteúdo</TabsTrigger>
          <TabsTrigger value="versions">Versões</TabsTrigger>
          <TabsTrigger value="links">Conexões ({links.length})</TabsTrigger>
          <TabsTrigger value="sources">Origens ({sources.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="pt-3">
          {editing ? (
            <Editor sinapse={sinapse} onDone={() => setEditing(false)} />
          ) : sinapse.content.trim() ? (
            <Markdown text={sinapse.content} className="rounded-xl border p-5" />
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              Sem conteúdo ainda.
            </p>
          )}
        </TabsContent>

        <TabsContent value="versions" className="pt-3">
          <Versions sinapse={sinapse} />
        </TabsContent>

        <TabsContent value="links" className="flex flex-col gap-2 pt-3">
          {links.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span>{item.emoji ?? "🧠"}</span>
              <Link href={`/sinapses/${item.id}`} className="font-medium hover:underline">
                {item.title}
              </Link>
              {item.reason && (
                <span className="truncate text-xs text-muted-foreground">· {item.reason}</span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label={`Desconectar ${item.title}`}
                onClick={() => unlink.mutate(item.id)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <Button variant="outline" className="w-fit" onClick={() => setDialog("link")}>
            <Link2Icon /> Conectar sinapse
          </Button>
        </TabsContent>

        <TabsContent value="sources" className="flex flex-col gap-1.5 pt-3">
          {sources.length ? (
            sources.map((source, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <MessageSquareIcon className="size-4 text-muted-foreground" />
                {source.conversationId ? (
                  <Link href={`/c/${source.conversationId}`} className="hover:underline">
                    {source.conversationTitle ?? "Conversa"}
                  </Link>
                ) : (
                  <span>Arquivo</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(source.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Criada manualmente.</p>
          )}
        </TabsContent>
      </Tabs>

      {dialog === "merge" && <MergeDialog sinapse={sinapse} onClose={() => setDialog(null)} />}
      {dialog === "split" && <SplitDialog sinapse={sinapse} onClose={() => setDialog(null)} />}
      {dialog === "link" && (
        <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Conectar a…</DialogTitle>
            </DialogHeader>
            <SinapsePicker
              exclude={[sinapse.id, ...links.map((item) => item.id)]}
              onPick={(other) => link.mutate(other)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
