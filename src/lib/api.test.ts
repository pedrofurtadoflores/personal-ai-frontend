import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, login, unwrap, api } from "@/lib/api"
import { auth } from "@/lib/auth"

const future = () => new Date(Date.now() + 60_000).toISOString()

function mockFetch(status: number, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: {
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...extraHeaders,
        },
      }),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  localStorage.clear()
  auth.clear()
})
afterEach(() => vi.unstubAllGlobals())

describe("api", () => {
  it("envia o token no header Authorization", async () => {
    auth.setSession({ token: "abc", expiresAt: future() })
    const fetchMock = mockFetch(200, { authenticated: true })
    await unwrap(api.GET("/auth/me"))
    expect(fetchMock.mock.calls[0]![0].headers.get("authorization")).toBe("Bearer abc")
  })

  it("401 com token encerra a sessão local", async () => {
    auth.setSession({ token: "abc", expiresAt: future() })
    mockFetch(401, { error: "unauthorized" })
    await expect(unwrap(api.GET("/auth/me"))).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    })
    expect(auth.getToken()).toBeNull()
  })

  it("401 do login (senha errada) vira ApiError com o código da API", async () => {
    mockFetch(401, { error: "invalid_password" })
    const error = await login("x").catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe("invalid_password")
  })

  it("429 traz o tempo de espera do header Retry-After", async () => {
    mockFetch(429, { error: "rate_limited" }, { "retry-after": "240" })
    const error = await login("x").catch((e) => e)
    expect(error).toMatchObject({ status: 429, code: "rate_limited", retryAfter: 240 })
  })

  it("aceita 204 sem corpo", async () => {
    auth.setSession({ token: "abc", expiresAt: future() })
    mockFetch(204)
    await expect(unwrap(api.POST("/auth/logout-all"))).resolves.toBeUndefined()
  })

  it("falha de rede vira network_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )
    await expect(unwrap(api.GET("/auth/me"))).rejects.toMatchObject({ code: "network_error" })
  })
})
