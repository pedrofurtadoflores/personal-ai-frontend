"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  CheckIcon,
  CombineIcon,
  Link2Icon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"
import { Markdown } from "@/components/chat/markdown"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, unwrap } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { useSuggestions } from "@/lib/queries"
import type { Suggestion } from "@/lib/types"

type Payload =
  | { kind: "create"; input: { title: string; summary: string; content: string } }
  | { kind: "update"; patch: { content?: string; summary?: string } }
  | { kind: "merge"; sourceIds: string[] }
  | { kind: "link"; otherId: string }

const kindLabel = {
  create: "Criar sinapse",
  update: "Atualizar",
  merge: "Mesclar",
  link: "Conectar",
}
const kindIcon = { create: PlusIcon, update: PencilIcon, merge: CombineIcon, link: Link2Icon }

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const queryClient = useQueryClient()
  const payload = suggestion.payload as Payload
  const resolve = useMutation({
    mutationFn: (decision: "accept" | "reject") =>
      unwrap(
        api.POST("/sinapses/suggestions/{id}/{decision}", {
          params: { path: { id: suggestion.id, decision } },
        }),
      ),
    onSuccess: (_data, decision) => {
      void queryClient.invalidateQueries({ queryKey: ["suggestions"] })
      void queryClient.invalidateQueries({ queryKey: ["sinapses"] })
      toast.success(decision === "accept" ? "Sugestão aplicada." : "Sugestão descartada.")
    },
    onError: () => toast.error("Não foi possível aplicar a sugestão."),
  })
  const Icon = kindIcon[suggestion.kind]

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" /> {kindLabel[suggestion.kind]} ·{" "}
          {formatRelative(suggestion.createdAt)}
        </CardDescription>
        <CardTitle className="text-base">
          {payload.kind === "create" ? payload.input.title : (suggestion.sinapseTitle ?? "Sinapse")}
        </CardTitle>
        {suggestion.reason && <p className="text-sm text-muted-foreground">{suggestion.reason}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {payload.kind === "create" && (
          <Markdown
            text={payload.input.content}
            className="max-h-72 overflow-y-auto rounded-lg border p-3"
          />
        )}
        {payload.kind === "update" && payload.patch.content && (
          <Markdown
            text={payload.patch.content}
            className="max-h-72 overflow-y-auto rounded-lg border p-3"
          />
        )}
        {payload.kind === "merge" && (
          <p className="text-sm">Juntar {payload.sourceIds.length} sinapse(s) parecida(s) nesta.</p>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={resolve.isPending} onClick={() => resolve.mutate("accept")}>
            {resolve.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Aceitar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate("reject")}
          >
            <XIcon /> Descartar
          </Button>
          {suggestion.sinapseId && (
            <Button
              size="sm"
              variant="link"
              nativeButton={false}
              render={<Link href={`/sinapses/${suggestion.sinapseId}`} />}
            >
              ver sinapse atual
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SuggestionsPage() {
  const suggestions = useSuggestions()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <Link
        href="/sinapses"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Sinapses
      </Link>
      <h1 className="text-2xl font-semibold">Sugestões de memória</h1>
      <p className="-mt-2 text-sm text-muted-foreground">
        A IA não escreve direto em sinapses travadas, nem quando a informação veio de fora (busca na
        web, arquivos): nesses casos ela sugere e você decide.
      </p>
      {suggestions.isLoading ? (
        <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />
      ) : suggestions.data?.length ? (
        suggestions.data.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} />
        ))
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma sugestão pendente.
        </p>
      )}
    </div>
  )
}
