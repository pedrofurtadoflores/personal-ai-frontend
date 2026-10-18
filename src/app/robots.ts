import type { MetadataRoute } from "next"

/** App pessoal: nada deve ser indexado por buscadores. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } }
}
