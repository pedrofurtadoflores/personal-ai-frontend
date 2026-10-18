import { expect, type Page, test } from "@playwright/test"
import { mockApi, SESSION_KEY, TOKEN } from "./mock-api"

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

async function openMenuIfMobile(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click()
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

  await openMenuIfMobile(page, isMobile)
  await page.getByRole("button", { name: "Tema" }).click()
  await page.getByRole("menuitemradio", { name: "Escuro" }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  expect(problems).toEqual([])
})

test("chat: envia, recebe em streaming, mostra o chip de memória e regenera", async ({ page }) => {
  const problems = watchErrors(page)
  const { sent } = await mockApi(page)
  await loginAs(page)

  await page.getByLabel("Mensagem").fill("Oi, tudo bem?")
  await page.getByRole("button", { name: "Enviar" }).click()

  await expect(page).toHaveURL(/\/c\//)
  await expect(page.getByText("Tudo certo")).toBeVisible()
  await expect(page.locator("strong", { hasText: "Tudo certo" })).toBeVisible() // markdown renderizado
  await expect(page.getByText("Sinapse atualizada:")).toBeVisible()
  expect(sent[0]).toMatchObject({ text: "Oi, tudo bem?", parentId: null, model: "gpt-6-sol" })

  await page.getByRole("button", { name: "Regenerar (cria uma nova versão)" }).click()
  await expect(page.getByText("Segunda versão da resposta.")).toBeVisible()
  await expect(page.getByText("2/2")).toBeVisible()

  // Volta para a primeira versão.
  await page.getByRole("button", { name: "Versão anterior" }).click()
  await expect(page.getByText("Tudo certo")).toBeVisible()
  expect(problems).toEqual([])
})

test("markdown da IA não executa HTML (D36)", async ({ page }) => {
  const problems = watchErrors(page)
  await mockApi(page)
  await loginAs(page)
  await page.evaluate(() => {
    ;(window as unknown as { pwned: boolean }).pwned = false
  })
  await page.getByLabel("Mensagem").fill('<img src=x onerror="window.pwned=true">')
  await page.getByRole("button", { name: "Enviar" }).click()
  await expect(page.getByText("Tudo certo")).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { pwned: boolean }).pwned)).toBe(false)
  expect(problems).toEqual([])
})

test("todas as telas abrem sem erro nem violação de CSP", async ({ page }) => {
  const problems = watchErrors(page)
  await mockApi(page)
  await loginAs(page)
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  for (const [path, heading] of [
    ["/sinapses", "Sinapses"],
    ["/sinapses/sugestoes", "Sugestões de memória"],
    ["/sinapses/grafo", "Grafo de sinapses"],
    ["/arquivos", "Arquivos"],
    ["/uso", "Uso e custos"],
    ["/configuracoes", "Configurações"],
    ["/lixeira", "Lixeira"],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
  }
  expect(problems).toEqual([])
})

test("busca abre com Ctrl+K", async ({ page, isMobile }) => {
  test.skip(isMobile, "atalho de teclado")
  await mockApi(page)
  await loginAs(page)
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder("Buscar conversas e sinapses…")).toBeVisible()
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
  await openMenuIfMobile(page, isMobile)
  await page.getByRole("button", { name: "Sair" }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test("headers de segurança, noindex e manifesto PWA", async ({ request }) => {
  const response = await request.get("/login")
  const headers = response.headers()
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  )
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(headers["x-frame-options"]).toBe("DENY")
  expect(headers["x-robots-tag"]).toBe("noindex, nofollow")
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /")
  expect((await (await request.get("/manifest.webmanifest")).json()).name).toBe("Personal AI")
})
