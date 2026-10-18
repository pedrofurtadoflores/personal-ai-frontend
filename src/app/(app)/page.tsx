import { MessageSquareIcon } from "lucide-react"
import { ComingSoon } from "@/components/layout/coming-soon"

export default function NewChatPage() {
  return (
    <ComingSoon
      icon={MessageSquareIcon}
      title="Como posso ajudar?"
      description="O chat com streaming, histórico completo e seleção de modelos chega na próxima etapa."
      phase="Fase 2"
    />
  )
}
