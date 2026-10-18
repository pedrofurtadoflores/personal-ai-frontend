import type { Message } from "@/lib/types"

/**
 * As mensagens formam uma árvore (D17): editar ou regenerar cria um irmão.
 * O ramo exibido vai da raiz até a folha atual da conversa.
 */
export type Tree = {
  byId: Map<string, Message>
  children: Map<string | null, Message[]>
}

export function buildTree(messages: Message[]): Tree {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const children = new Map<string | null, Message[]>()
  for (const message of messages) {
    const key = message.parentId && byId.has(message.parentId) ? message.parentId : null
    const list = children.get(key) ?? []
    list.push(message)
    children.set(key, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { byId, children }
}

/** Caminho da raiz até a folha (o que aparece na tela). */
export function branch(tree: Tree, leafId: string | null): Message[] {
  const path: Message[] = []
  let current = leafId ? tree.byId.get(leafId) : undefined
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? tree.byId.get(current.parentId) : undefined
  }
  return path
}

/** Irmãos de uma mensagem (as "versões"), para a navegação `< 2/3 >`. */
export function siblings(tree: Tree, message: Message) {
  const key = message.parentId && tree.byId.has(message.parentId) ? message.parentId : null
  const list = tree.children.get(key) ?? [message]
  return { list, index: list.findIndex((item) => item.id === message.id) }
}

/** Folha mais recente abaixo de uma mensagem (ao trocar de versão, mostra o ramo dela). */
export function latestLeaf(tree: Tree, messageId: string): string {
  let current = messageId
  for (;;) {
    const next = tree.children.get(current)
    if (!next?.length) return current
    current = next[next.length - 1]!.id
  }
}

export const textOf = (message: Pick<Message, "content">) =>
  message.content
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n\n")
