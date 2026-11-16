"use client"

import { Loader2Icon, MicIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { startRecording, transcribe } from "@/lib/audio"

/** Ditado por voz: grava, transcreve e entrega o texto (mesmo fluxo do composer do chat). */
export function DictationButton({
  onText,
  disabled,
}: {
  onText: (text: string) => void
  disabled?: boolean
}) {
  const [state, setState] = useState<null | "recording" | "transcribing">(null)
  const recorder = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)

  // Saindo da tela no meio da gravação: solta o microfone.
  useEffect(() => () => recorder.current?.cancel(), [])

  async function toggle() {
    if (state === "recording") {
      setState("transcribing")
      try {
        const audio = await recorder.current!.stop()
        onText(await transcribe(audio))
      } catch {
        toast.error("Não foi possível transcrever o áudio.")
      } finally {
        recorder.current = null
        setState(null)
      }
      return
    }
    try {
      recorder.current = await startRecording()
      setState("recording")
    } catch {
      toast.error("Sem acesso ao microfone.")
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={state === "recording" ? "destructive" : "ghost"}
            size="icon"
            aria-label={state === "recording" ? "Parar ditado" : "Ditar"}
            disabled={disabled || state === "transcribing"}
            onClick={toggle}
          />
        }
      >
        {state === "transcribing" ? <Loader2Icon className="animate-spin" /> : <MicIcon />}
      </TooltipTrigger>
      <TooltipContent>{state === "recording" ? "Parar e transcrever" : "Ditar"}</TooltipContent>
    </Tooltip>
  )
}
