import { type NextRequest, NextResponse } from "next/server"
import { resolveApiUrl } from "@/config/api-url"

const apiUrl = new URL(resolveApiUrl())
const apiOrigin = apiUrl.origin

/**
 * Content-Security-Policy com nonce por requisição (D47). O token fica no localStorage (D33),
 * então impedir script injetado é a principal defesa contra XSS.
 *
 * - script-src: só scripts com o nonce desta resposta ('strict-dynamic' propaga para os que eles carregarem).
 * - style-src 'unsafe-inline': o Base UI posiciona menus e popovers com atributos `style`, que um nonce não cobre.
 * - connect-src: o próprio site e a API.
 */
export function buildCsp(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Só com API em https: senão as chamadas a uma API http local seriam "promovidas" e falhariam.
    ...(!isDev && apiUrl.protocol === "https:" ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development")

  // O Next lê o nonce do header da requisição e o aplica aos scripts que gera.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  return response
}

export const config = {
  matcher: [
    {
      // Arquivos estáticos não precisam de CSP; prefetches reaproveitam a página já carregada.
      source: "/((?!_next/static|_next/image|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
