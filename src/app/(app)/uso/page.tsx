"use client"

import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatNumber, formatUsd } from "@/lib/format"
import { useUsage } from "@/lib/queries"

const sourceLabels: Record<string, string> = {
  chat: "Chat",
  background: "Background (títulos, memória)",
  embedding: "Embeddings",
  image: "Imagens",
  transcription: "Ditado",
  speech: "Leitura em voz alta",
  realtime: "Modo voz",
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">
        {label ? new Date(`${label}T12:00:00`).toLocaleDateString("pt-BR") : ""}
      </div>
      <div className="font-medium text-foreground tabular-nums">{formatUsd(payload[0]!.value)}</div>
    </div>
  )
}

/** Linhas com barra proporcional: comparação de magnitude legível e acessível como tabela. */
function BarTable({ rows }: { rows: { label: string; value: number; detail?: string }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 0.000001)
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sem consumo no período.</p>
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b last:border-0">
            <td className="py-2 pr-3">
              <div className="truncate">{row.label}</div>
              {row.detail && <div className="text-xs text-muted-foreground">{row.detail}</div>}
            </td>
            <td className="w-2/5 py-2">
              <div
                className="h-2 rounded-r-sm bg-[var(--viz-1)]"
                style={{ width: `${Math.max((row.value / max) * 100, 1)}%` }}
              />
            </td>
            <td className="py-2 pl-3 text-right tabular-nums">{formatUsd(row.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function UsoPage() {
  const [days, setDays] = useState(30)
  const usage = useUsage(days)
  const [showTable, setShowTable] = useState(false)

  if (usage.isLoading || !usage.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  const { month, byModel, bySource, days: daily, topConversations } = usage.data
  const total = daily.reduce((sum, day) => sum + day.costUsd, 0)
  const ratio = month.limitUsd > 0 ? Math.min(month.costUsd / month.limitUsd, 1) : 0

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Uso e custos</h1>
        <Tabs value={String(days)} onValueChange={(value) => setDays(Number(value))}>
          <TabsList>
            <TabsTrigger value="7">7 dias</TabsTrigger>
            <TabsTrigger value="30">30 dias</TabsTrigger>
            <TabsTrigger value="90">90 dias</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Este mês</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatUsd(month.costUsd)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {month.limitUsd > 0 ? (
              <>
                <Progress value={ratio * 100} aria-label="Uso do limite mensal" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {month.alert === "ok" ? (
                    <CheckCircle2Icon className="size-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangleIcon
                      className={`size-3.5 ${month.alert === "exceeded" ? "text-destructive" : "text-amber-600"}`}
                    />
                  )}
                  {Math.round((month.costUsd / month.limitUsd) * 100)}% do limite de{" "}
                  {formatUsd(month.limitUsd)}
                  {month.alert === "exceeded"
                    ? " (passou; é só um alerta, nada foi bloqueado)"
                    : ""}
                  <Link href="/configuracoes" className="ml-auto underline">
                    alterar limite
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Sem limite mensal definido.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Últimos {days} dias</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{formatUsd(total)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {formatNumber(daily.reduce((sum, day) => sum + day.tokens, 0))} tokens
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custo por dia</CardTitle>
          <CardAction>
            <button
              className="text-xs text-muted-foreground underline"
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? "ver gráfico" : "ver tabela"}
            </button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {showTable ? (
            <BarTable
              rows={[...daily].reverse().map((day) => ({
                label: new Date(`${day.date}T12:00:00`).toLocaleDateString("pt-BR"),
                value: day.costUsd,
                detail: `${formatNumber(day.tokens)} tokens`,
              }))}
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={daily}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  barCategoryGap={2}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(value: string) => value.slice(8, 10) + "/" + value.slice(5, 7)}
                    minTickGap={16}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    tickFormatter={(value: number) => formatUsd(value)}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                  />
                  <Bar
                    dataKey="costUsd"
                    fill="var(--viz-1)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por modelo</CardTitle>
          </CardHeader>
          <CardContent>
            <BarTable
              rows={byModel.map((row) => ({
                label: row.model,
                value: row.costUsd,
                detail:
                  row.tokensIn || row.tokensOut
                    ? `${formatNumber(row.tokensIn)} entrada · ${formatNumber(row.tokensOut)} saída`
                    : undefined,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Por origem</CardTitle>
          </CardHeader>
          <CardContent>
            <BarTable
              rows={bySource.map((row) => ({
                label: sourceLabels[row.source] ?? row.source,
                value: row.costUsd,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversas mais caras</CardTitle>
        </CardHeader>
        <CardContent>
          <BarTable
            rows={topConversations.map((row) => ({
              label: row.title ?? "Sem título",
              value: row.costUsd,
            }))}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Custos calculados com o catálogo de preços (editável em Configurações). Imagens, busca web e
        leitura em voz alta são estimativas.
      </p>
    </div>
  )
}
