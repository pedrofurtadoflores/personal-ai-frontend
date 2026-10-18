/**
 * URL do backend, sem barra no final ("https://api.app/" geraria "//auth/login", que dá 404).
 * Em produção a variável é obrigatória: o next.config.ts falha o build sem ela.
 */
export function resolveApiUrl(
  raw = process.env.NEXT_PUBLIC_API_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const value = raw?.trim() || (nodeEnv === "production" ? "" : "http://localhost:3333")
  if (!value) throw new Error("Defina NEXT_PUBLIC_API_URL com a URL do backend antes do build.")

  const url = new URL(value) // lança se não for uma URL válida
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_API_URL precisa usar http ou https.")
  }
  return url.toString().replace(/\/+$/, "")
}
