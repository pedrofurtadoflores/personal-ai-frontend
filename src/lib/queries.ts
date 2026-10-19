"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api"
import type { paths } from "@/lib/api-schema"
import type { Settings } from "@/lib/types"

// ─── Conversas ────────────────────────────────────────────────────────────────

export function useConversations(view: "active" | "archived" | "trash" = "active") {
  return useQuery({
    queryKey: ["conversations", view],
    queryFn: () => unwrap(api.GET("/conversations", { params: { query: { view } } })),
    select: (data) => data.conversations,
  })
}

export function useConversation(id: string | null | undefined) {
  return useQuery({
    queryKey: ["conversation", id],
    queryFn: () => unwrap(api.GET("/conversations/{id}", { params: { path: { id: id! } } })),
    enabled: !!id,
  })
}

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: () => unwrap(api.GET("/folders")),
    select: (data) => data.folders,
  })
}

type ConversationPatch = NonNullable<
  paths["/conversations/{id}"]["patch"]["requestBody"]
>["content"]["application/json"]

export function useUpdateConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ConversationPatch) =>
      unwrap(api.PATCH("/conversations/{id}", { params: { path: { id } }, body })),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] })
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversation.id] })
    },
  })
}

/** Sugestões da tela inicial, a partir da memória (D72). */
export function useChatSuggestions() {
  return useQuery({
    queryKey: ["chat-suggestions"],
    queryFn: () => unwrap(api.GET("/chat/suggestions")),
    staleTime: 30 * 60_000,
    retry: false,
  })
}

export function useInvalidate() {
  const queryClient = useQueryClient()
  return (...keys: string[]) =>
    Promise.all(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
}

// ─── Modelos, configurações, uso ─────────────────────────────────────────────

export function useModels(
  kind?: "chat" | "image" | "embedding" | "transcription" | "speech" | "realtime",
) {
  return useQuery({
    queryKey: ["models", kind ?? "all"],
    queryFn: () => unwrap(api.GET("/models", { params: { query: kind ? { kind } : {} } })),
    staleTime: 5 * 60_000,
  })
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => unwrap(api.GET("/settings")),
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<Settings>) => unwrap(api.PATCH("/settings", { body })),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], (old: { voices: string[] } | undefined) => ({
        voices: old?.voices ?? [],
        settings: data.settings,
      }))
    },
  })
}

export function useUsage(days = 30) {
  return useQuery({
    queryKey: ["usage", days],
    queryFn: () => unwrap(api.GET("/usage", { params: { query: { days } } })),
  })
}

/** Só o status do mês (para o alerta no topo do app). */
export function useMonthStatus() {
  return useQuery({
    queryKey: ["usage-month"],
    queryFn: () => unwrap(api.GET("/usage", { params: { query: { days: 1 } } })),
    select: (data) => data.month,
    staleTime: 5 * 60_000,
  })
}

// ─── Sinapses ─────────────────────────────────────────────────────────────────

export function useSinapses(
  filters: { status?: "active" | "archived"; tag?: string; q?: string } = {},
) {
  return useQuery({
    queryKey: ["sinapses", filters],
    queryFn: () => unwrap(api.GET("/sinapses", { params: { query: filters } })),
  })
}

export function useSinapse(id: string) {
  return useQuery({
    queryKey: ["sinapse", id],
    queryFn: () => unwrap(api.GET("/sinapses/{id}", { params: { path: { id } } })),
  })
}

export function useSinapseVersions(id: string, enabled = true) {
  return useQuery({
    queryKey: ["sinapse-versions", id],
    queryFn: () => unwrap(api.GET("/sinapses/{id}/versions", { params: { path: { id } } })),
    select: (data) => data.versions,
    enabled,
  })
}

export function useSuggestions() {
  return useQuery({
    queryKey: ["suggestions"],
    queryFn: () => unwrap(api.GET("/sinapses/suggestions")),
    select: (data) => data.suggestions,
  })
}

export function useGraph() {
  return useQuery({ queryKey: ["graph"], queryFn: () => unwrap(api.GET("/sinapses/graph")) })
}

// ─── Arquivos ─────────────────────────────────────────────────────────────────

export function useFiles(origin?: "upload" | "generated", folderId?: string) {
  return useQuery({
    queryKey: ["files", origin ?? "all", folderId ?? "any"],
    queryFn: () =>
      unwrap(
        api.GET("/files", {
          params: { query: { ...(origin ? { origin } : {}), ...(folderId ? { folderId } : {}) } },
        }),
      ),
    select: (data) => data.files,
    // Enquanto algum arquivo processa, atualiza sozinho.
    refetchInterval: (query) =>
      query.state.data?.files.some((file) =>
        ["pending", "uploaded", "processing"].includes(file.status),
      )
        ? 2_000
        : false,
  })
}

/** URL assinada de um arquivo (válida por 1 h no backend; renova antes disso). */
export function useFileUrl(fileId: string | null | undefined) {
  return useQuery({
    queryKey: ["file-url", fileId],
    queryFn: async () =>
      (await unwrap(api.GET("/files/{id}", { params: { path: { id: fileId! }, query: {} } }))).url,
    enabled: !!fileId,
    staleTime: 45 * 60_000,
    gcTime: 50 * 60_000,
  })
}

export function useImages() {
  return useQuery({
    queryKey: ["images"],
    queryFn: () => unwrap(api.GET("/images")),
    select: (data) => data.images,
    staleTime: 30 * 60_000,
  })
}

export function useBackups() {
  return useQuery({
    queryKey: ["backups"],
    queryFn: () => unwrap(api.GET("/backups")),
    select: (data) => data.backups,
  })
}
