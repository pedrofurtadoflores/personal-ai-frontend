import { describe, expect, it } from "vitest"
import { calendarCells, longDate, moodEmoji, shiftDay, shiftMonth } from "@/lib/diary"

describe("diário: datas", () => {
  it("anda dias e meses sem sair do calendário", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28")
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
  })

  it("o calendário começa no domingo e tem todos os dias do mês", () => {
    // 1º de novembro de 2026 é domingo; novembro tem 30 dias.
    const november = calendarCells("2026-11")
    expect(november[0]).toBe("2026-11-01")
    expect(november).toHaveLength(30)
    // 1º de janeiro de 2026 é quinta: 4 vazios antes.
    const january = calendarCells("2026-01")
    expect(january.slice(0, 5)).toEqual([null, null, null, null, "2026-01-01"])
    expect(january.at(-1)).toBe("2026-01-31")
  })

  it("formata a data por extenso em português", () => {
    expect(longDate("2026-11-16")).toBe("segunda-feira, 16 de novembro de 2026")
  })

  it("humor fora de 1 a 5 não tem emoji", () => {
    expect(moodEmoji(4)).toBe("🙂")
    expect(moodEmoji(null)).toBeNull()
    expect(moodEmoji(9)).toBeNull()
  })
})
