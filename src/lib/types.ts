import type { components, paths } from "@/lib/api-schema"

type JsonOf<T> = T extends { content: { "application/json": infer B } } ? B : never
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: infer R
}
  ? JsonOf<R[200 & keyof R]> | JsonOf<R[201 & keyof R]>
  : never

/** Tipos derivados do contrato OpenAPI (gerado do backend). */
export type Conversation = Ok<"/conversations/{id}", "get">["conversation"]
export type Message = Ok<"/conversations/{id}", "get">["messages"][number]
export type MessagePart = Message["content"][number]
export type Folder = Ok<"/folders", "get">["folders"][number]
export type Model = Ok<"/models", "get">["models"][number]
export type Settings = Ok<"/settings", "get">["settings"]
export type SinapseSummary = Ok<"/sinapses", "get">["sinapses"][number]
export type SinapseDetail = Ok<"/sinapses/{id}", "get">
export type Sinapse = SinapseDetail["sinapse"]
export type SinapseVersion = Ok<"/sinapses/{id}/versions", "get">["versions"][number]
export type Suggestion = Ok<"/sinapses/suggestions", "get">["suggestions"][number]
export type Graph = Ok<"/sinapses/graph", "get">
export type FileItem = Ok<"/files", "get">["files"][number]
export type GeneratedImage = Ok<"/images", "get">["images"][number]
export type Usage = Ok<"/usage", "get">
export type Backup = Ok<"/backups", "get">["backups"][number]
export type SearchResult = Ok<"/search", "get">

export type { components }
