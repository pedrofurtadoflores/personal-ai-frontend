"use client"

import { useMutation } from "@tanstack/react-query"
import { ArchiveRestoreIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, unwrap } from "@/lib/api"
import { formatRelative } from "@/lib/format"
import { useConversations, useInvalidate, useUpdateConversation } from "@/lib/queries"

/** Lixeira e arquivadas: nada é apagado de vez sem passar por aqui (D27). */
export default function LixeiraPage() {
  const searchParams = useSearchParams()
  const view = searchParams.get("view") === "archived" ? "archived" : "trash"
  const conversations = useConversations(view)
  const invalidate = useInvalidate()
  const update = useUpdateConversation()

  const restore = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/conversations/{id}/restore", { params: { path: { id } } })),
    onSuccess: () => invalidate("conversations"),
  })
  const destroy = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/conversations/{id}/permanent", { params: { path: { id } } })),
    onSuccess: () => {
      void invalidate("conversations")
      toast.success("Conversa apagada de vez.")
    },
  })

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">
          {view === "trash" ? "Lixeira" : "Arquivadas"}
        </h1>
        <Tabs value={view}>
          <TabsList>
            <TabsTrigger
              value="archived"
              nativeButton={false}
              render={<Link href="/lixeira?view=archived" />}
            >
              Arquivadas
            </TabsTrigger>
            <TabsTrigger value="trash" nativeButton={false} render={<Link href="/lixeira" />}>
              Lixeira
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "trash" && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Conversas apagadas ficam aqui até você restaurar ou apagar de vez.
        </p>
      )}

      {(conversations.data ?? []).map((conversation) => (
        <div
          key={conversation.id}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <Link href={`/c/${conversation.id}`} className="min-w-0 flex-1 truncate hover:underline">
            {conversation.title ?? "Nova conversa"}
          </Link>
          <span className="text-xs text-muted-foreground">
            {formatRelative(
              view === "trash"
                ? (conversation.deletedAt ?? conversation.updatedAt)
                : conversation.updatedAt,
            )}
          </span>
          {view === "trash" ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => restore.mutate(conversation.id)}>
                <RotateCcwIcon /> Restaurar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => destroy.mutate(conversation.id)}
              >
                <Trash2Icon /> Apagar de vez
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => update.mutate({ id: conversation.id, archived: false })}
            >
              <ArchiveRestoreIcon /> Desarquivar
            </Button>
          )}
        </div>
      ))}
      {conversations.isSuccess && conversations.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nada por aqui.
        </p>
      )}
    </div>
  )
}
