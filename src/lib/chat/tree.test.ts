import { describe, expect, it } from "vitest"
import { branch, buildTree, latestLeaf, siblings, textOf } from "@/lib/chat/tree"
import type { Message } from "@/lib/types"

let clock = 0
const msg = (id: string, parentId: string | null, role = "user", text = id): Message =>
  ({
    id,
    parentId,
    role,
    conversationId: "c",
    content: [{ type: "text", text }],
    contentText: text,
    model: null,
    status: "completed",
    error: null,
    tokensIn: null,
    tokensCached: null,
    tokensOut: null,
    tokensReasoning: null,
    costUsd: null,
    createdAt: new Date(1_700_000_000_000 + clock++ * 1000).toISOString(),
    completedAt: null,
  }) as Message

// u1 → a1 → u2 → a2
//            ↘ a2b (regenerada)
//   ↘ a1b (regenerada) → u3
const messages = [
  msg("u1", null),
  msg("a1", "u1", "assistant"),
  msg("u2", "a1"),
  msg("a2", "u2", "assistant"),
  msg("a2b", "u2", "assistant"),
  msg("a1b", "u1", "assistant"),
  msg("u3", "a1b"),
]
const tree = buildTree(messages)

describe("árvore de mensagens", () => {
  it("monta o ramo da raiz até a folha", () => {
    expect(branch(tree, "a2b").map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2b"])
    expect(branch(tree, "u3").map((m) => m.id)).toEqual(["u1", "a1b", "u3"])
    expect(branch(tree, null)).toEqual([])
  })

  it("conta as versões irmãs na ordem de criação", () => {
    const { list, index } = siblings(tree, tree.byId.get("a2b")!)
    expect(list.map((m) => m.id)).toEqual(["a2", "a2b"])
    expect(index).toBe(1)
  })

  it("ao trocar de versão, vai até a folha mais recente daquele ramo", () => {
    expect(latestLeaf(tree, "a1")).toBe("a2b")
    expect(latestLeaf(tree, "a1b")).toBe("u3")
    expect(latestLeaf(tree, "u3")).toBe("u3")
  })

  it("mensagem com pai desconhecido vira raiz (não some)", () => {
    const orphanTree = buildTree([msg("x", "nao-existe")])
    expect(branch(orphanTree, "x").map((m) => m.id)).toEqual(["x"])
    expect(siblings(orphanTree, orphanTree.byId.get("x")!).list).toHaveLength(1)
  })

  it("textOf junta só as partes de texto", () => {
    expect(
      textOf({
        content: [
          { type: "text", text: "a" },
          { type: "tool", name: "web_search", detail: null },
          { type: "text", text: "b" },
        ],
      } as Message),
    ).toBe("a\n\nb")
  })
})
