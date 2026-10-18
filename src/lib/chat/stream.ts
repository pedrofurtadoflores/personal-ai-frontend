import { API_URL, ApiError } from "@/lib/api"
import { auth } from "@/lib/auth"

export type StreamHandlers = {
  onEvent: (event: string, data: Record<string, unknown>) => void
}

/**
 * Lê a resposta SSE do backend com fetch + ReadableStream (D38): EventSource não envia o
 * header Authorization, e o token nunca vai na URL (D51).
 */
export async function streamSse(
  path: string,
  body: unknown,
  { onEvent }: StreamHandlers,
  signal: AbortSignal,
) {
  const token = auth.getToken()
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

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
}
