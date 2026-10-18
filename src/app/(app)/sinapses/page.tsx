import { BrainCircuitIcon } from "lucide-react"
import { ComingSoon } from "@/components/layout/coming-soon"

export default function SinapsesPage() {
  return (
    <ComingSoon
      icon={BrainCircuitIcon}
      title="Sinapses"
      description="Sua memória organizada por temas, criada automaticamente pelo chat e editável aqui."
      phase="Fases 5 a 7"
    />
  )
}
