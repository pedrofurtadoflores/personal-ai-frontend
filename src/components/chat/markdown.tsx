"use client"

import "katex/dist/katex.min.css"
import "highlight.js/styles/github-dark.css"
import { CheckIcon, CopyIcon } from "lucide-react"
import { memo, useEffect, useId, useRef, useState } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={className}
      aria-label="Copiar código"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1_500)
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

/** Diagrama mermaid, carregado sob demanda (a biblioteca é grande). */
function Mermaid({ code }: { code: string }) {
  const id = useId().replace(/:/g, "")
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default
        const dark = document.documentElement.classList.contains("dark")
        // securityLevel strict: sem HTML nem scripts dentro do diagrama (D36).
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
        })
        const { svg } = await mermaid.render(`mermaid-${id}`, code)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch {
        if (!cancelled) setError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code, id])

  if (error) return <pre className="text-xs text-muted-foreground">{code}</pre>
  return <div ref={ref} className="my-3 flex justify-center overflow-x-auto [&_svg]:max-w-full" />
}

const textOf = (node: unknown): string => {
  if (typeof node === "string") return node
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: unknown } }).props.children)
  }
  return ""
}

const components: Components = {
  // Links sempre em nova aba, sem dar acesso à janela original.
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const language = /language-([\w-]+)/.exec(className ?? "")?.[1]
    const code = textOf(children).replace(/\n$/, "")
    if (!language && !code.includes("\n")) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
      )
    }
    if (language === "mermaid") return <Mermaid code={code} />
    return (
      <div className="not-prose group/code relative my-3 overflow-hidden rounded-lg border bg-[#0d1117] text-[#e6edf3]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-1 text-xs text-white/60">
          <span>{language ?? "texto"}</span>
          <CopyButton text={code} className="text-white/70 hover:bg-white/10 hover:text-white" />
        </div>
        <pre className="m-0 overflow-x-auto bg-transparent p-3 font-mono text-sm leading-relaxed">
          <code className={className}>{children}</code>
        </pre>
      </div>
    )
  },
  table: ({ children }) => (
    <div className="not-prose my-3 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b bg-muted/50 px-3 py-2 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b px-3 py-2 align-top [tr:last-child_&]:border-b-0">{children}</td>
  ),
}

/**
 * Markdown das respostas (D36): sem `rehype-raw`, então HTML vindo do modelo ou de páginas
 * da web aparece como texto e nunca vira elemento; URLs `javascript:` são descartadas.
 */
export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:p-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
