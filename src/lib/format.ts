const usd = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})
const usdPrecise = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 3,
})

/** US$ com precisão útil: centavos para valores normais, 3 dígitos para frações de centavo. */
export function formatUsd(value: number) {
  if (value === 0) return usd.format(0)
  return Math.abs(value) < 0.01 ? usdPrecise.format(value) : usd.format(value)
}

export const formatNumber = (value: number) => new Intl.NumberFormat("pt-BR").format(value)

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

export function formatRelative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return "agora"
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute")
  if (abs < 86_400) return relative.format(Math.round(diff / 3600), "hour")
  if (abs < 86_400 * 30) return relative.format(Math.round(diff / 86_400), "day")
  return new Date(iso).toLocaleDateString("pt-BR")
}

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

/** Grupo da sidebar: Hoje, Ontem, 7 dias, 30 dias, mês/ano. */
export function dateGroup(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Math.floor((today.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return "Hoje"
  if (days === 1) return "Ontem"
  if (days < 7) return "Últimos 7 dias"
  if (days < 30) return "Últimos 30 dias"
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}
