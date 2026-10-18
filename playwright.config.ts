import { defineConfig, devices } from "@playwright/test"

/** A API é simulada nos testes (page.route); este host nunca é acessado de verdade. */
export const E2E_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.example.invalid"
const PORT = 3100

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      // Localmente usa o Chrome instalado; na CI, o Chromium do Playwright.
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  // Build de produção: é nele que o CSP com nonce vale de verdade.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_URL: E2E_API_URL },
  },
})
