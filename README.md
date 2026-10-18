# personal-ai-frontend

Interface do Personal AI: Next.js 16 (App Router) + Tailwind 4 + shadcn/ui (estilo base-nova, sobre Base UI).
O plano e as decisões estão em `../plan.md`.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL aponta para o backend
npm run dev                  # http://localhost:3000
```

O backend precisa estar rodando (ver `personal-ai-backend`).

## Scripts

| Script            | O que faz                                                      |
| ----------------- | -------------------------------------------------------------- |
| `dev` / `build`   | Servidor de desenvolvimento / build de produção                |
| `typecheck`       | Gera os tipos de rota do Next e checa o projeto                |
| `lint` / `format` | ESLint / Prettier (com ordenação de classes do Tailwind)       |
| `test`            | Testes unitários (vitest + jsdom)                              |
| `api:types`       | Regenera `src/lib/api-schema.d.ts` do OpenAPI do backend local |

## Estrutura

```
src/
  app/login/           tela de login
  app/(app)/           área autenticada (chat, sinapses, arquivos, uso, configurações)
  components/layout/   sidebar, tema e shell
  components/ui/       componentes shadcn (gerados pelo CLI)
  lib/api.ts           cliente tipado (openapi-fetch): envia o token, trata 401
  lib/api-schema.d.ts  tipos gerados do contrato da API
  lib/auth.ts          sessão no localStorage, sincronizada entre abas
```

Os componentes shadcn usam Base UI: para trocar o elemento renderizado use `render={<Link ... />}` (não `asChild`).

## Deploy (Vercel)

Importe o repositório na Vercel e defina `NEXT_PUBLIC_API_URL` com a URL do backend na Railway.
Sem essa variável o build falha de propósito, em vez de publicar um site apontando para `localhost`.
A versão do Node vem de `engines` (24).
