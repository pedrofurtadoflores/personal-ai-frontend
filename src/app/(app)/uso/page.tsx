import { BarChart3Icon } from "lucide-react"
import { ComingSoon } from "@/components/layout/coming-soon"

export default function UsoPage() {
  return (
    <ComingSoon
      icon={BarChart3Icon}
      title="Uso e custos"
      description="Tokens e custo por dia, por modelo e por conversa, com alerta de limite mensal."
      phase="Fase 3"
    />
  )
}
