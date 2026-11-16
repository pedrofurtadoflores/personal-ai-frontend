import { expect, type Page, test } from "@playwright/test"
import { mockApi } from "./mock-api"

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

async function enter(page: Page) {
  await mockApi(page)
  await page.goto("/login")
  await page.getByLabel("Senha").fill("senha")
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByText("Como posso ajudar?")).toBeVisible()
}

async function openDiary(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Menu" }).click()
  await page.getByRole("link", { name: "Diário", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Diário", exact: true })).toBeVisible()
}

test("o menu leva ao Diário e hoje abre com a pergunta de abertura", async ({ page, isMobile }) => {
  const problems = watchErrors(page)
  await enter(page)
  await openDiary(page, isMobile)
  await expect(page.getByText("Nenhum registro neste mês ainda")).toBeVisible()
  await page.getByRole("button", { name: "Escrever sobre hoje" }).click()
  await expect(page.getByText("Como está sendo seu dia?")).toBeVisible()
  await expect(page.getByText("Hoje", { exact: true })).toBeVisible()
  expect(problems).toEqual([])
})

test("escreve, responde várias perguntas, pula, conclui com humor e condensa", async ({
  page,
  isMobile,
}) => {
  const problems = watchErrors(page)
  await enter(page)
  await openDiary(page, isMobile)
  await page.getByRole("button", { name: "Escrever sobre hoje" }).click()

  await page.getByLabel("Escreva sobre o dia").fill("Hoje foi um dia corrido no trabalho.")
  await page.getByRole("button", { name: "Registrar" }).click()
  await expect(page.getByText(/Pergunta \d+: como você se sentiu/)).toHaveCount(1)
  await expect(page.getByText("Entrada em andamento")).toBeVisible()

  // Mais de três respostas: a IA segue perguntando até concluir.
  for (const [index, answer] of ["Cansado", "Orgulhoso", "Ansioso", "Aliviado"].entries()) {
    await page.getByLabel("Sua resposta").fill(answer)
    await page.getByRole("button", { name: "Responder" }).click()
    await expect(page.getByText(/Pergunta \d+: como você se sentiu/)).toHaveCount(index + 2)
  }
  await page.getByRole("button", { name: "Pular pergunta" }).click()
  await expect(page.getByText(/Pergunta \d+: como você se sentiu/)).toHaveCount(6)

  await page.getByRole("button", { name: "Concluir entrada" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Bem (4 de 5)" }).click()
  await dialog.getByRole("button", { name: "Concluir e condensar" }).click()

  await expect(page.getByText("Registro do dia")).toBeVisible()
  await expect(page.getByText(/Resumo do dia: Hoje foi um dia corrido/)).toBeVisible()
  await expect(page.getByText("Aprendi a registrar o dia.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Bem (4 de 5)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
  await expect(page.getByText("Entrada do dia", { exact: true })).toBeVisible()

  // Mais uma entrada no mesmo dia: ao concluir, o dia é condensado de novo.
  await expect(page.getByText("Quer acrescentar mais alguma coisa sobre este dia?")).toBeVisible()
  await page.getByLabel("Escreva sobre o dia").fill("À noite jantei com a família.")
  await page.getByRole("button", { name: "Registrar" }).click()
  await page.getByRole("button", { name: "Concluir entrada" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Concluir e condensar" }).click()
  await expect(page.getByText("2 entradas do dia")).toBeVisible()
  await expect(page.getByText(/jantei com a família/).first()).toBeVisible()

  // O calendário mostra o dia com o humor marcado.
  await page.getByRole("button", { name: "Voltar ao diário" }).click()
  await expect(page.getByText(/Resumo do dia: Hoje foi um dia corrido/)).toBeVisible()
  await expect(page.getByRole("gridcell", { name: /com registro/ })).toBeVisible()
  expect(problems).toEqual([])
})

test("dá para escrever sobre o dia anterior e editar o registro", async ({ page, isMobile }) => {
  await enter(page)
  await openDiary(page, isMobile)
  await page.getByRole("button", { name: "Escrever sobre hoje" }).click()
  await page.getByRole("button", { name: "Dia anterior" }).click()

  // Dia passado: a pergunta muda para "Como foi seu dia?" e o próximo dia leva de volta a hoje.
  await expect(page.getByText("Como foi seu dia?", { exact: true }).first()).toBeVisible()
  await page.getByLabel("Escreva sobre o dia").fill("Ontem fui ao cinema.")
  await page.getByRole("button", { name: "Registrar" }).click()
  await page.getByRole("button", { name: "Concluir entrada" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Concluir e condensar" }).click()
  await expect(page.getByText(/Resumo do dia: Ontem fui ao cinema/)).toBeVisible()

  await page.getByRole("button", { name: "Editar" }).click()
  await page.getByLabel("Texto do dia").fill("Ontem fui ao cinema com a Ana.")
  await page.getByRole("button", { name: "Salvar" }).click()
  await expect(page.getByText("Ontem fui ao cinema com a Ana.")).toBeVisible()
  await expect(page.getByText("Editado por você.")).toBeVisible()

  // Humor pode ser marcado e desmarcado a qualquer momento.
  const happy = page.getByRole("button", { name: "Muito bem (5 de 5)" })
  await happy.click()
  await expect(happy).toHaveAttribute("aria-pressed", "true")
  await happy.click()
  await expect(happy).toHaveAttribute("aria-pressed", "false")

  await page.getByRole("button", { name: "Próximo dia" }).click()
  await expect(page.getByText("Hoje", { exact: true })).toBeVisible()
})

test("dia que ainda não chegou não abre", async ({ page }) => {
  await enter(page)
  await page.goto("/diario/2999-01-01")
  await expect(page.getByText("Esse dia ainda não chegou.")).toBeVisible()
})
