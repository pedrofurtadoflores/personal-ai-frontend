import { beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/lib/auth"

const future = () => new Date(Date.now() + 60_000).toISOString()

beforeEach(() => {
  localStorage.clear()
  auth.clear()
})

describe("auth", () => {
  it("guarda e lê o token", () => {
    auth.setSession({ token: "abc", expiresAt: future() })
    expect(auth.getToken()).toBe("abc")
  })

  it("ignora e remove sessão expirada", () => {
    localStorage.setItem(
      "personal-ai.session",
      JSON.stringify({ token: "velho", expiresAt: new Date(Date.now() - 1000).toISOString() }),
    )
    expect(auth.getToken()).toBeNull()
    expect(localStorage.getItem("personal-ai.session")).toBeNull()
  })

  it("trata JSON corrompido como sem sessão e o remove", () => {
    localStorage.setItem("personal-ai.session", "{quebrado")
    expect(auth.getToken()).toBeNull()
    expect(localStorage.getItem("personal-ai.session")).toBeNull()
  })

  it("avisa os inscritos ao entrar e sair", () => {
    const listener = vi.fn()
    const unsubscribe = auth.subscribe(listener)
    auth.setSession({ token: "abc", expiresAt: future() })
    auth.clear()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    auth.setSession({ token: "abc", expiresAt: future() })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("logout em outra aba avisa cada inscrito uma única vez", () => {
    const listeners = [vi.fn(), vi.fn(), vi.fn()]
    const unsubscribes = listeners.map((listener) => auth.subscribe(listener))
    window.dispatchEvent(new StorageEvent("storage", { key: "personal-ai.session" }))
    listeners.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1))
    unsubscribes.forEach((unsubscribe) => unsubscribe())
  })
})
