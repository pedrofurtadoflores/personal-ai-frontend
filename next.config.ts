import type { NextConfig } from "next"

// Sem isto, um deploy na Vercel sem a variável apontaria silenciosamente para localhost.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error("Defina NEXT_PUBLIC_API_URL com a URL do backend antes do build.")
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
}

export default nextConfig
