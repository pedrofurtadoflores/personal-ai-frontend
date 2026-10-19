"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { BrainCircuitIcon, FileIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { SinapsePicker } from "@/components/sinapses/sinapse-picker"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError, unwrap } from "@/lib/api"
import { formatBytes } from "@/lib/format"
import { useFiles, useSinapses } from "@/lib/queries"
import type { Folder } from "@/lib/types"
import { uploadErrorText, uploadFile } from "@/lib/upload"

/**
 * Projeto (D73): instruções, sinapses fixadas e arquivos que valem para todas as conversas
 * dentro dele. Os arquivos entram na busca (RAG) e no interpretador de código.
 */
export function ProjectDialog({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(folder.name)
  const [instructions, setInstructions] = useState(folder.instructions)
  const [sinapseIds, setSinapseIds] = useState(folder.sinapseIds)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const sinapses = useSinapses()
  const files = useFiles("upload", folder.id)
  const titleOf = (id: string) =>
    sinapses.data?.sinapses.find((sinapse) => sinapse.id === id)?.title ?? "Sinapse"

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PATCH("/folders/{id}", {
          params: { path: { id: folder.id } },
          body: { name: name.trim(), instructions, sinapseIds },
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders"] })
      toast.success("Projeto salvo.")
      onClose()
    },
    onError: () => toast.error("Não foi possível salvar o projeto."),
  })

  async function upload(list: File[]) {
    for (const file of list) {
      setUploading((current) => [...current, file.name])
      try {
        await uploadFile(file, { folderId: folder.id })
      } catch (error) {
        const code = error instanceof ApiError ? error.code : ""
        toast.error(`${file.name}: ${uploadErrorText[code] ?? "Não foi possível enviar."}`)
      } finally {
        setUploading((current) => current.filter((item) => item !== file.name))
        void queryClient.invalidateQueries({ queryKey: ["files"] })
      }
    }
  }

  async function removeFile(id: string) {
    await unwrap(api.DELETE("/files/{id}", { params: { path: { id } } }))
    void queryClient.invalidateQueries({ queryKey: ["files"] })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Projeto</DialogTitle>
          <DialogDescription>
            Instruções, sinapses e arquivos daqui valem em todas as conversas do projeto.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) save.mutate()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name">Nome</Label>
            <Input
              id="project-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-instructions">Instruções do projeto</Label>
            <Textarea
              id="project-instructions"
              rows={5}
              maxLength={8_000}
              value={instructions}
              placeholder="Ex.: estou reformando a casa; orçamento máximo de R$ 300 mil; prefiro soluções simples."
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Sinapses fixadas no projeto</Label>
            <div className="flex flex-wrap gap-1.5">
              {sinapseIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-xs"
                >
                  <BrainCircuitIcon className="size-3 text-primary" /> {titleOf(id)}
                  <button
                    type="button"
                    aria-label={`Tirar ${titleOf(id)} do projeto`}
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => setSinapseIds((list) => list.filter((item) => item !== id))}
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  render={<Button type="button" variant="outline" size="xs" />}
                  disabled={sinapseIds.length >= 20}
                >
                  <PlusIcon /> Adicionar
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-0">
                  <SinapsePicker
                    exclude={sinapseIds}
                    onPick={(id) => {
                      setSinapseIds((list) => [...list, id])
                      setPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">
              Entram inteiras no contexto de toda conversa do projeto (como as sinapses fixadas).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Arquivos do projeto</Label>
            <div className="flex flex-col gap-1">
              {(files.data ?? []).map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
                >
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Apagar ${file.name}`}
                    onClick={() => void removeFile(file.id)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {uploading.map((fileName) => (
                <div
                  key={fileName}
                  className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm text-muted-foreground"
                >
                  <Loader2Icon className="size-4 animate-spin" /> {fileName}
                </div>
              ))}
              {files.isSuccess && !files.data.length && !uploading.length && (
                <p className="text-xs text-muted-foreground">Nenhum arquivo ainda.</p>
              )}
            </div>
            <label className="w-fit">
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void upload([...(event.target.files ?? [])])
                  event.target.value = ""
                }}
              />
              <span className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border px-2.5 text-xs hover:bg-muted">
                <PlusIcon className="size-3.5" /> Enviar arquivo
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
