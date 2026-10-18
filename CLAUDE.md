@AGENTS.md

# personal-ai-frontend

Leia `../plan.md` (decisões e fases) e `../CLAUDE.md` (convenções comuns).

## Comandos

- `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run format`
- `npm run test:e2e`: Playwright contra o build de produção, com a API simulada (usa o Chrome instalado).
- `npm run api:types`: regenera `src/lib/api-schema.d.ts` a partir de `../personal-ai-backend/openapi.json`.

## Regras

- Chamadas à API passam por `api` + `unwrap` de `src/lib/api.ts` (tipadas pelo contrato). Não use `fetch` direto, exceto para streaming.
- shadcn usa Base UI: para trocar o elemento, use `render={<Link />}` (com `nativeButton={false}` em `Button`), não `asChild`.
- Não edite `src/components/ui/` à mão sem necessidade: são arquivos gerados pelo CLI do shadcn.
- A área autenticada (`src/app/(app)`) é renderizada no cliente; a sessão fica no `localStorage` (D19, D33).
- Markdown vindo da IA ou de conteúdo externo nunca renderiza HTML bruto (D36).
- CSP com nonce (`src/proxy.ts`, D47): nada de `<script>` inline nem `eval`. Origem nova (R2, OpenAI Realtime)? Adicione em `connect-src`/`img-src` no `buildCsp` e rode o E2E, que falha em qualquer violação.
- Todas as páginas são dinâmicas (exigência do nonce); não reative `cacheComponents`/PPR sem revisar a D47.
