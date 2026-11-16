"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, unwrap } from "@/lib/api"
import type { paths } from "@/lib/api-schema"
import type { DiaryDayView, Settings } from "@/lib/types"

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

// ─── Diário (D81) ─────────────────────────────────────────────────────────────

/** Dias com registro de um mês (sem `month`, o mês atual) e a data de hoje (virada às 4h). */
export function useDiaryMonth(month?: string) {
  return useQuery({
    queryKey: ["diary-month", month ?? "current"],
    queryFn: () => unwrap(api.GET("/diary/days", { params: { query: month ? { month } : {} } })),
    placeholderData: keepPreviousData,
  })
}

export function useDiaryDay(date: string) {
  return useQuery({
    queryKey: ["diary-day", date],
    queryFn: () => unwrap(api.GET("/diary/days/{date}", { params: { path: { date } } })),
  })
}

/** Ações do dia: cada uma atualiza a tela e o calendário. */
export function useDiaryActions(date: string) {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["diary-day", date] })
    void queryClient.invalidateQueries({ queryKey: ["diary-month"] })
  }
  const show = (view: DiaryDayView) => {
    queryClient.setQueryData(["diary-day", date], view)
    void queryClient.invalidateQueries({ queryKey: ["diary-month"] })
  }
  return {
    start: useMutation({
      mutationFn: (text: string) =>
        unwrap(
          api.POST("/diary/days/{date}/entries", { params: { path: { date } }, body: { text } }),
        ),
      onSettled: refresh,
    }),
    answer: useMutation({
      mutationFn: ({ entryId, text, skip }: { entryId: string; text?: string; skip?: boolean }) =>
        unwrap(
          api.POST("/diary/entries/{id}/turns", {
            params: { path: { id: entryId } },
            body: { ...(text ? { text } : {}), ...(skip ? { skip } : {}) },
          }),
        ),
      onSettled: refresh,
    }),
    conclude: useMutation({
      mutationFn: ({ entryId, mood }: { entryId: string; mood?: number | null }) =>
        unwrap(
          api.POST("/diary/entries/{id}/conclude", {
            params: { path: { id: entryId } },
            body: mood === undefined ? {} : { mood },
          }),
        ),
      onSuccess: show,
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (entryId: string) =>
        unwrap(api.DELETE("/diary/entries/{id}", { params: { path: { id: entryId } } })),
      onSuccess: show,
      onError: refresh,
    }),
    patch: useMutation({
      mutationFn: (body: { mood?: number | null; summary?: string; learnings?: string[] }) =>
        unwrap(api.PATCH("/diary/days/{date}", { params: { path: { date } }, body })),
      onSuccess: show,
    }),
  }
}

// ─── Personas (D80) ───────────────────────────────────────────────────────────

export function usePersonas() {
  return useQuery({
    queryKey: ["personas"],
    queryFn: () => unwrap(api.GET("/personas")),
    select: (data) => data.personas,
    staleTime: 5 * 60_000,
  })
}

type PersonaInput = NonNullable<
  paths["/personas"]["post"]["requestBody"]
>["content"]["application/json"]

export function useSavePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & PersonaInput) =>
      id
        ? unwrap(api.PATCH("/personas/{id}", { params: { path: { id } }, body }))
        : unwrap(api.POST("/personas", { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["personas"] }),
  })
}

export function useDeletePersona() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/personas/{id}", { params: { path: { id } } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["personas"] })
      // Conversas com essa persona voltaram ao padrão no servidor.
      void queryClient.invalidateQueries({ queryKey: ["conversation"] })
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
