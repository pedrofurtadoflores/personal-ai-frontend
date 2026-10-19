import { ChatView } from "@/components/chat/chat-view"

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ projeto?: string | string[] }>
}) {
  // `/?projeto=<id>`: a conversa nova nasce dentro do projeto (D73).
  const { projeto } = await searchParams
  const folderId = typeof projeto === "string" && /^[0-9a-f-]{36}$/i.test(projeto) ? projeto : null
  // key: trocar de projeto remonta a tela (rascunho e opções são por projeto).
  return <ChatView key={folderId ?? "new"} conversationId={null} folderId={folderId} />
}
