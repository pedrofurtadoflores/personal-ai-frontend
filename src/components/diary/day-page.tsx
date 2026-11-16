"use client"

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Markdown } from "@/components/chat/markdown"
import { DictationButton } from "@/components/diary/dictation"
import { MoodPicker } from "@/components/diary/mood-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ApiError } from "@/lib/api"
import { capitalize, longDate, opening, shiftDay, timeOf } from "@/lib/diary"
import { useDiaryActions, useDiaryDay, useDiaryMonth } from "@/lib/queries"
import type { DiaryDayView, DiaryEntry } from "@/lib/types"
import { cn } from "@/lib/utils"

const DRAFT_PREFIX = "personal-ai.diary.draft."

/** Rascunho no localStorage: um texto longo do diário não pode sumir num recarregamento. */
function useDraft(key: string) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_PREFIX + key) ?? ""
    } catch {
      return ""
    }
  })
  const update = (value: string) => {
    setText(value)
    try {
      if (value.trim()) localStorage.setItem(DRAFT_PREFIX + key, value)
      else localStorage.removeItem(DRAFT_PREFIX + key)
    } catch {}
  }
  return [text, update] as const
}

/** Ctrl/Cmd + Enter envia; Enter só quebra a linha (o texto do diário costuma ser longo). */
const sendsOnCtrlEnter = (action: () => void) => (event: React.KeyboardEvent) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
    event.preventDefault()
    action()
  }
}

function Thread({ entry, thinking }: { entry: DiaryEntry; thinking?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground italic">{opening[entry.kind]}</p>
      {entry.turns.map((turn) =>
        turn.role === "assistant" ? (
          <div key={turn.id} className="flex max-w-[90%] items-start gap-2">
            <SparklesIcon className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
            <p className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">{turn.text}</p>
          </div>
        ) : (
          <p
            key={turn.id}
            className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border bg-background px-3 py-2 text-sm whitespace-pre-wrap"
          >
            {turn.text}
          </p>
        ),
      )}
      {thinking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2Icon className="size-4 animate-spin" /> Pensando em uma pergunta…
        </div>
      )}
    </div>
  )
}

