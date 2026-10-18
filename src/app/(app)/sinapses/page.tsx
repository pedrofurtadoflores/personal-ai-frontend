"use client"

import { useMutation } from "@tanstack/react-query"
import {
  BotIcon,
  LightbulbIcon,
  LockIcon,
  NetworkIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, unwrap } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { useSinapses } from "@/lib/queries"
import { cn } from "@/lib/utils"

function NewSinapseDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const create = useMutation({
    mutationFn: () =>
      unwrap(api.POST("/sinapses", { body: { title, summary, content: "", tags: [] } })),
    onSuccess: (sinapse) => router.push(`/sinapses/${sinapse.id}?editar=1`),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova sinapse</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (title.trim()) create.mutate()
          }}
        >
          <Input
            autoFocus
            placeholder="Tema (ex.: Ideias de projeto)"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Título"
          />
          <Textarea
            placeholder="Resumo em 1 a 3 frases"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            aria-label="Resumo"
          />
          <DialogFooter>
            <Button type="submit" disabled={!title.trim() || create.isPending}>
              Criar e editar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function SinapsesPage() {
  const [status, setStatus] = useState<"active" | "archived">("active")
  const [tag, setTag] = useState<string | undefined>()
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  const sinapses = useSinapses({ status, tag, ...(term.length >= 2 ? { q: term } : {}) })
  const data = sinapses.data

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Sinapses</h1>
        <Button variant="outline" nativeButton={false} render={<Link href="/sinapses/sugestoes" />}>
          <LightbulbIcon /> Sugestões
          {(data?.pendingSuggestions ?? 0) > 0 && (
            <Badge className="ml-1">{data!.pendingSuggestions}</Badge>
          )}
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/sinapses/grafo" />}>
          <NetworkIcon /> Grafo
        </Button>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon /> Nova
        </Button>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        Sua memória por temas. O chat cria e atualiza sozinho; aqui você edita, trava, mescla e
        organiza.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por tema ou conteúdo…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar sinapses"
          />
        </div>
        <Tabs value={status} onValueChange={(value) => setStatus(value as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active">Ativas</TabsTrigger>
            <TabsTrigger value="archived">Arquivadas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {(data?.tags.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data!.tags.map((item) => (
            <button
              key={item.tag}
              onClick={() => setTag(tag === item.tag ? undefined : item.tag)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted",
                tag === item.tag &&
                  "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              #{item.tag} <span className="opacity-60">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {sinapses.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : data?.sinapses.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.sinapses.map((sinapse) => (
            <Link
              key={sinapse.id}
              href={`/sinapses/${sinapse.id}`}
              className="group flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start gap-2">
                <span className="text-xl leading-none">{sinapse.emoji ?? "🧠"}</span>
                <h2 className="flex-1 leading-tight font-medium">{sinapse.title}</h2>
                {sinapse.pinned && (
                  <PinIcon className="size-3.5 text-muted-foreground" aria-label="Fixada" />
                )}
                {sinapse.locked && (
                  <LockIcon className="size-3.5 text-muted-foreground" aria-label="Travada" />
                )}
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {sinapse.summary || "Sem resumo."}
              </p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                {sinapse.tags.slice(0, 4).map((item) => (
                  <span key={item}>#{item}</span>
                ))}
                <span className="ml-auto flex items-center gap-1">
                  {sinapse.createdBy === "ai" && (
                    <BotIcon className="size-3" aria-label="Criada pela IA" />
                  )}
                  {formatRelative(sinapse.updatedAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {term || tag
            ? "Nada encontrado."
            : "Nenhuma sinapse ainda. Converse no chat: a memória se forma sozinha."}
        </div>
      )}

      {creating && <NewSinapseDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
