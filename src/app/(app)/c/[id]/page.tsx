"use client"

import { useParams } from "next/navigation"
import { ChatView } from "@/components/chat/chat-view"

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>()
  // key: trocar de conversa remonta a tela (rascunho, opções e rolagem são por conversa).
  return <ChatView key={id} conversationId={id} />
}
