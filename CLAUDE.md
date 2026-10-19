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

## Chat

- O streaming fica em `src/lib/chat/live.ts` (fora dos componentes: trocar de rota não corta a resposta). Leitura do SSE em `src/lib/chat/stream.ts`. A geração vive no servidor (D68): se a conexão cair, `live.ts` reconecta em `GET /conversations/:id/stream`; parar é `POST /conversations/:id/stop` (não aborte o fetch para parar).
- Composer: @menção de sinapse e "/" para prompts salvos (D76), rascunho por conversa no `localStorage` (D79). Ações da resposta (feedback, regenerar com outro modelo, continuar, fork) ficam em `message-item.tsx`.
- Mensagens são uma árvore (`src/lib/chat/tree.ts`): editar e regenerar criam irmãos; a tela mostra o ramo até `currentLeafMessageId`.
- Hooks de dados em `src/lib/queries.ts`; tipos da API em `src/lib/types.ts` (derivados do contrato, não escreva tipos à mão).
- `CommandDialog` do shadcn base-nova **não** inclui `<Command>`: envolva os filhos você mesmo.
- Gráficos: cor `var(--viz-1)` (passos próprios no claro e no escuro, validados pelo guia de dataviz); série única sem legenda, sempre com tabela alternativa.
