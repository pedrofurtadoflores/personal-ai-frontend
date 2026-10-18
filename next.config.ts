import type { NextConfig } from "next"
import { resolveApiUrl } from "./src/config/api-url"

// Valida já no build: sem a variável (ou com URL inválida) um deploy na Vercel apontaria
// silenciosamente para localhost.
resolveApiUrl()

/** Headers fixos. O Content-Security-Policy tem nonce por requisição e fica em src/proxy.ts. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microfone liberado só para o próprio site (ditado e modo voz, Fase 9).
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // O CSP com nonce exige renderização dinâmica, incompatível com cacheComponents/PPR (D47).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
