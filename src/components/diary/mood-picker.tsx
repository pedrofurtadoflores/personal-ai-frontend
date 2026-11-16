"use client"

import { moods } from "@/lib/diary"
import { cn } from "@/lib/utils"

/** Humor do dia: o usuário marca (a IA nunca infere). Clicar de novo no marcado limpa. */
export function MoodPicker({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: number | null
  onChange: (mood: number | null) => void
  disabled?: boolean
  size?: "sm" | "md"
}) {
  return (
    <div role="group" aria-label="Humor do dia" className="flex gap-1">
      {moods.map((mood) => (
        <button
          key={mood.value}
          type="button"
          disabled={disabled}
          aria-pressed={value === mood.value}
          aria-label={`${mood.label} (${mood.value} de 5)`}
          title={mood.label}
          className={cn(
            "rounded-lg border border-transparent leading-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50",
            size === "md" ? "size-10 text-2xl" : "size-8 text-xl",
            value === mood.value
              ? "border-primary/40 bg-primary/10"
              : value !== null && "opacity-50 hover:opacity-100",
          )}
          onClick={() => onChange(value === mood.value ? null : mood.value)}
        >
          {mood.emoji}
        </button>
      ))}
    </div>
  )
}
