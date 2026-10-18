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
import { useSinapses } from "@/lib/queries"

/** Escolher uma (ou várias) sinapses: usado em conectar e mesclar. */
export function SinapsePicker({
  exclude,
  onPick,
  selected,
}: {
  exclude: string[]
  onPick: (id: string, title: string) => void
  selected?: string[]
}) {
  const [query, setQuery] = useState("")
  const sinapses = useSinapses()
  const options = (sinapses.data?.sinapses ?? []).filter((sinapse) => !exclude.includes(sinapse.id))
  return (
    <Command className="rounded-lg border">
      <CommandInput placeholder="Buscar sinapse…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-64">
        <CommandEmpty>Nenhuma sinapse.</CommandEmpty>
        <CommandGroup>
          {options.map((sinapse) => (
            <CommandItem
              key={sinapse.id}
              value={`${sinapse.title} ${sinapse.id}`}
              onSelect={() => onPick(sinapse.id, sinapse.title)}
            >
              <span>{sinapse.emoji ?? "🧠"}</span>
              <span className="flex-1 truncate">{sinapse.title}</span>
              {selected?.includes(sinapse.id) && (
                <span className="text-xs text-primary">selecionada</span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
