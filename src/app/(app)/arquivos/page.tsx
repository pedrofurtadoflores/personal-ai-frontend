import { FolderIcon } from "lucide-react"
import { ComingSoon } from "@/components/layout/coming-soon"

export default function ArquivosPage() {
  return (
    <ComingSoon
      icon={FolderIcon}
      title="Arquivos"
      description="Uploads e imagens geradas, armazenados no Cloudflare R2."
      phase="Fase 4"
    />
  )
}
