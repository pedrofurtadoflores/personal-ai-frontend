import { diffLines } from "diff"
import { cn } from "@/lib/utils"

/** Diff por linha entre duas versões do markdown. */
export function VersionDiff({ before, after }: { before: string; after: string }) {
  const changes = diffLines(before, after)
  if (changes.every((change) => !change.added && !change.removed)) {
    return (
      <p className="text-sm text-muted-foreground">
        Sem mudança no conteúdo (só título, resumo ou tags).
      </p>
    )
  }
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {changes.map((change, index) => (
        <span
          key={index}
          className={cn(
            change.added && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
            change.removed &&
              "bg-red-500/15 text-red-800 line-through decoration-red-500/40 dark:text-red-300",
            !change.added && !change.removed && "text-muted-foreground",
          )}
        >
          {change.added ? "+ " : change.removed ? "− " : "  "}
          {change.value.replace(
            /\n(?=.)/g,
            change.added ? "\n+ " : change.removed ? "\n− " : "\n  ",
          )}
        </span>
      ))}
    </pre>
  )
}
