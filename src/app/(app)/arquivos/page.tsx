"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, ApiError, unwrap } from "@/lib/api"
import { formatBytes, formatRelative } from "@/lib/format"
import { useFiles, useImages, useInvalidate } from "@/lib/queries"
import type { FileItem } from "@/lib/types"
import { uploadErrorText, uploadFile } from "@/lib/upload"

const statusLabel: Record<
  FileItem["status"],
  { text: string; variant: "secondary" | "outline" | "destructive" }
> = {
  pending: { text: "enviando", variant: "outline" },
  uploaded: { text: "na fila", variant: "outline" },
  processing: { text: "processando", variant: "outline" },
  ready: { text: "pronto", variant: "secondary" },
  error: { text: "erro", variant: "destructive" },
}

function FileDetail({ file, onClose }: { file: FileItem; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ["file", file.id],
    queryFn: () => unwrap(api.GET("/files/{id}", { params: { path: { id: file.id }, query: {} } })),
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file.name}</DialogTitle>
        </DialogHeader>
        {!detail.data ? (
          <Loader2Icon className="mx-auto size-5 animate-spin" />
        ) : file.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={detail.data.url}
            alt={file.name}
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        ) : (
          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {detail.data.extractedText ?? "Sem texto extraído."}
          </pre>
        )}
        {file.error && <p className="text-sm text-destructive">{file.error}</p>}
      </DialogContent>
    </Dialog>
  )
}

export default function ArquivosPage() {
  const files = useFiles("upload")
  const images = useImages()
  const invalidate = useInvalidate()
  const [uploading, setUploading] = useState(0)
  const [selected, setSelected] = useState<FileItem | null>(null)

  async function upload(list: File[]) {
    setUploading((count) => count + list.length)
    await Promise.all(
      list.map((file) =>
        uploadFile(file)
          .catch((error: unknown) => {
            const code = error instanceof ApiError ? error.code : ""
            toast.error(`${file.name}: ${uploadErrorText[code] ?? "falhou."}`)
          })
          .finally(() => setUploading((count) => count - 1)),
      ),
    )
    await invalidate("files")
  }

  const remove = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/files/{id}", { params: { path: { id } } })),
    onSuccess: () => invalidate("files", "images"),
  })
  const reprocess = useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/files/{id}/reprocess", { params: { path: { id } } })),
    onSuccess: () => invalidate("files"),
  })

  async function download(file: FileItem) {
    const { url } = await unwrap(
      api.GET("/files/{id}", { params: { path: { id: file.id }, query: { download: "true" } } }),
    )
    window.open(url, "_blank", "noopener")
  }

  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 md:p-8"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void upload([...event.dataTransfer.files])
      }}
    >
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">Arquivos</h1>
        <label>
          <input
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => void upload([...(event.target.files ?? [])])}
          />
          <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80">
            {uploading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <UploadIcon className="size-4" />
            )}{" "}
            Enviar
          </span>
        </label>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        Arraste arquivos para cá. PDFs, DOCX e textos são lidos e indexados para o chat consultar;
        imagens vão para a visão do modelo.
      </p>

      <Tabs defaultValue="uploads">
        <TabsList>
          <TabsTrigger value="uploads">
            <FileTextIcon /> Enviados
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon /> Imagens geradas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uploads" className="pt-3">
          {files.isLoading ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : files.data?.length ? (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Tamanho</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Quando</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {files.data.map((file) => (
                    <tr key={file.id} className="border-t">
                      <td className="max-w-72 px-3 py-2">
                        <button
                          className="truncate text-left hover:underline"
                          onClick={() => setSelected(file)}
                          title={file.name}
                        >
                          {file.name}
                        </button>
                        {file.conversationId && (
                          <Link
                            href={`/c/${file.conversationId}`}
                            className="block text-xs text-muted-foreground hover:underline"
                          >
                            ver conversa
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {formatBytes(file.size)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={statusLabel[file.status].variant}>
                          {statusLabel[file.status].text}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatRelative(file.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Baixar"
                            onClick={() => void download(file)}
                          >
                            <DownloadIcon />
                          </Button>
                          {file.status === "error" && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="Processar de novo"
                              onClick={() => reprocess.mutate(file.id)}
                            >
                              <RefreshCwIcon />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Apagar"
                            onClick={() => remove.mutate(file.id)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhum arquivo enviado.
            </p>
          )}
        </TabsContent>

        <TabsContent value="images" className="pt-3">
          {images.data?.length ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {images.data.map((image) => (
                <figure
                  key={image.fileId}
                  className="group relative overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="line-clamp-2 flex-1">{image.prompt}</span>
                    {image.conversationId && (
                      <Link
                        href={`/c/${image.conversationId}`}
                        aria-label="Abrir conversa"
                        className="rounded p-1 hover:bg-white/20"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </Link>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Nenhuma imagem gerada. No chat, ligue o botão de imagem e peça uma.
            </p>
          )}
        </TabsContent>
      </Tabs>

      {selected && <FileDetail file={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
