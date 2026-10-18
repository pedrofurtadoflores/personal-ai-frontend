import type { LucideIcon } from "lucide-react"

/** Placeholder das telas que ainda não foram construídas (ver plan.md, seção 9). */
export function ComingSoon({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon
  title: string
  description: string
  phase: string
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Icon className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{phase}</span>
    </div>
  )
}
