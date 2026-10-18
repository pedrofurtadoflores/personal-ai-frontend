"use client"

import { useMutation } from "@tanstack/react-query"
import { Loader2Icon, MonitorSmartphoneIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { ComingSoon } from "@/components/layout/coming-soon"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { logoutAll } from "@/lib/api"
import { auth } from "@/lib/auth"

export default function ConfiguracoesPage() {
  const logoutEverywhere = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => auth.clear(),
    onError: () => toast.error("Não foi possível encerrar as sessões."),
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphoneIcon className="size-4" /> Sessões
          </CardTitle>
          <CardDescription>
            Encerra o acesso em todos os dispositivos, inclusive neste. Use se perdeu um aparelho ou
            acha que a senha vazou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            disabled={logoutEverywhere.isPending}
            onClick={() => logoutEverywhere.mutate()}
          >
            {logoutEverywhere.isPending && <Loader2Icon className="animate-spin" />}
            Sair de todos os dispositivos
          </Button>
        </CardContent>
      </Card>

      <ComingSoon
        icon={SettingsIcon}
        title="Mais configurações"
        description="Modelos padrão, instruções personalizadas, agressividade das sinapses e catálogo de preços."
        phase="Fase 3"
      />
    </div>
  )
}
