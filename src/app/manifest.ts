import type { MetadataRoute } from "next"

/** PWA: permite "instalar" o app no celular e no desktop (Fase 10). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal AI",
    short_name: "Personal AI",
    description: "Meu chat pessoal com memória em sinapses",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "pt-BR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  }
}
