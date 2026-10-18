import { expect, type Page, test } from "@playwright/test"
import { E2E_API_URL } from "../playwright.config"

const SESSION_KEY = "personal-ai.session"
const TOKEN = "token-de-teste"

type MockOptions = { loginStatus?: number; retryAfter?: number; meStatus?: number }

/** Simula a API e registra os headers Authorization recebidos. */
async function mockApi(page: Page, options: MockOptions = {}) {
  const { loginStatus = 200, retryAfter, meStatus = 200 } = options
  const authHeaders: string[] = []

  await page.route(`${E2E_API_URL}/**`, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST",
      "access-control-expose-headers": "retry-after",
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors })
    const authorization = await request.headerValue("authorization")
    if (authorization) authHeaders.push(authorization)

    if (path === "/auth/login") {
      if (loginStatus === 200) {
        const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
        return route.fulfill({ status: 200, headers: cors, json: { token: TOKEN, expiresAt } })
      }
      return route.fulfill({
        status: loginStatus,
        headers: { ...cors, ...(retryAfter ? { "retry-after": String(retryAfter) } : {}) },
        json: { error: loginStatus === 401 ? "invalid_password" : "rate_limited" },
      })
    }
    if (path === "/auth/me") {
      return meStatus === 200
        ? route.fulfill({ status: 200, headers: cors, json: { authenticated: true } })
        : route.fulfill({ status: meStatus, headers: cors, json: { error: "unauthorized" } })
    }
    return route.fulfill({ status: 404, headers: cors, json: { error: "not_found" } })
  })

  return { authHeaders }
}

/** Falha o teste se o CSP bloquear algo ou se a página lançar erro. */
function watchErrors(page: Page) {
  const problems: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) {
      problems.push(message.text())
    }
  })
  page.on("pageerror", (error) => problems.push(error.message))
  return problems
}

async function loginAs(page: Page, password = "senha") {
  await page.goto("/login")
  await page.getByLabel("Senha").fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()
}

test("sem sessão, a área do app redireciona para o login", async ({ page }) => {
  const problems = watchErrors(page)
  await mockApi(page)
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible()
  expect(problems).toEqual([])
})

test("senha errada mostra a mensagem certa", async ({ page }) => {
  await mockApi(page, { loginStatus: 401 })
  await loginAs(page, "errada")
  await expect(page.getByText("Senha incorreta.")).toBeVisible()
})

test("bloqueio mostra quanto tempo esperar", async ({ page }) => {
  await mockApi(page, { loginStatus: 429, retryAfter: 240 })
  await loginAs(page)
  await expect(page.getByText("Tente de novo em 4 min.")).toBeVisible()
})

test("login abre o app, envia o token e o tema funciona sem violar o CSP", async ({
  page,
  isMobile,
}) => {
  const problems = watchErrors(page)
  const { authHeaders } = await mockApi(page)

  await loginAs(page)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  expect(authHeaders).toContain(`Bearer ${TOKEN}`)

  // Menu (celular) e dropdown de tema usam estilos inline do Base UI.
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click()
  await page.getByRole("button", { name: "Tema" }).click()
  await page.getByRole("menuitemradio", { name: "Escuro" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)

  expect(problems).toEqual([])
})

test("sessão revogada no servidor volta para o login", async ({ page }) => {
  await mockApi(page, { meStatus: 401 })
  await page.goto("/login")
  await page.evaluate(
    ([key, token]) =>
      localStorage.setItem(
        key!,
        JSON.stringify({ token, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }),
      ),
    [SESSION_KEY, TOKEN],
  )
  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull()
})

test("sair encerra a sessão", async ({ page, isMobile }) => {
  await mockApi(page)
  await loginAs(page)
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click()
  await page.getByRole("button", { name: "Sair" }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test("headers de segurança e noindex", async ({ request }) => {
  const response = await request.get("/login")
  const headers = response.headers()
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  )
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow")
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /")
})
