import { expect, test } from "@playwright/test"
import { mockApi } from "./mock-api"

test("menus de raciocínio e persona abrem, escolhem e gerenciam sem erro", async ({ page }) => {
  const errs: string[] = []
  page.on("pageerror", (e) => errs.push(e.message))
  await mockApi(page)
  await page.goto("/login")
  await page.getByLabel("Senha").fill("senha")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  await page.getByRole("button", { name: "Nível de raciocínio" }).click()
  await expect(page.getByRole("menuitemradio", { name: "Alto" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await page.getByRole("button", { name: /Persona:/ }).click()
  await page.getByRole("menuitemradio", { name: /Filosófica/ }).click()
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Persona: Filosófica" })).toBeVisible()
  await page.getByRole("button", { name: /Persona:/ }).click()
  await page.getByRole("menuitem", { name: /Gerenciar personas/ }).click()
  await expect(page.getByRole("button", { name: "Nova persona" })).toBeVisible()
  await page.getByRole("button", { name: "Nova persona" }).click()
  await expect(page.getByLabel("Prompt da persona")).toBeVisible()
  expect(errs).toEqual([])
})

test("Configurações mostra as personas", async ({ page }) => {
  const errs: string[] = []
  page.on("pageerror", (e) => errs.push(e.message))
  await mockApi(page)
  await page.goto("/login")
  await page.getByLabel("Senha").fill("senha")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
  await page.goto("/configuracoes")
  await expect(page.getByText("Prompts que definem quem responde")).toBeVisible()
  await expect(page.getByText("Filosófica")).toBeVisible()
  expect(errs).toEqual([])
})
