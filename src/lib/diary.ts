/** Humor do diário (D81): marcado só pelo usuário, de 1 a 5. */
export const moods = [
  { value: 1, emoji: "😞", label: "Muito mal" },
  { value: 2, emoji: "😕", label: "Mal" },
  { value: 3, emoji: "😐", label: "Normal" },
  { value: 4, emoji: "🙂", label: "Bem" },
  { value: 5, emoji: "😄", label: "Muito bem" },
] as const

export const moodEmoji = (value: number | null | undefined) =>
  moods.find((mood) => mood.value === value)?.emoji ?? null

/** Pergunta de abertura de cada tipo de entrada (igual à do servidor). */
export const opening = { live: "Como está sendo seu dia?", retro: "Como foi seu dia?" } as const

const utc = (date: string) => new Date(`${date}T12:00:00Z`)
const iso = (value: Date) => value.toISOString().slice(0, 10)

/** "sexta-feira, 14 de novembro de 2026" */
export function longDate(date: string) {
  return utc(date).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/** "14 de novembro" (e o ano, se não for o de `today`). */
export function shortDate(date: string, today: string) {
  return utc(date).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "long",
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
  })
}

/** "novembro de 2026" */
export function monthTitle(month: string) {
  return utc(`${month}-01`).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  })
}

export function shiftDay(date: string, days: number) {
  const value = utc(date)
  value.setUTCDate(value.getUTCDate() + days)
  return iso(value)
}

export function shiftMonth(month: string, months: number) {
  const value = utc(`${month}-01`)
  value.setUTCMonth(value.getUTCMonth() + months)
  return iso(value).slice(0, 7)
}

/** Células do calendário do mês, começando no domingo: `null` completa a semana. */
export function calendarCells(month: string) {
  const first = utc(`${month}-01`)
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate()
  return [
    ...Array.from({ length: first.getUTCDay() }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ]
}

/** Hora local de um instante ISO ("14:32"). */
export const timeOf = (isoDate: string) =>
  new Date(isoDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
