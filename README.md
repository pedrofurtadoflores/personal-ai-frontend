# personal-ai-frontend

Interface do Personal AI: Next.js 16 (App Router) + Tailwind 4 + shadcn/ui (estilo base-nova, sobre Base UI).
O plano e as decisões estão em `../plan.md`.

## Telas

- **Chat**: streaming, markdown (tabelas, código, LaTeX, Mermaid), anexos (arrastar, colar), busca web, geração de imagem, nível de raciocínio, seletor de modelo com preço, editar/regenerar com versões `< 2/3 >`, ditado, ler em voz alta, modo voz, chips de memória com "desfazer".
- **Sinapses**: lista com busca e tags, editor markdown, versões com diff, conexões, origens, mesclar, dividir, sugestões e grafo.
- **Arquivos** (enviados e imagens geradas), **Uso e custos** (gráficos), **Configurações** (modelos, memória, voz, limites, catálogo de preços, CORS do R2, backups, sessões), **Lixeira/Arquivadas**.
- Busca global com **Ctrl+K**, nova conversa com **Ctrl+Shift+O**, instalável como app (PWA).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL aponta para o backend
npm run dev                  # http://localhost:3000
```

O backend precisa estar rodando (ver `personal-ai-backend`).

## Scripts

| Script            | O que faz                                                                   |
| ----------------- | --------------------------------------------------------------------------- |
| `dev` / `build`   | Servidor de desenvolvimento / build de produção                             |
| `typecheck`       | Gera os tipos de rota do Next e checa o projeto                             |
| `lint` / `format` | ESLint (com regras de promises) / Prettier (ordena classes Tailwind)        |
| `test`            | Testes unitários (vitest + jsdom)                                           |
| `test:e2e`        | Playwright no build de produção, com a API simulada e checagem de CSP       |
| `api:types`       | Regenera `src/lib/api-schema.d.ts` de `../personal-ai-backend/openapi.json` |

## Estrutura

```
src/
  proxy.ts             Content-Security-Policy com nonce por requisição
  config/api-url.ts    URL do backend validada e normalizada
  app/login/           tela de login
  app/(app)/           área autenticada (chat, sinapses, arquivos, uso, configurações)
  components/layout/   sidebar, tema e shell
  components/ui/       componentes shadcn (gerados pelo CLI)
  lib/api.ts           cliente tipado (openapi-fetch): envia o token, trata 401 e Retry-After
  lib/api-schema.d.ts  tipos gerados do contrato da API (a CI confere com o backend)
  lib/auth.ts          sessão no localStorage, sincronizada entre abas
e2e/                   testes de ponta a ponta (Playwright)
```

Os componentes shadcn usam Base UI: para trocar o elemento renderizado use `render={<Link ... />}` (não `asChild`).

## Segurança

- CSP com nonce (`script-src 'nonce-…' 'strict-dynamic'`), por isso todas as páginas são dinâmicas.
- `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `noindex` (o app não aparece em buscadores).

## Deploy (Vercel)

Importe o repositório na Vercel e defina `NEXT_PUBLIC_API_URL` com a URL do backend na Railway.
Sem essa variável, ou com uma URL inválida, o build falha de propósito, em vez de publicar um site apontando para `localhost`.
A versão do Node vem de `engines` (24).
