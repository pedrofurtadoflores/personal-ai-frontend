import { describe, expect, it } from "vitest"
import { stripMarkdown } from "@/lib/audio"

describe("stripMarkdown (leitura em voz alta)", () => {
  it("remove marcação, troca código e fórmulas por avisos curtos", () => {
    const text =
      "# Título\n\n**Negrito** e `código` com [link](https://x.com).\n\n```js\nconst a = 1\n```\n\nFórmula: $E=mc^2$"
    const spoken = stripMarkdown(text)
    expect(spoken).not.toMatch(/[#*`[\]$]/)
    expect(spoken).toContain("Negrito e código com link")
    expect(spoken).toContain("(bloco de código)")
    expect(spoken).toContain("(fórmula)")
  })
})
