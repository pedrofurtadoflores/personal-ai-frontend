import { API_URL, ApiError } from "@/lib/api"
import { auth } from "@/lib/auth"

async function authedFetch(path: string, init: RequestInit) {
  const token = auth.getToken()
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  })
  if (!response.ok) {
    if (response.status === 401) auth.clear()
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, (body as { error?: string }).error ?? "request_failed")
  }
  return response
}

/** Ditado: manda o áudio gravado e devolve o texto. */
export async function transcribe(audio: Blob) {
  const form = new FormData()
  const extension = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm"
  form.append("audio", audio, `ditado.${extension}`)
  const response = await authedFetch("/audio/transcriptions", { method: "POST", body: form })
  return ((await response.json()) as { text: string }).text
}

/** Ler em voz alta: devolve uma URL `blob:` com o MP3. */
export async function speak(text: string) {
  const response = await authedFetch("/audio/speech", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // O endpoint aceita até 4.096 caracteres; respostas maiores são lidas até ali.
    body: JSON.stringify({ text: stripMarkdown(text).slice(0, 4_096) }),
  })
  return URL.createObjectURL(await response.blob())
}

/** Remove a marcação para a leitura não pronunciar asteriscos e cercas de código. */
export function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " (bloco de código) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\$\$?[^$]+\$\$?/g, " (fórmula) ")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

/** Grava do microfone; `stop()` resolve com o áudio. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
  recorder.start()
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop())
          resolve(new Blob(chunks, { type: recorder.mimeType }))
        }
        recorder.stop()
      }),
    cancel: () => {
      recorder.onstop = null
      recorder.stop()
      stream.getTracks().forEach((track) => track.stop())
    },
  }
}
