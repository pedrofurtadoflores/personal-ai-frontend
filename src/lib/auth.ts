import { useSyncExternalStore } from "react"

const STORAGE_KEY = "personal-ai.session"

type Session = { token: string; expiresAt: string }

const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (typeof session.token === "string" && new Date(session.expiresAt) > new Date()) {
      return session
    }
  } catch {
    // JSON corrompido: cai na remoção abaixo
  }
  localStorage.removeItem(STORAGE_KEY)
  return null
}

// Cache para o useSyncExternalStore receber sempre a mesma referência.
let cached: string | null | undefined

function getToken(): string | null {
  if (typeof window === "undefined") return null
  if (cached === undefined) cached = read()?.token ?? null
  return cached
}

function notify() {
  cached = undefined
  listeners.forEach((listener) => listener())
}

// Um único listener: login/logout em outra aba se reflete nesta.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) notify()
  })
}

export const auth = {
  getToken,
  setSession(session: Session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    notify()
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY)
    notify()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** `undefined` enquanto ainda não leu o localStorage (render no servidor). */
export function useToken(): string | null | undefined {
  return useSyncExternalStore(auth.subscribe, getToken, () => undefined)
}
