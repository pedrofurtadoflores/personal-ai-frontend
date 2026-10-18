"use client"

import { BrainCircuitIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError, login } from "@/lib/api"
import { auth, useToken } from "@/lib/auth"

const errorMessages: Record<string, string> = {
  invalid_password: "Senha incorreta.",
  rate_limited: "Muitas tentativas. Espere um pouco e tente de novo.",
  validation_error: "Senha inválida (máximo de 72 caracteres).",
  network_error: "Não foi possível conectar ao servidor.",
}

export default function LoginPage() {
  const router = useRouter()
  const token = useToken()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (token) router.replace("/")
  }, [token, router])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      auth.setSession(await login(password))
    } catch (err) {
      const code = err instanceof ApiError ? (err.status === 429 ? "rate_limited" : err.code) : ""
      setError(errorMessages[code] ?? "Algo deu errado. Tente de novo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BrainCircuitIcon className="mx-auto mb-2 size-10 text-primary" />
          <CardTitle className="text-xl">Personal AI</CardTitle>
          <CardDescription>Digite sua senha para entrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={!!error}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" size="lg" disabled={loading || !password}>
              {loading && <Loader2Icon className="animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
