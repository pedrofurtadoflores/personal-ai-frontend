"use client"

import { useMutation } from "@tanstack/react-query"
import {
  DatabaseBackupIcon,
  DownloadIcon,
  HardDriveIcon,
  Loader2Icon,
  MonitorSmartphoneIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { ModelPicker } from "@/components/chat/model-picker"
import { NativeSelect } from "@/components/ui-extra/native-select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiError, logoutAll, unwrap } from "@/lib/api"
import { auth } from "@/lib/auth"
import { formatBytes, formatDateTime } from "@/lib/format"
import { useBackups, useInvalidate, useModels, useSettings, useUpdateSettings } from "@/lib/queries"
import type { Model, Settings } from "@/lib/types"

const efforts = [
  { value: "auto", label: "Automático (padrão do modelo)" },
  { value: "none", label: "Sem raciocínio" },
  { value: "low", label: "Baixo" },
  { value: "medium", label: "Médio" },
  { value: "high", label: "Alto" },
  { value: "xhigh", label: "Máximo" },
]

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-4">
      <div>
        <Label className="pt-1.5">{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

/** Campo de texto que só salva ao sair (ou ao apertar o botão). */
function SaveOnBlur({
  value,
  onSave,
  type = "text",
  multiline,
}: {
  value: string
  onSave: (value: string) => void
  type?: string
  multiline?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const save = () => draft !== value && onSave(draft)
  return multiline ? (
    <div className="flex flex-col gap-2">
      <Textarea value={draft} rows={6} onChange={(event) => setDraft(event.target.value)} />
      <Button size="sm" className="w-fit" disabled={draft === value} onClick={save}>
        Salvar
      </Button>
    </div>
  ) : (
    <Input
      type={type}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => event.key === "Enter" && save()}
    />
  )
}

function modelOptions(models: Model[] | undefined, current: string) {
  const list = (models ?? []).map((model) => ({
    value: model.id,
    label: model.displayName ?? model.id,
  }))
  return list.some((item) => item.value === current)
    ? list
    : [{ value: current, label: current }, ...list]
}

function PriceInput({
  model,
  field,
}: {
  model: Model
  field: "inputPrice" | "cachedInputPrice" | "outputPrice"
}) {
  const invalidate = useInvalidate()
  const save = useMutation({
    mutationFn: (value: number | null) =>
      unwrap(
        api.PATCH("/models/{id}", { params: { path: { id: model.id } }, body: { [field]: value } }),
      ),
    onSuccess: () => invalidate("models"),
  })
  return (
    <SaveOnBlur
      type="number"
      value={model[field] == null ? "" : String(model[field])}
      onSave={(value) => save.mutate(value === "" ? null : Number(value))}
    />
  )
}

function Catalog() {
  const models = useModels()
  const invalidate = useInvalidate()
  const sync = useMutation({
    mutationFn: () => unwrap(api.POST("/models/sync")),
    onSuccess: (result) => {
      void invalidate("models")
      toast.success(
        `${result.total} modelos sincronizados${result.drafted ? `, ${result.drafted} descrições rascunhadas` : ""}.`,
      )
    },
    onError: () => toast.error("Não foi possível sincronizar."),
  })
  const [kind, setKind] = useState<Model["kind"]>("chat")
  const list = (models.data?.models ?? []).filter((model) => model.kind === kind)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo de modelos</CardTitle>
        <CardDescription>
          Preços em US$ por 1M tokens (fonte: {models.data?.pricesSource ?? "…"}). A OpenAI não
          informa preço pela API: confira e edite aqui quando mudar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            className="w-48"
            value={kind}
            onChange={(event) => setKind(event.target.value as Model["kind"])}
            options={[
              { value: "chat", label: "Chat" },
              { value: "image", label: "Imagem" },
              { value: "embedding", label: "Embedding" },
              { value: "transcription", label: "Transcrição" },
              { value: "speech", label: "Voz (TTS)" },
              { value: "realtime", label: "Tempo real" },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}{" "}
            Sincronizar com a OpenAI
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="w-28 px-2 py-2 font-medium">Entrada</th>
                <th className="w-28 px-2 py-2 font-medium">Cache</th>
                <th className="w-28 px-2 py-2 font-medium">Saída</th>
              </tr>
            </thead>
            <tbody>
              {list.map((model) => (
                <tr key={model.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{model.displayName ?? model.id}</div>
                    <div className="font-mono text-xs text-muted-foreground">{model.id}</div>
                    {model.recommendation && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {model.recommendation}
                      </div>
                    )}
                    {Object.keys(model.extraPrices).length > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {Object.entries(model.extraPrices)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <PriceInput model={model} field="inputPrice" />
                  </td>
                  <td className="px-2 py-2">
                    <PriceInput model={model} field="cachedInputPrice" />
                  </td>
                  <td className="px-2 py-2">
                    <PriceInput model={model} field="outputPrice" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function Storage() {
  const [forbidden, setForbidden] = useState(false)
  const configure = useMutation({
    mutationFn: () => unwrap(api.POST("/settings/storage-cors")),
    onSuccess: () => toast.success("CORS do bucket configurado."),
    onError: (error) => {
      if (error instanceof ApiError && error.code === "storage_forbidden") setForbidden(true)
      else toast.error("Não foi possível configurar o CORS.")
    },
  })
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const corsJson = JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedHeaders: ["content-type"],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDriveIcon className="size-4" /> Armazenamento (R2)
        </CardTitle>
        <CardDescription>
          O navegador envia os arquivos direto para o R2: o bucket precisa liberar este site no
          CORS.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          variant="outline"
          className="w-fit"
          disabled={configure.isPending}
          onClick={() => configure.mutate()}
        >
          {configure.isPending && <Loader2Icon className="animate-spin" />} Configurar CORS
          automaticamente
        </Button>
        {forbidden && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p>
              O token do R2 não tem permissão de administrar o bucket. No painel da Cloudflare, abra{" "}
              <strong>R2 → seu bucket → Settings → CORS Policy</strong> e cole:
            </p>
            <pre className="overflow-x-auto rounded bg-background p-2 text-xs">{corsJson}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Backups() {
  const backups = useBackups()
  const invalidate = useInvalidate()
  const run = useMutation({
    mutationFn: () => unwrap(api.POST("/backups")),
    onSuccess: () => {
      void invalidate("backups")
      toast.success("Backup feito.")
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.code === "pg_dump_missing"
          ? "Backup só funciona no servidor (imagem Docker)."
          : "O backup falhou.",
      ),
  })
  async function download(id: string) {
    const { url } = await unwrap(api.GET("/backups/{id}/download", { params: { path: { id } } }))
    window.open(url, "_blank", "noopener")
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackupIcon className="size-4" /> Backups do banco
        </CardTitle>
        <CardDescription>
          Toda semana (domingo, 3h) um backup completo vai para o R2. Ficam os 8 mais recentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="w-fit"
          disabled={run.isPending}
          onClick={() => run.mutate()}
        >
          {run.isPending && <Loader2Icon className="animate-spin" />} Fazer backup agora
        </Button>
        {(backups.data ?? []).map((backup) => (
          <div key={backup.id} className="flex items-center gap-2 text-sm">
            <span>{formatDateTime(backup.createdAt)}</span>
            <Badge
              variant={
                backup.status === "completed"
                  ? "secondary"
                  : backup.status === "failed"
                    ? "destructive"
                    : "outline"
              }
            >
              {backup.status === "completed"
                ? "ok"
                : backup.status === "failed"
                  ? "falhou"
                  : "rodando"}
            </Badge>
            {backup.size != null && (
              <span className="text-xs text-muted-foreground">{formatBytes(backup.size)}</span>
            )}
            {backup.status === "completed" && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="ml-auto"
                aria-label="Baixar backup"
                onClick={() => void download(backup.id)}
              >
                <DownloadIcon />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function ConfiguracoesPage() {
  const settings = useSettings()
  const update = useUpdateSettings()
  const chatModels = useModels("chat")
  const imageModels = useModels("image")
  const transcriptionModels = useModels("transcription")
  const speechModels = useModels("speech")
  const realtimeModels = useModels("realtime")
  const logoutEverywhere = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => auth.clear(),
    onError: () => toast.error("Não foi possível encerrar as sessões."),
  })

  if (!settings.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const s = settings.data.settings
  const voices = settings.data.voices.map((voice) => ({ value: voice, label: voice }))
  const save = (patch: Partial<Settings>) =>
    update.mutate(patch, {
      onSuccess: (data) =>
        toast.success(
          data.reindexing ? "Salvo. Recalculando os embeddings em background…" : "Salvo.",
        ),
      onError: () => toast.error("Valor inválido."),
    })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Modelo padrão" hint="Usado em conversas novas; cada conversa pode trocar.">
            <ModelPicker
              value={s.chatDefaultModel}
              onChange={(chatDefaultModel) => save({ chatDefaultModel })}
              className="border"
            />
          </Field>
          <Field label="Raciocínio padrão">
            <NativeSelect
              value={s.chatReasoningEffort}
              options={efforts}
              onChange={(event) =>
                save({ chatReasoningEffort: event.target.value as Settings["chatReasoningEffort"] })
              }
            />
          </Field>
          <Field
            label="Instruções personalizadas"
            hint="Vão em todas as conversas (como você quer as respostas, quem você é…)."
          >
            <SaveOnBlur
              multiline
              value={s.customInstructions}
              onSave={(customInstructions) => save({ customInstructions })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Memória (Sinapses)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Criação automática" hint="Quanto a IA guarda sozinha.">
            <NativeSelect
              value={s.sinapsesAggressiveness}
              options={[
                { value: "conservative", label: "Conservadora: só o que é claramente duradouro" },
                { value: "balanced", label: "Equilibrada (recomendado)" },
                { value: "liberal", label: "Liberal: guarda mais, você limpa depois" },
              ]}
              onChange={(event) =>
                save({
                  sinapsesAggressiveness: event.target.value as Settings["sinapsesAggressiveness"],
                })
              }
            />
          </Field>
          <Field
            label="Esperar antes de consolidar"
            hint="Segundos de conversa parada antes de revisar a memória."
          >
            <SaveOnBlur
              type="number"
              value={String(s.sinapsesConsolidationDelaySeconds)}
              onSave={(value) => save({ sinapsesConsolidationDelaySeconds: Number(value) })}
            />
          </Field>
          <Field
            label="Modelo do background"
            hint="Títulos, consolidação da memória e rascunhos do catálogo."
          >
            <NativeSelect
              value={s.backgroundModel}
              options={modelOptions(chatModels.data?.models, s.backgroundModel)}
              onChange={(event) => save({ backgroundModel: event.target.value })}
            />
          </Field>
          <Field
            label="Modelo de embedding"
            hint="Trocar recalcula todos os vetores (custa alguns centavos)."
          >
            <NativeSelect
              value={s.embeddingModel}
              options={[
                { value: "text-embedding-3-small", label: "text-embedding-3-small (barato)" },
                { value: "text-embedding-3-large", label: "text-embedding-3-large (melhor)" },
              ]}
              onChange={(event) =>
                save({ embeddingModel: event.target.value as Settings["embeddingModel"] })
              }
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Imagens e voz</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Modelo de imagem">
            <NativeSelect
              value={s.imageModel}
              options={modelOptions(imageModels.data?.models, s.imageModel)}
              onChange={(event) => save({ imageModel: event.target.value })}
            />
          </Field>
          <Field
            label="Qualidade da imagem"
            hint="Baixa ~US$ 0,01 · Média ~US$ 0,05 · Alta ~US$ 0,18 (estimativas)."
          >
            <NativeSelect
              value={s.imageQuality}
              options={[
                { value: "low", label: "Baixa" },
                { value: "medium", label: "Média" },
                { value: "high", label: "Alta" },
                { value: "auto", label: "Automática" },
              ]}
              onChange={(event) =>
                save({ imageQuality: event.target.value as Settings["imageQuality"] })
              }
            />
          </Field>
          <Field label="Ditado (transcrição)">
            <NativeSelect
              value={s.transcriptionModel}
              options={modelOptions(transcriptionModels.data?.models, s.transcriptionModel)}
              onChange={(event) => save({ transcriptionModel: event.target.value })}
            />
          </Field>
          <Field label="Leitura em voz alta">
            <div className="flex gap-2">
              <NativeSelect
                className="flex-1"
                value={s.speechModel}
                options={modelOptions(speechModels.data?.models, s.speechModel)}
                onChange={(event) => save({ speechModel: event.target.value })}
              />
              <NativeSelect
                className="w-32"
                value={s.speechVoice}
                options={voices}
                onChange={(event) =>
                  save({ speechVoice: event.target.value as Settings["speechVoice"] })
                }
              />
            </div>
          </Field>
          <Field label="Modo voz (tempo real)">
            <div className="flex gap-2">
              <NativeSelect
                className="flex-1"
                value={s.realtimeModel}
                options={modelOptions(realtimeModels.data?.models, s.realtimeModel)}
                onChange={(event) => save({ realtimeModel: event.target.value })}
              />
              <NativeSelect
                className="w-32"
                value={s.realtimeVoice}
                options={voices}
                onChange={(event) =>
                  save({ realtimeVoice: event.target.value as Settings["realtimeVoice"] })
                }
              />
            </div>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custos</CardTitle>
          <CardDescription>Só alerta: nada é bloqueado quando passa do limite.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field label="Limite mensal (US$)" hint="0 = sem limite.">
            <SaveOnBlur
              type="number"
              value={String(s.monthlyLimitUsd)}
              onSave={(value) => save({ monthlyLimitUsd: Number(value) })}
            />
          </Field>
          <Field label="Avisar a partir de (%)">
            <SaveOnBlur
              type="number"
              value={String(Math.round(s.alertThreshold * 100))}
              onSave={(value) => save({ alertThreshold: Number(value) / 100 })}
            />
          </Field>
          <Field
            label="Preço por busca web (US$)"
            hint="Página de preços: US$ 10 por 1.000 buscas."
          >
            <SaveOnBlur
              type="number"
              value={String(s.webSearchUsdPerCall)}
              onSave={(value) => save({ webSearchUsdPerCall: Number(value) })}
            />
          </Field>
        </CardContent>
      </Card>

      <Catalog />
      <Storage />
      <Backups />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
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
    </div>
  )
}
