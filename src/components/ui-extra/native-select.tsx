import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Select nativo com o visual dos inputs: simples, acessível e ótimo no celular. */
export function NativeSelect({
  className,
  options,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & {
  options: { value: string; label: string }[]
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...props}
        className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
