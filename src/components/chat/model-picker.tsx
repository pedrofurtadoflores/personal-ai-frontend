"use client"

import { CheckIcon, ChevronDownIcon, SparklesIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatUsd } from "@/lib/format"
import { useModels } from "@/lib/queries"
import type { Model } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Faixa de custo pelo preço de saída (o que mais pesa numa conversa). */
export function costTier(model: Pick<Model, "outputPrice">) {
  const output = model.outputPrice
  if (output == null) return { label: "?", title: "Preço desconhecido (edite em Configurações)" }
  if (output <= 2) return { label: "$", title: "Barato" }
  if (output <= 15) return { label: "$$", title: "Intermediário" }
  if (output <= 60) return { label: "$$$", title: "Caro" }
  return { label: "$$$$", title: "Muito caro" }
}

export const FEATURED = ["gpt-6-sol", "gpt-6-luna", "gpt-6-astra", "gpt-6.1-sol", "gpt-5.6-terra"]

function PriceLine({ model }: { model: Model }) {
  if (model.inputPrice == null) return <span>Preço desconhecido</span>
  return (
    <span>
      {formatUsd(model.inputPrice)} entrada · {formatUsd(model.outputPrice ?? 0)} saída / 1M tokens
    </span>
  )
}

export function ModelPicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (model: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const models = useModels("chat")
  const list = models.data?.models ?? []
  const current = list.find((model) => model.id === value)
  const featured = FEATURED.map((id) => list.find((model) => model.id === id)).filter(
    (model) => model !== undefined,
  )
  const others = list.filter((model) => !FEATURED.includes(model.id))

  const item = (model: Model) => {
    const tier = costTier(model)
    return (
      <CommandItem
        key={model.id}
        value={`${model.id} ${model.displayName ?? ""}`}
        onSelect={() => {
          onChange(model.id)
          setOpen(false)
        }}
        className="flex-col items-start gap-0.5 py-2"
      >
        <div className="flex w-full items-center gap-2">
          <CheckIcon className={cn("size-3.5", model.id === value ? "opacity-100" : "opacity-0")} />
          <span className="font-medium">{model.displayName ?? model.id}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground" title={tier.title}>
            {tier.label}
          </span>
        </div>
        <div className="pl-5.5 text-xs text-muted-foreground">
          <PriceLine model={model} />
        </div>
        {model.recommendation && (
          <div className="pl-5.5 text-xs text-muted-foreground/90">{model.recommendation}</div>
        )}
        {model.example && (
          <div className="pl-5.5 text-xs text-muted-foreground/70 italic">
            Ex.: “{model.example}”
          </div>
        )}
      </CommandItem>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("max-w-48 gap-1 font-normal", className)}
                />
              }
            />
          }
        >
          <SparklesIcon className="size-3.5" />
          <span className="truncate">{current?.displayName ?? value}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {current ? costTier(current).label : ""}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-60" />
        </TooltipTrigger>
        <TooltipContent>Modelo desta conversa</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar modelo…" />
          <CommandList className="max-h-96">
            <CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
            {featured.length > 0 && (
              <CommandGroup heading="Recomendados">{featured.map(item)}</CommandGroup>
            )}
            <CommandGroup heading="Todos">{others.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