function ConcludeDialog({
  day,
  pending,
  onCancel,
  onConfirm,
}: {
  day: DiaryDayView["day"]
  pending: boolean
  onCancel: () => void
  onConfirm: (mood: number | null | undefined) => void
}) {
  const [mood, setMood] = useState<number | null>(day.mood)
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Concluir entrada</DialogTitle>
          <DialogDescription>
            Vou juntar as suas entradas deste dia num registro só. Quer marcar como foi o dia?
          </DialogDescription>
        </DialogHeader>
        <MoodPicker value={mood} onChange={setMood} disabled={pending} />
        <DialogFooter>
          <Button variant="ghost" disabled={pending} onClick={onCancel}>
            Continuar escrevendo
          </Button>
          <Button
            disabled={pending}
            onClick={() => onConfirm(mood === day.mood ? undefined : mood)}
          >
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" /> Condensando…
              </>
            ) : (
              "Concluir e condensar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OpenEntry({
  entry,
  day,
  actions,
}: {
  entry: DiaryEntry
  day: DiaryDayView["day"]
  actions: ReturnType<typeof useDiaryActions>
}) {
  const [text, setText] = useDraft(`entry:${entry.id}`)
  const [concluding, setConcluding] = useState(false)
  const lastRole = entry.turns.at(-1)?.role
  const asking = actions.answer.isPending
  // A última fala é do usuário quando a IA falhou em perguntar: dá para pedir de novo.
  const needsQuestion = lastRole === "user"

  function send() {
    const value = text.trim()
    if (!value || asking) return
    actions.answer.mutate(
      { entryId: entry.id, text: value },
      {
        onSuccess: () => setText(""),
        onError: () => toast.error("Não foi possível enviar. Seu texto continua aqui."),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Entrada em andamento · {timeOf(entry.createdAt)}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Thread entry={entry} thinking={asking} />
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="Sua resposta"
            rows={3}
            value={text}
            disabled={asking}
            placeholder={needsQuestion ? "Continue escrevendo…" : "Responda do seu jeito…"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={sendsOnCtrlEnter(send)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!text.trim() || asking} onClick={send}>
              Responder
            </Button>
            <Button
              variant="ghost"
              disabled={asking}
              onClick={() =>
                actions.answer.mutate(
                  { entryId: entry.id, skip: true },
                  { onError: () => toast.error("Não foi possível gerar outra pergunta.") },
                )
              }
            >
              {needsQuestion ? "Gerar uma pergunta" : "Pular pergunta"}
            </Button>
            <DictationButton
              disabled={asking}
              onText={(spoken) => setText(text ? `${text} ${spoken}` : spoken)}
            />
            <Button
              variant="outline"
              className="ml-auto"
              disabled={asking}
              onClick={() => setConcluding(true)}
            >
              Concluir entrada
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ctrl+Enter envia. A IA continua perguntando até você concluir.
          </p>
        </div>
      </CardContent>
      {concluding && (
        <ConcludeDialog
          day={day}
          pending={actions.conclude.isPending}
          onCancel={() => setConcluding(false)}
          onConfirm={(mood) =>
            actions.conclude.mutate(
              { entryId: entry.id, mood },
              {
                onSuccess: () => {
                  setConcluding(false)
                  toast.success("Entrada concluída. O dia foi condensado.")
                },
                onError: () => toast.error("Não foi possível concluir. Tente de novo."),
              },
            )
          }
        />
      )}
    </Card>
  )
}

function ConcludedEntry({
  entry,
  onDelete,
  deleting,
}: {
  entry: DiaryEntry
  onDelete: () => void
  deleting: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const questions = entry.turns.filter((turn) => turn.role === "assistant").length
  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm select-none">
        <span className="font-medium">Entrada das {timeOf(entry.createdAt)}</span>
        <span className="text-muted-foreground">
          · {entry.kind === "retro" ? "escrita depois" : "no dia"} · {questions}{" "}
          {questions === 1 ? "pergunta" : "perguntas"}
        </span>
        <ChevronRightIcon className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="flex flex-col gap-3 border-t px-4 py-4">
        <Thread entry={entry} />
        <div className="flex items-center justify-end gap-2">
          {confirming ? (
            <>
              <span className="text-xs text-muted-foreground">
                Apagar esta entrada? O dia é condensado de novo.
              </span>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(false)}>
                Não
              </Button>
              <Button variant="destructive" size="xs" disabled={deleting} onClick={onDelete}>
                Apagar
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => setConfirming(true)}>
              <Trash2Icon /> Apagar entrada
            </Button>
          )}
        </div>
      </div>
    </details>
  )
}

function NewEntry({
  date,
  view,
  actions,
}: {
  date: string
  view: DiaryDayView
  actions: ReturnType<typeof useDiaryActions>
}) {
  const [text, setText] = useDraft(`new:${date}`)
  const first = view.entries.length === 0
  const pending = actions.start.isPending

  function submit() {
    const value = text.trim()
    if (!value || pending) return
    actions.start.mutate(value, {
      onSuccess: () => setText(""),
      onError: () => toast.error("Não foi possível salvar. Seu texto continua aqui."),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className={cn(first ? "text-lg" : "text-base")}>
          {first ? view.opening : "Quer acrescentar mais alguma coisa sobre este dia?"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          aria-label="Escreva sobre o dia"
          rows={first ? 6 : 4}
          value={text}
          disabled={pending}
          placeholder="Escreva livremente…"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={sendsOnCtrlEnter(submit)}
        />
        <div className="flex items-center gap-2">
          <Button disabled={!text.trim() || pending} onClick={submit}>
            {pending ? (
              <>
                <Loader2Icon className="animate-spin" /> Salvando…
              </>
            ) : (
              "Registrar"
            )}
          </Button>
          <DictationButton
            disabled={pending}
            onText={(spoken) => setText(text ? `${text} ${spoken}` : spoken)}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            Ctrl+Enter registra. Depois, a IA faz perguntas para você refletir.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  day,
  actions,
}: {
  day: DiaryDayView["day"]
  actions: ReturnType<typeof useDiaryActions>
}) {
  const [editing, setEditing] = useState(false)
  const [summary, setSummary] = useState(day.summary)
  const [learnings, setLearnings] = useState(day.learnings.join("\n"))

  function startEditing() {
    setSummary(day.summary)
    setLearnings(day.learnings.join("\n"))
    setEditing(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Registro do dia</CardTitle>
        {!editing && (
          <Button variant="ghost" size="xs" onClick={startEditing}>
            <PencilIcon /> Editar
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editing ? (
          <>
            <Textarea
              aria-label="Texto do dia"
              rows={10}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="diary-learnings" className="text-sm font-medium">
                O que aprendi (um por linha)
              </label>
              <Textarea
                id="diary-learnings"
                rows={4}
                value={learnings}
                onChange={(event) => setLearnings(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!summary.trim() || actions.patch.isPending}
                onClick={() =>
                  actions.patch.mutate(
                    {
                      summary,
                      learnings: learnings
                        .split("\n")
                        .map((line) => line.trim())
                        .filter(Boolean),
                    },
                    {
                      onSuccess: () => setEditing(false),
                      onError: () => toast.error("Não foi possível salvar."),
                    },
                  )
                }
              >
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
            </div>
          </>
        ) : (
          <>
            <Markdown text={day.summary} />
            {day.learnings.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">O que aprendi</h3>
                <ul className="list-disc pl-5 text-sm">
                  {day.learnings.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {day.summaryEdited
                ? "Editado por você."
                : day.condensedAt
                  ? `Condensado pela IA às ${timeOf(day.condensedAt)}.`
                  : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function DayPage({ date }: { date: string }) {
  const today = useDiaryMonth().data?.today
  const view = useDiaryDay(date)
  const actions = useDiaryActions(date)

  const nav = (target: string, label: string, icon: React.ReactNode, disabled: boolean) =>
    disabled ? (
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled>
        {icon}
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        nativeButton={false}
        render={<Link href={`/diario/${target}`} />}
      >
        {icon}
      </Button>
    )

  if (view.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (view.isError || !view.data) {
    const future = view.error instanceof ApiError && view.error.code === "future_date"
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-3 p-4 md:p-8">
        <p className="text-sm text-muted-foreground">
          {future ? "Esse dia ainda não chegou." : "Não foi possível abrir este dia."}
        </p>
        <Button variant="outline" nativeButton={false} render={<Link href="/diario" />}>
          <ArrowLeftIcon /> Voltar ao diário
        </Button>
      </div>
    )
  }

  const data = view.data
  const openEntries = data.entries.filter((entry) => entry.status === "open")
  const concluded = data.entries.filter((entry) => entry.status === "concluded")

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Voltar ao diário"
          nativeButton={false}
          render={<Link href="/diario" />}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{capitalize(longDate(date))}</h1>
          {today === date && <p className="text-sm text-muted-foreground">Hoje</p>}
        </div>
        {nav(shiftDay(date, -1), "Dia anterior", <ChevronLeftIcon />, false)}
        {nav(shiftDay(date, 1), "Próximo dia", <ChevronRightIcon />, !today || date >= today)}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium">Como foi o dia?</span>
        <MoodPicker
          value={data.day.mood}
          disabled={actions.patch.isPending}
          onChange={(mood) =>
            actions.patch.mutate(
              { mood },
              { onError: () => toast.error("Não foi possível salvar.") },
            )
          }
        />
      </div>

      {data.day.summary && (
        <SummaryCard key={data.day.condensedAt ?? "x"} day={data.day} actions={actions} />
      )}

      {openEntries.map((entry) => (
        <OpenEntry key={entry.id} entry={entry} day={data.day} actions={actions} />
      ))}

      {openEntries.length === 0 && <NewEntry date={date} view={data} actions={actions} />}

      {concluded.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Entradas do dia">
          <h2 className="text-sm font-medium text-muted-foreground">
            {concluded.length === 1 ? "Entrada do dia" : `${concluded.length} entradas do dia`}
          </h2>
          {concluded.map((entry) => (
            <ConcludedEntry
              key={entry.id}
              entry={entry}
              deleting={actions.remove.isPending}
              onDelete={() =>
                actions.remove.mutate(entry.id, {
                  onSuccess: () => toast.success("Entrada apagada."),
                  onError: () => toast.error("Não foi possível apagar."),
                })
              }
            />
          ))}
        </section>
      )}
    </div>
  )
}
