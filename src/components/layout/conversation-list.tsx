"use client"

import { useMutation } from "@tanstack/react-query"
import {
  ArchiveIcon,
  FolderIcon,
  FolderPlusIcon,
  MessageSquarePlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Settings2Icon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ProjectDialog } from "@/components/layout/project-dialog"
import { api, unwrap } from "@/lib/api"
import { dateGroup } from "@/lib/format"
import { useConversations, useFolders, useInvalidate, useUpdateConversation } from "@/lib/queries"
import type { Conversation, Folder } from "@/lib/types"
import { cn } from "@/lib/utils"

function RenameDialog({
  conversation,
  onClose,
}: {
  conversation: Conversation
  onClose: () => void
}) {
  const [title, setTitle] = useState(conversation.title ?? "")
  const update = useUpdateConversation()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear conversa</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            update.mutate(
              { id: conversation.id, title: title.trim() || null },
              { onSuccess: onClose },
            )
          }}
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
            aria-label="Título"
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewFolderDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("")
  const invalidate = useInvalidate()
  const create = useMutation({
    mutationFn: () => unwrap(api.POST("/folders", { body: { name } })),
    onSuccess: async () => {
      await invalidate("folders")
      onClose()
    },
  })
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) create.mutate()
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            placeholder="Ex.: Reforma da casa"
            aria-label="Nome do projeto"
          />
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConversationRow({
  conversation,
  onNavigate,
  onRename,
}: {
  conversation: Conversation
  onNavigate?: () => void
  onRename: () => void
}) {
  const pathname = usePathname()
  const router = useRouter()
  const active = pathname === `/c/${conversation.id}`
  const update = useUpdateConversation()
  const folders = useFolders()
  const invalidate = useInvalidate()

  async function remove() {
    await unwrap(api.DELETE("/conversations/{id}", { params: { path: { id: conversation.id } } }))
    await invalidate("conversations")
    if (active) router.push("/")
    toast("Conversa enviada para a lixeira.", {
      action: {
        label: "Desfazer",
        onClick: () =>
          void unwrap(
            api.POST("/conversations/{id}/restore", { params: { path: { id: conversation.id } } }),
          ).then(() => invalidate("conversations")),
      },
    })
  }

  return (
    <div
      className={cn(
        "group/row relative flex items-center rounded-lg hover:bg-sidebar-accent",
        active && "bg-sidebar-accent",
      )}
    >
      <Link
        href={`/c/${conversation.id}`}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className="min-w-0 flex-1 truncate py-1.5 pr-8 pl-2 text-sm"
        title={conversation.title ?? "Nova conversa"}
      >
        {conversation.pinned && <PinIcon className="mr-1 inline size-3 text-muted-foreground" />}
        {conversation.title ?? <span className="text-muted-foreground">Nova conversa</span>}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Ações da conversa"
              className="absolute right-1 opacity-0 group-hover/row:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRename}>
            <PencilIcon /> Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => update.mutate({ id: conversation.id, pinned: !conversation.pinned })}
          >
            {conversation.pinned ? <PinOffIcon /> : <PinIcon />}{" "}
            {conversation.pinned ? "Desafixar" : "Fixar"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderIcon /> Mover para projeto
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => update.mutate({ id: conversation.id, folderId: null })}
              >
                Sem projeto
              </DropdownMenuItem>
              {(folders.data ?? []).map((folder) => (
                <DropdownMenuItem
                  key={folder.id}
                  onClick={() => update.mutate({ id: conversation.id, folderId: folder.id })}
                >
                  {folder.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onClick={() =>
              update.mutate(
                { id: conversation.id, archived: true },
                { onSuccess: () => toast("Conversa arquivada.") },
              )
            }
          >
            <ArchiveIcon /> Arquivar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
            <Trash2Icon /> Mandar para a lixeira
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
  const conversations = useConversations()
  const folders = useFolders()
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [configuring, setConfiguring] = useState<Folder | null>(null)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({})
  const invalidate = useInvalidate()

  const list = conversations.data ?? []
  const pinned = list.filter((conversation) => conversation.pinned)
  const byFolder = new Map<string, Conversation[]>()
  const loose: Conversation[] = []
  for (const conversation of list) {
    if (conversation.pinned) continue
    if (conversation.folderId)
      byFolder.set(conversation.folderId, [
        ...(byFolder.get(conversation.folderId) ?? []),
        conversation,
      ])
    else loose.push(conversation)
  }
  const groups = new Map<string, Conversation[]>()
  for (const conversation of loose) {
    const group = dateGroup(conversation.updatedAt)
    groups.set(group, [...(groups.get(group) ?? []), conversation])
  }

  const row = (conversation: Conversation) => (
    <ConversationRow
      key={conversation.id}
      conversation={conversation}
      onNavigate={onNavigate}
      onRename={() => setRenaming(conversation)}
    />
  )
  const heading = (text: string) => (
    <div className="px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">{text}</div>
  )

  return (
    <div className="flex flex-col">
      {pinned.length > 0 && (
        <>
          {heading("Fixadas")}
          {pinned.map(row)}
        </>
      )}

      <div className="flex items-center justify-between pr-1">
        {heading("Projetos")}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Novo projeto"
          onClick={() => setNewFolder(true)}
        >
          <FolderPlusIcon />
        </Button>
      </div>
      {(folders.data ?? []).map((folder) => {
        const items = byFolder.get(folder.id) ?? []
        const open = openFolders[folder.id] ?? false
        return (
          <div key={folder.id}>
            <div className="group/folder flex items-center rounded-lg hover:bg-sidebar-accent">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-sm"
                aria-expanded={open}
                onClick={() => setOpenFolders((current) => ({ ...current, [folder.id]: !open }))}
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{folder.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{items.length}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Ações do projeto ${folder.name}`}
                      className="mr-1 opacity-0 group-hover/folder:opacity-100 aria-expanded:opacity-100 max-md:opacity-100"
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    render={<Link href={`/?projeto=${folder.id}`} onClick={onNavigate} />}
                  >
                    <MessageSquarePlusIcon /> Nova conversa aqui
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setConfiguring(folder)}>
                    <Settings2Icon /> Configurar projeto
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      await unwrap(
                        api.DELETE("/folders/{id}", { params: { path: { id: folder.id } } }),
                      )
                      await invalidate("folders", "conversations")
                      toast("Projeto apagado. As conversas e arquivos continuam salvos.")
                    }}
                  >
                    <Trash2Icon /> Apagar projeto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {open && (
              <div className="ml-3 border-l pl-1">
                {items.length ? (
                  items.map(row)
                ) : (
                  <p className="px-2 py-1 text-xs text-muted-foreground">Vazia</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {[...groups].map(([group, items]) => (
        <div key={group}>
          {heading(group)}
          {items.map(row)}
        </div>
      ))}
      {conversations.isSuccess && list.length === 0 && (
        <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma conversa ainda.</p>
      )}

      {renaming && <RenameDialog conversation={renaming} onClose={() => setRenaming(null)} />}
      {newFolder && <NewFolderDialog onClose={() => setNewFolder(false)} />}
      {configuring && <ProjectDialog folder={configuring} onClose={() => setConfiguring(null)} />}
    </div>
  )
}
