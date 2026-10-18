"use client"

import { useQuery } from "@tanstack/react-query"
import { BrainCircuitIcon, Loader2Icon, MessageSquareIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { api, unwrap } from "@/lib/api"
import { useConversations } from "@/lib/queries"

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

/** Busca global (Ctrl+K): títulos, texto das mensagens (+ semântica) e sinapses. */
export function SearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const term = useDebounced(query.trim(), 300)
  const recent = useConversations()
  const search = useQuery({
    queryKey: ["search", term],
    queryFn: () => unwrap(api.GET("/search", { params: { query: { q: term } } })),
    enabled: term.length >= 2,
  })

  function go(path: string) {
    onOpenChange(false)
    setQuery("")
    router.push(path)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar"
      description="Busque nas conversas e nas sinapses"
    >
      {/* O filtro é do servidor; o do cmdk esconderia resultados semânticos sem a palavra exata. */}
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Buscar conversas e sinapses…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {term.length < 2 ? (
            <CommandGroup heading="Recentes">
              {(recent.data ?? []).slice(0, 8).map((conversation) => (
                <CommandItem
                  key={conversation.id}
                  value={conversation.id}
                  onSelect={() => go(`/c/${conversation.id}`)}
                >
                  <MessageSquareIcon /> {conversation.title ?? "Nova conversa"}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : search.isFetching && !search.data ? (
            <div className="flex justify-center py-6">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CommandEmpty>Nada encontrado.</CommandEmpty>
              {(search.data?.conversations.length ?? 0) > 0 && (
                <CommandGroup heading="Conversas">
                  {search.data!.conversations.map((hit) => (
                    <CommandItem
                      key={hit.conversationId}
                      value={`c-${hit.conversationId}`}
                      onSelect={() => go(`/c/${hit.conversationId}`)}
                    >
                      <MessageSquareIcon />
                      <div className="min-w-0">
                        <div className="truncate">{hit.title ?? "Nova conversa"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {hit.snippet.replace(/[«»]/g, "")}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {(search.data?.sinapses.length ?? 0) > 0 && (
                <CommandGroup heading="Sinapses">
                  {search.data!.sinapses.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={`s-${hit.id}`}
                      onSelect={() => go(`/sinapses/${hit.id}`)}
                    >
                      <BrainCircuitIcon />
                      <div className="min-w-0">
                        <div className="truncate">{hit.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{hit.snippet}</div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
