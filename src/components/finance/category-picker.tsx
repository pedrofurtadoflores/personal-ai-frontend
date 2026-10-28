"use client"

import { useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { FinCategory } from "@/lib/finance"
import { cn } from "@/lib/utils"

/**
 * Seletor de categoria com busca (F36): digitar filtra, setas e Enter escolhem e as sugeridas
 * vêm no topo. Dentro da planilha o gatilho tem cara de célula.
 */
export function CategoryPicker({
  value,
  categories,
  suggested = [],
  onChange,
  placeholder = "Escolher…",
  variant = "cell",
  allowNone = true,
  aiHint,
  disabled,
  className,
  ariaLabel = "Categoria",
}: {
  value: string | null
  categories: FinCategory[]
  suggested?: string[]
  onChange: (categoryId: string | null) => void
  placeholder?: string
  variant?: "cell" | "field"
  allowNone?: boolean
  /** Sugerida pela IA e ainda não confirmada: aparece em itálico. */
  aiHint?: boolean
  disabled?: boolean
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const current = categories.find((c) => c.id === value)
  const top = suggested
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is FinCategory => !!c)
  const pick = (id: string | null) => {
    setOpen(false)
    if (id !== value) onChange(id)
  }
  const group = (kind: "expense" | "income") =>
    categories.filter((c) => c.kind === kind && !top.some((t) => t.id === c.id))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "w-full truncate text-left outline-none disabled:cursor-default",
          variant === "cell"
            ? "h-9 rounded-md px-2 hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring"
            : "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          !current && "font-medium text-amber-700 dark:text-amber-400",
          current && aiHint && "text-muted-foreground italic",
          className,
        )}
      >
        {current?.name ?? placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Buscar categoria" />
          <CommandList>
            <CommandEmpty>Nenhuma categoria.</CommandEmpty>
            {top.length > 0 && (
              <CommandGroup heading="Sugeridas">
                {top.map((c) => (
                  <CommandItem key={c.id} value={`s-${c.name}`} onSelect={() => pick(c.id)}>
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Despesas">
              {group("expense").map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => pick(c.id)}>
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Receitas">
              {group("income").map((c) => (
                <CommandItem key={c.id} value={c.name} onSelect={() => pick(c.id)}>
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {allowNone && value && (
              <CommandGroup>
                <CommandItem
                  value="sem categoria"
                  onSelect={() => pick(null)}
                  className="text-muted-foreground"
                >
                  Sem categoria
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
