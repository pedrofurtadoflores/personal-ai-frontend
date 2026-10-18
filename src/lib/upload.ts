import { api, ApiError, unwrap } from "@/lib/api"
import type { FileItem } from "@/lib/types"

const MAX_BYTES = 50 * 1024 * 1024

/** Tipo do arquivo; alguns navegadores deixam vazio para .md, .csv etc. */
function mimeOf(file: File) {
  if (file.type) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase()
  const byExt: Record<string, string> = {
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
  }
  return byExt[ext ?? ""] ?? "application/octet-stream"
}

/**
 * Upload em 3 passos: o backend devolve uma URL assinada, o navegador manda o arquivo
 * direto para o R2 e depois confirma (o backend então extrai o texto e indexa).
 */
export async function uploadFile(
  file: File,
  {
    conversationId,
    onProgress,
  }: { conversationId?: string | null; onProgress?: (ratio: number) => void } = {},
): Promise<FileItem> {
  if (file.size > MAX_BYTES) throw new ApiError(413, "payload_too_large")
  const mime = mimeOf(file)
  const { file: created, uploadUrl } = await unwrap(
    api.POST("/files", {
      body: { name: file.name, mime, size: file.size, conversationId: conversationId ?? null },
    }),
  )

  await new Promise<void>((resolve, reject) => {
    // XHR (e não fetch) para ter o progresso do envio.
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("content-type", mime)
    xhr.upload.onprogress = (event) =>
      event.lengthComputable && onProgress?.(event.loaded / event.total)
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "upload_failed"))
    xhr.onerror = () => reject(new ApiError(0, "upload_blocked"))
    xhr.send(file)
  })

  return unwrap(api.POST("/files/{id}/complete", { params: { path: { id: created.id } } }))
}

export const uploadErrorText: Record<string, string> = {
  payload_too_large: "O limite é de 50 MB por arquivo.",
  unsupported_media_type: "Tipo de arquivo não suportado (use imagem, PDF, DOCX ou texto).",
  upload_blocked: "O envio para o armazenamento foi bloqueado (confira o CORS do bucket R2).",
  upload_failed: "O armazenamento recusou o arquivo.",
  storage_not_configured: "O armazenamento (R2) não está configurado no backend.",
}
