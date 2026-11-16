"use client"

import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon, PenLineIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  calendarCells,
  capitalize,
  moodEmoji,
  monthTitle,
  shiftMonth,
  shortDate,
} from "@/lib/diary"
import { useDiaryMonth } from "@/lib/queries"
import type { DiarySummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const weekdays = ["D", "S", "T", "Q", "Q", "S", "S"]

function Calendar({
  month,
  today,
  days,
}: {
  month: string
  today: string
  days: Map<string, DiarySummary>
}) {
  return (
    <div
      role="grid"
      aria-label={`Calendário de ${monthTitle(month)}`}
      className="grid grid-cols-7 gap-1"
    >
      {weekdays.map((letter, index) => (
        <div
          key={index}
          role="columnheader"
          className="pb-1 text-center text-xs text-muted-foreground"
        >
          {letter}
        </div>
      ))}
      {calendarCells(month).map((date, index) => {
        if (!date) return <div key={`empty-${index}`} role="gridcell" />
        const entry = days.get(date)
        const future = date > today
        const content = (
          <>
            <span className={cn("text-xs", date === today && "font-semibold text-primary")}>
              {Number(date.slice(8))}
            </span>
            <span className="h-5 text-base leading-5" aria-hidden>
              {moodEmoji(entry?.mood) ??
                (entry?.entryCount ? <span className="text-primary">•</span> : "")}
            </span>
          </>
        )
        const className = cn(
          "flex h-14 flex-col items-center justify-center rounded-lg border border-transparent",
          date === today && "border-primary/40",
          entry && "bg-muted/60",
        )
        return future ? (
          <div key={date} role="gridcell" className={cn(className, "opacity-40")}>
            {content}
          </div>
        ) : (
          <Link
            key={date}
            role="gridcell"
            href={`/diario/${date}`}
            aria-label={`${shortDate(date, today)}${entry ? ", com registro" : ""}`}
            className={cn(
              className,
              "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            {content}
          </Link>
        )
      })}
    </div>
  )
}

export default function DiarioPage() {
  const router = useRouter()
  const [chosen, setChosen] = useState<string | undefined>()
  const month = useDiaryMonth(chosen)

  if (!month.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        {month.isError ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar o diário.</p>
        ) : (
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        )}
      </div>
    )
  }

  const { today, days } = month.data
  const current = month.data.month
  const byDate = new Map(days.map((day) => [day.date, day]))
  const isCurrentMonth = current === today.slice(0, 7)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-semibold">Diário</h1>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="diary-other-day" className="text-xs text-muted-foreground">
              Escrever sobre outro dia
            </Label>
            <Input
              id="diary-other-day"
              type="date"
              max={today}
              className="w-40"
              value=""
              onChange={(event) =>
                event.target.value && router.push(`/diario/${event.target.value}`)
              }
            />
          </div>
          <Button nativeButton={false} render={<Link href={`/diario/${today}`} />}>
            <PenLineIcon /> Escrever sobre hoje
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-label="Calendário">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mês anterior"
            onClick={() => setChosen(shiftMonth(current, -1))}
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="min-w-40 text-center font-medium" aria-live="polite">
            {capitalize(monthTitle(current))}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Próximo mês"
            disabled={isCurrentMonth}
            onClick={() => setChosen(shiftMonth(current, 1))}
          >
            <ChevronRightIcon />
          </Button>
          {!isCurrentMonth && (
            <Button variant="ghost" size="xs" onClick={() => setChosen(undefined)}>
              Mês atual
            </Button>
          )}
        </div>
        <Calendar month={current} today={today} days={byDate} />
      </section>

      <section className="flex flex-col gap-2" aria-label="Dias do mês">
        {days.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {isCurrentMonth
              ? "Nenhum registro neste mês ainda. Que tal começar contando como está sendo o seu dia?"
              : "Nenhum registro neste mês."}
          </p>
        ) : (
          days.map((day) => (
            <Link
              key={day.date}
              href={`/diario/${day.date}`}
              className="flex gap-3 rounded-xl border p-3 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="w-8 shrink-0 text-center text-2xl leading-8" aria-hidden>
                {moodEmoji(day.mood) ?? "📓"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {capitalize(shortDate(day.date, today))}
                  {day.openCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">
                      entrada em andamento
                    </span>
                  )}
                </div>
                {day.summary ? (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{day.summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Ainda sem registro condensado.
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  )
}
