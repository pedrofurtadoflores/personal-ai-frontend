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
 * - connect-src: o próprio site, a API, o R2 (upload direto com URL assinada) e a OpenAI
 *   (só o WebRTC do modo voz, com token efêmero).
 * - img-src/media-src: imagens assinadas do R2 e áudio `blob:` da leitura em voz alta.
 */
const R2 = "https://*.r2.cloudflarestorage.com"
const OPENAI_REALTIME = "https://api.openai.com"

export function buildCsp(nonce: string, isDev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${R2}`,
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin} ${R2} ${OPENAI_REALTIME}${isDev ? " ws:" : ""}`,
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
      source: "/((?!_next/static|_next/image|icon.svg|robots.txt|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
