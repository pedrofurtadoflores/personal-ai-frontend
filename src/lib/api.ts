import createClient from "openapi-fetch"
import { resolveApiUrl } from "@/config/api-url"
import type { paths } from "@/lib/api-schema"
import { auth } from "@/lib/auth"

export const API_URL = resolveApiUrl()

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** Segundos até poder tentar de novo (header Retry-After), quando o servidor informa. */
    public retryAfter?: number,
  ) {
    super(code)
  }
}

/**
 * Cliente tipado a partir do contrato OpenAPI do backend (src/lib/api-schema.d.ts,
 * gerado com `npm run api:types`).
 */
export const api = createClient<paths>({
  baseUrl: API_URL,
  // Resolve o fetch a cada chamada (o padrão captura o global na criação, o que impede mocks).
  fetch: (request) => globalThis.fetch(request),
})

api.use({
  onRequest({ request }) {
    const token = auth.getToken()
    if (token) request.headers.set("authorization", `Bearer ${token}`)
    return request
  },
  onResponse({ request, response }) {
    // Token expirado ou revogado: encerra a sessão local (o layout redireciona para /login).
    if (response.status === 401 && request.headers.has("authorization")) auth.clear()
    return response
  },
})

type Result<T> = { data?: T; error?: unknown; response: Response }

/** Converte o resultado do openapi-fetch em valor ou ApiError com o código padrão da API. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  let result: Result<T>
  try {
    result = await promise
  } catch {
    throw new ApiError(0, "network_error")
  }

  const { data, error, response } = result
  if (!response.ok) {
    const code =
      error && typeof error === "object" && "error" in error && typeof error.error === "string"
        ? error.error
        : "request_failed"
    const retryAfter = Number(response.headers.get("retry-after")) || undefined
    throw new ApiError(response.status, code, retryAfter)
  }
  return data as T
}

export function login(password: string) {
  return unwrap(api.POST("/auth/login", { body: { password } }))
}

export function logoutAll() {
  return unwrap(api.POST("/auth/logout-all"))
}
