"use client"

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force"
import { ArrowLeftIcon, Loader2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useGraph } from "@/lib/queries"
import type { Graph } from "@/lib/types"

type Node = Graph["nodes"][number] & SimulationNodeDatum & { radius: number }

const WIDTH = 900
const HEIGHT = 620

/** Layout calculado de uma vez (sem animação): estável e leve. */
function layout(graph: Graph) {
  const nodes: Node[] = graph.nodes.map((node) => ({
    ...node,
    radius: 14 + Math.min(Math.sqrt(node.size) / 6, 18),
  }))
  const links = graph.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    reason: edge.reason,
  }))
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id((node) => (node as Node).id)
        .distance(110),
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(WIDTH / 2, HEIGHT / 2))
    .force(
      "collide",
      forceCollide<Node>().radius((node) => node.radius + 18),
    )
    .stop()
  for (let tick = 0; tick < 300; tick++) simulation.tick()
  for (const node of nodes) {
    node.x = Math.max(node.radius + 40, Math.min(WIDTH - node.radius - 40, node.x ?? 0))
    node.y = Math.max(node.radius + 20, Math.min(HEIGHT - node.radius - 28, node.y ?? 0))
  }
  return {
    nodes,
    links: links as unknown as { source: Node; target: Node; reason: string | null }[],
  }
}

export default function GraphPage() {
  const graph = useGraph()
  const router = useRouter()
  const [hover, setHover] = useState<string | null>(null)
  const data = useMemo(() => (graph.data ? layout(graph.data) : null), [graph.data])

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of data?.links ?? []) {
      map.set(link.source.id, (map.get(link.source.id) ?? new Set()).add(link.target.id))
      map.set(link.target.id, (map.get(link.target.id) ?? new Set()).add(link.source.id))
    }
    return map
  }, [data])

  const dim = (id: string) => hover !== null && hover !== id && !neighbors.get(hover)?.has(id)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
      <Link
        href="/sinapses"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Sinapses
      </Link>
      <h1 className="text-2xl font-semibold">Grafo de sinapses</h1>
      <p className="-mt-2 text-sm text-muted-foreground">
        Cada nó é um tema; o tamanho acompanha o conteúdo. Passe o mouse para ver as conexões e
        clique para abrir.
      </p>
      {!data ? (
        <Loader2Icon className="mx-auto size-6 animate-spin text-muted-foreground" />
      ) : data.nodes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma sinapse ainda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-muted/20">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Grafo de conexões entre sinapses"
          >
            {data.links.map((link, index) => (
              <line
                key={index}
                x1={link.source.x}
                y1={link.source.y}
                x2={link.target.x}
                y2={link.target.y}
                stroke="var(--muted-foreground)"
                strokeOpacity={
                  hover && (link.source.id === hover || link.target.id === hover) ? 0.8 : 0.25
                }
                strokeWidth={2}
              >
                {link.reason && <title>{link.reason}</title>}
              </line>
            ))}
            {data.nodes.map((node) => (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                className="cursor-pointer transition-opacity"
                opacity={dim(node.id) ? 0.25 : 1}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/sinapses/${node.id}`)}
                role="link"
                aria-label={node.title}
              >
                <circle
                  r={node.radius}
                  fill="var(--background)"
                  stroke={node.pinned ? "var(--viz-1)" : "var(--border)"}
                  strokeWidth={node.pinned ? 3 : 2}
                />
                <text textAnchor="middle" dominantBaseline="central" fontSize={node.radius}>
                  {node.emoji ?? "🧠"}
                </text>
                <text
                  y={node.radius + 14}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--foreground)"
                >
                  {node.title.length > 22 ? `${node.title.slice(0, 21)}…` : node.title}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  )
}
