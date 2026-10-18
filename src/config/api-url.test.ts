import { describe, expect, it } from "vitest"
import { resolveApiUrl } from "@/config/api-url"

describe("resolveApiUrl", () => {
  it("remove a barra final (evita //auth/login)", () => {
    expect(resolveApiUrl("https://api.app/", "production")).toBe("https://api.app")
    expect(resolveApiUrl(" https://api.app// ", "production")).toBe("https://api.app")
  })

  it("usa o backend local fora de produção", () => {
    expect(resolveApiUrl(undefined, "development")).toBe("http://localhost:3333")
  })

  it("exige a URL em produção e recusa valores inválidos", () => {
    expect(() => resolveApiUrl(undefined, "production")).toThrow(/NEXT_PUBLIC_API_URL/)
    expect(() => resolveApiUrl("api.app", "production")).toThrow()
    expect(() => resolveApiUrl("ftp://api.app", "production")).toThrow(/http/)
  })
})
