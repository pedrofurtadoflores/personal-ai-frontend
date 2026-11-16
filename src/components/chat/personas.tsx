"use client"

import { DramaIcon, PencilIcon, PlusIcon, Settings2Icon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDeletePersona, usePersonas, useSavePersona } from "@/lib/queries"
import type { Persona } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Valor do item "Padrão" no menu (o Base UI não aceita `null` como valor de rádio). */
const DEFAULT = "default"

/**
 * Persona que responde (D80). Escolher aqui vale para as próximas respostas da conversa;
 * cada resposta guarda quem a gerou.
 */
export function PersonaPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (personaId: string | null) => void
}) {
  const personas = usePersonas()
  const [managing, setManaging] = useState(false)
  const current = (personas.data ?? []).find((persona) => persona.id === value)

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("max-w-40 gap-1 font-normal", current && "text-primary")}
                    aria-label={`Persona: ${current?.name ?? "Padrão"}`}
                  />
                }
              />
            }
          >
            {current?.emoji ? (
              <span className="text-sm leading-none">{current.emoji}</span>
            ) : (
              <DramaIcon className="size-3.5" />
            )}
            <span className="hidden truncate sm:inline">{current?.name ?? "Padrão"}</span>
          </TooltipTrigger>
          <TooltipContent>Quem responde (persona)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Persona</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current?.id ?? DEFAULT}
            onValueChange={(next: string) => onChange(next === DEFAULT ? null : next)}
          >
            <DropdownMenuRadioItem value={DEFAULT}>
              <PersonaLabel name="Padrão" description="Sem prompt específico" />
            </DropdownMenuRadioItem>
            {(personas.data ?? []).map((persona) => (
              <DropdownMenuRadioItem key={persona.id} value={persona.id}>
                <PersonaLabel
                  emoji={persona.emoji}
                  name={persona.name}
                  description={persona.description}
                />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setManaging(true)}>
            <Settings2Icon /> Gerenciar personas…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {managing && (
        <Dialog open onOpenChange={(open) => !open && setManaging(false)}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Personas</DialogTitle>
              <DialogDescription>
                Cada persona é um prompt que define quem responde. Troque a qualquer momento no
                chat; vale para as próximas respostas.
              </DialogDescription>
            </DialogHeader>
            <PersonaManager />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function PersonaLabel({
  emoji,
  name,
  description,
}: {
  emoji?: string | null
  name: string
  description?: string
}) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <span className="w-4 shrink-0 text-center leading-5">{emoji ?? ""}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{name}</span>
        {description && (
          <span className="line-clamp-1 text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </span>
  )
}

type Draft = { id?: string; name: string; emoji: string; description: string; instructions: string }

const emptyDraft: Draft = { name: "", emoji: "", description: "", instructions: "" }

/** Lista com criar, editar e apagar. Usada no diálogo do chat e em Configurações. */
export function PersonaManager() {
  const personas = usePersonas()
  const save = useSavePersona()
  const remove = useDeletePersona()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const edit = (persona: Persona) =>
    setDraft({
      id: persona.id,
      name: persona.name,
      emoji: persona.emoji ?? "",
      description: persona.description,
      instructions: persona.instructions,
    })

  if (draft) {
    const valid = draft.name.trim() && draft.instructions.trim()
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          save.mutate(
            {
              ...(draft.id ? { id: draft.id } : {}),
              name: draft.name.trim(),
              emoji: draft.emoji.trim() || null,
              description: draft.description.trim(),
              instructions: draft.instructions.trim(),
            },
            {
              onSuccess: () => {
                toast.success(draft.id ? "Persona salva." : "Persona criada.")
                setDraft(null)
              },
              onError: () => toast.error("Não foi possível salvar a persona."),
            },
          )
        }}
      >
        <div className="flex gap-2">
          <div className="flex w-20 flex-col gap-1.5">
            <Label htmlFor="persona-emoji">Emoji</Label>
            <Input
              id="persona-emoji"
              value={draft.emoji}
              maxLength={16}
              placeholder="🦉"
              className="text-center"
              onChange={(event) => setDraft({ ...draft, emoji: event.target.value })}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="persona-name">Nome</Label>
            <Input
              id="persona-name"
              value={draft.name}
              maxLength={40}
              autoFocus
              placeholder="Filosófica"
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="persona-description">Descrição curta</Label>
          <Input
            id="persona-description"
            value={draft.description}
            maxLength={160}
            placeholder="Responde com perguntas, sem entregar a solução"
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="persona-instructions">Prompt da persona</Label>
          <Textarea
            id="persona-instructions"
            rows={9}
            maxLength={8_000}
            value={draft.instructions}
            placeholder="Como ela deve responder: tom, postura, formato, o que evitar…"
            onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Soma-se às instruções gerais e à memória; no estilo, a persona prevalece.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!valid || save.isPending}>
            {draft.id ? "Salvar" : "Criar persona"}
          </Button>
        </div>
      </form>
    )
  }

  const list = personas.data ?? []
  return (
    <div className="flex flex-col gap-2">
      {list.length === 0 && !personas.isLoading && (
        <p className="text-sm text-muted-foreground">
          Nenhuma persona ainda. Sem persona, o chat usa o jeito padrão de responder.
        </p>
      )}
      {list.map((persona) => (
        <div key={persona.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
          <span className="w-5 shrink-0 text-center">{persona.emoji ?? "🎭"}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{persona.name}</div>
            <div className="line-clamp-1 text-xs text-muted-foreground">
              {persona.description || persona.instructions}
            </div>
          </div>
          {confirming === persona.id ? (
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-muted-foreground">Apagar?</span>
              <Button variant="ghost" size="xs" onClick={() => setConfirming(null)}>
                Não
              </Button>
              <Button
                variant="destructive"
                size="xs"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(persona.id, {
                    onSuccess: () => {
                      setConfirming(null)
                      toast.success("Persona apagada.")
                    },
                    onError: () => toast.error("Não foi possível apagar."),
                  })
                }
              >
                Apagar
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${persona.name}`}
                onClick={() => edit(persona)}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Apagar ${persona.name}`}
                onClick={() => setConfirming(persona.id)}
              >
                <Trash2Icon />
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => setDraft({ ...emptyDraft })}
      >
        <PlusIcon /> Nova persona
      </Button>
    </div>
  )
}
