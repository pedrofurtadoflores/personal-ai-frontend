"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useUpdateConversation } from "@/lib/queries"
import type { Conversation } from "@/lib/types"

/** Instruções e temperatura só desta conversa (seção 5 do plano, D71). */
export function ConversationSettingsDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation
  onClose: () => void
}) {
  const settings = conversation.settings as { temperature?: number | null }
  const [systemPrompt, setSystemPrompt] = useState(conversation.systemPrompt ?? "")
  const [temperature, setTemperature] = useState(
    settings.temperature == null ? "" : String(settings.temperature),
  )
  const update = useUpdateConversation()
  const parsed = temperature.trim() === "" ? null : Number(temperature.replace(",", "."))
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 2)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar esta conversa</DialogTitle>
          <DialogDescription>
            Vale só aqui, somado às instruções gerais e às do projeto.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (invalid) return
            update.mutate(
              {
                id: conversation.id,
                systemPrompt: systemPrompt.trim() || null,
                settings: { temperature: parsed },
              },
              {
                onSuccess: () => {
                  toast.success("Conversa configurada.")
                  onClose()
                },
                onError: () => toast.error("Não foi possível salvar."),
              },
            )
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conversation-prompt">Instruções desta conversa</Label>
            <Textarea
              id="conversation-prompt"
              rows={6}
              maxLength={8_000}
              value={systemPrompt}
              placeholder="Ex.: aja como revisor técnico e seja direto."
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conversation-temperature">Temperatura</Label>
            <Input
              id="conversation-temperature"
              inputMode="decimal"
              className="w-32"
              placeholder="padrão"
              value={temperature}
              aria-invalid={invalid}
              onChange={(event) => setTemperature(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              De 0 (mais previsível) a 2 (mais criativa). Vazio usa o padrão do modelo. Modelos com
              raciocínio ignoram esse ajuste.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={invalid || update.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
