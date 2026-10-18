"use client"

import { useQueryClient } from "@tanstack/react-query"
import { AudioLinesIcon, Loader2Icon, MicOffIcon, PhoneOffIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { api, unwrap } from "@/lib/api"

/** Endpoint WebRTC da Realtime API; o navegador fala direto com a OpenAI com um token efêmero. */
const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls"

type Turn = { role: "user" | "assistant"; text: string }
type Usage = {
  textIn: number
  textCached: number
  textOut: number
  audioIn: number
  audioCached: number
  audioOut: number
}

type RealtimeUsage = {
  input_token_details?: {
    text_tokens?: number
    audio_tokens?: number
    cached_tokens_details?: { text_tokens?: number; audio_tokens?: number }
  }
  output_token_details?: { text_tokens?: number; audio_tokens?: number }
}

/**
 * Modo voz em tempo real (Fase 9): a sessão usa as instruções e a memória da conversa.
 * Ao encerrar, a transcrição vira mensagens da conversa e o consumo é registrado.
 */
export function VoiceMode({
  conversationId,
  open,
  onClose,
}: {
  conversationId: string
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<"connecting" | "live" | "saving">("connecting")
  const [muted, setMuted] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [speaking, setSpeaking] = useState<"user" | "assistant" | null>(null)
  const session = useRef<{
    pc: RTCPeerConnection
    mic: MediaStream
    audio: HTMLAudioElement
  } | null>(null)
  const usage = useRef<Usage>({
    textIn: 0,
    textCached: 0,
    textOut: 0,
    audioIn: 0,
    audioCached: 0,
    audioOut: 0,
  })
  const turnsRef = useRef<Turn[]>([])
  // Em ref: o pai passa uma função nova a cada render, e ela não pode reabrir a conexão.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    // O componente é montado novo a cada abertura: os estados já começam zerados.
    let cancelled = false

    void (async () => {
      try {
        const { clientSecret } = await unwrap(
          api.POST("/realtime/session", { body: { conversationId } }),
        )
        const pc = new RTCPeerConnection()
        const audio = new Audio()
        audio.autoplay = true
        pc.ontrack = (event) => {
          audio.srcObject = event.streams[0] ?? null
        }
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
        mic.getTracks().forEach((track) => pc.addTrack(track, mic))

        const channel = pc.createDataChannel("oai-events")
        channel.onmessage = (message) => {
          const event = JSON.parse(String(message.data)) as {
            type: string
            transcript?: string
            response?: { usage?: RealtimeUsage }
          }
          if (event.type === "input_audio_buffer.speech_started") setSpeaking("user")
          if (
            event.type === "conversation.item.input_audio_transcription.completed" &&
            event.transcript?.trim()
          ) {
            turnsRef.current.push({ role: "user", text: event.transcript.trim() })
            setTurns([...turnsRef.current])
          }
          if (event.type === "response.output_audio_transcript.done" && event.transcript?.trim()) {
            turnsRef.current.push({ role: "assistant", text: event.transcript.trim() })
            setTurns([...turnsRef.current])
            setSpeaking(null)
          }
          if (event.type === "response.created") setSpeaking("assistant")
          if (event.type === "response.done" && event.response?.usage) {
            const u = event.response.usage
            const current = usage.current
            current.textIn += u.input_token_details?.text_tokens ?? 0
            current.audioIn += u.input_token_details?.audio_tokens ?? 0
            current.textCached += u.input_token_details?.cached_tokens_details?.text_tokens ?? 0
            current.audioCached += u.input_token_details?.cached_tokens_details?.audio_tokens ?? 0
            current.textOut += u.output_token_details?.text_tokens ?? 0
            current.audioOut += u.output_token_details?.audio_tokens ?? 0
          }
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        const answer = await fetch(REALTIME_CALLS_URL, {
          method: "POST",
          body: offer.sdp,
          headers: { authorization: `Bearer ${clientSecret}`, "content-type": "application/sdp" },
        })
        if (!answer.ok) throw new Error(`Realtime respondeu ${answer.status}`)
        await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() })

        if (cancelled) {
          pc.close()
          mic.getTracks().forEach((track) => track.stop())
          return
        }
        session.current = { pc, mic, audio }
        setState("live")
      } catch {
        if (!cancelled) {
          toast.error("Não foi possível iniciar o modo voz (microfone ou conexão).")
          onCloseRef.current()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, conversationId])

  async function hangUp() {
    setState("saving")
    const current = session.current
    current?.pc.close()
    current?.mic.getTracks().forEach((track) => track.stop())
    current?.audio.pause()
    session.current = null
    try {
      if (turnsRef.current.length) {
        await unwrap(
          api.POST("/conversations/{id}/voice-turns", {
            params: { path: { id: conversationId } },
            body: { turns: turnsRef.current, usage: usage.current },
          }),
        )
        await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] })
      }
    } catch {
      toast.error("Não foi possível salvar a transcrição da conversa por voz.")
    } finally {
      onCloseRef.current()
    }
  }

  function toggleMute() {
    session.current?.mic.getAudioTracks().forEach((track) => (track.enabled = muted))
    setMuted(!muted)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && state === "live" && void hangUp()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogTitle>Modo voz</DialogTitle>
        <DialogDescription>
          {state === "connecting"
            ? "Conectando…"
            : state === "saving"
              ? "Salvando a conversa…"
              : "Pode falar. A transcrição fica salva na conversa."}
        </DialogDescription>

        <div className="flex flex-col items-center gap-4 py-4">
          <div
            className={`flex size-28 items-center justify-center rounded-full border-4 transition-all ${
              speaking === "assistant"
                ? "scale-110 border-primary"
                : speaking === "user"
                  ? "border-emerald-500"
                  : "border-muted"
            }`}
          >
            {state === "live" ? (
              <AudioLinesIcon className="size-10" />
            ) : (
              <Loader2Icon className="size-10 animate-spin" />
            )}
          </div>
          <div className="max-h-48 w-full space-y-1.5 overflow-y-auto text-sm">
            {turns.slice(-6).map((turn, index) => (
              <p
                key={index}
                className={turn.role === "user" ? "text-right text-muted-foreground" : ""}
              >
                {turn.text}
              </p>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="outline" size="lg" onClick={toggleMute} disabled={state !== "live"}>
            <MicOffIcon /> {muted ? "Ativar microfone" : "Silenciar"}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => void hangUp()}
            disabled={state === "saving"}
          >
            <PhoneOffIcon /> Encerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
