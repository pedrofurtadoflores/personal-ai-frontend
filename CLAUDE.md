@AGENTS.md

# personal-ai-frontend

Leia `../plan.md` (decisões e fases) e `../CLAUDE.md` (convenções comuns).

## Comandos

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run format`
- `npm run api:types` com o backend rodando: regenera `src/lib/api-schema.d.ts` a partir do OpenAPI.

## Regras

- Chamadas à API passam por `api` + `unwrap` de `src/lib/api.ts` (tipadas pelo contrato). Não use `fetch` direto, exceto para streaming.
- shadcn usa Base UI: para trocar o elemento, use `render={<Link />}` (com `nativeButton={false}` em `Button`), não `asChild`.
- Não edite `src/components/ui/` à mão sem necessidade: são arquivos gerados pelo CLI do shadcn.
- A área autenticada (`src/app/(app)`) é renderizada no cliente; a sessão fica no `localStorage` (D19, D33).
- Markdown vindo da IA ou de conteúdo externo nunca renderiza HTML bruto (D36).
