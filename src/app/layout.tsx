import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
import { Providers } from "@/components/providers"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Personal AI",
  description: "Meu chat pessoal com memória em sinapses",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Ler o header torna todas as páginas dinâmicas, o que o nonce do CSP exige (D47).
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      {/* h-dvh: no celular acompanha a barra de endereço (100vh/h-full cortam o rodapé). */}
      <body className="flex h-dvh flex-col">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  )
}
