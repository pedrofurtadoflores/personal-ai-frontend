import { API_URL, ApiError } from "@/lib/api"
import { auth } from "@/lib/auth"

export type StreamHandlers = {
  onEvent: (event: string, data: Record<string, unknown>) => void
}

/**
 * Lê a resposta SSE do backend com fetch + ReadableStream (D38): EventSource não envia o
 * header Authorization, e o token nunca vai na URL (D51).
 *
 * Devolve `"empty"` quando o servidor responde 204 (ao retomar: não há resposta em andamento).
 */
export async function streamSse(
  request: { path: string; method?: "GET" | "POST"; body?: unknown },
  { onEvent }: StreamHandlers,
  signal: AbortSignal,
): Promise<"ended" | "empty"> {
  const token = auth.getToken()
  const method = request.method ?? "POST"
  const response = await fetch(`${API_URL}${request.path}`, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(method === "POST" ? { body: JSON.stringify(request.body ?? {}) } : {}),
    signal,
  })

  if (response.status === 204) return "empty"
  if (!response.ok || !response.body) {
    if (response.status === 401) auth.clear()
    const error = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      (error as { error?: string }).error ?? "request_failed",
      Number(response.headers.get("retry-after")) || undefined,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary: number
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (!block || block.startsWith(":")) continue // keep-alive
      const event = block.match(/^event: (.*)$/m)?.[1]
      const data = block.match(/^data: (.*)$/m)?.[1]
      if (event && data) onEvent(event, JSON.parse(data) as Record<string, unknown>)
    }
  }
  return "ended"
}
