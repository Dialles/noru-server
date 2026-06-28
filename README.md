# NORU Reviews — Cloudflare Free

Servidor serverless para captação de feedback interno e direcionamento de clientes satisfeitos para reviews externos.

## Arquitetura

```txt
Cliente no QR Code
      ↓
Cloudflare Worker  ──→  static assets (public/)
      ↓
/api/*  →  src/worker.ts → src/server/app.ts
      ↓
Cloudflare D1
```

Não existe servidor local em produção. O projeto roda em infraestrutura gratuita da Cloudflare usando Workers (com static assets) e D1.

## Módulos

- `public/client`: página pública do cliente integrada a `/api/feedback`.
- `public/admin`: painel admin integrado a login, dashboard, lista de reviews, detalhe, status, configurações e QR.
- `src/worker.ts`: entrada do Worker — serve `public/` e roteia `/api/*`.
- `src/server`: servidor, autenticação, validação e regras de negócio.
- `migrations`: schema do banco D1.
- `docs`: documentação técnica.

## Recursos do servidor

- Registro de feedback com nota de 1 a 5.
- Campos opcionais de contato do cliente.
- Perguntas configuráveis por categoria.
- Direcionamento para Google, Tripadvisor ou Instagram quando a nota atinge o mínimo configurado.
- Login admin com senha hasheada.
- Sessão admin em cookie HttpOnly, Secure e SameSite=Lax.
- Dashboard com métricas de feedback.
- Filtros por status e nota.
- Atualização de status e nota interna.
- Configurações públicas do tenant sincronizadas com as páginas.
- Registro de cliques nas plataformas externas.
- Auditoria básica de ações administrativas.

## Primeiros passos

Setup automático (recomendado) — gera segredos, cria o D1, grava o `database_id`
no `wrangler.toml` e aplica as migrations locais:

```bash
npm install
npm run setup
npm run dev
```

Depois, em outro terminal, crie o primeiro admin e (opcional) dados de exemplo:

```bash
npm run create-admin     # usa o SETUP_TOKEN gerado em .dev.vars
npm run db:seed          # popula feedbacks de exemplo
npm run smoke            # valida a API local
```

Em desenvolvimento local HTTP, o `npm run setup` cria `.dev.vars` a partir de
`.dev.vars.example` com `COOKIE_SECURE=false` para o navegador aceitar o cookie
de sessão. O primeiro admin também pode ser criado pelo painel em `/admin`.

> Passo a passo e variáveis de cada script: `scripts/README.md`.

## Deploy

Recomendado: conectar o repositório ao **Cloudflare Workers** (Connect to Git),
que faz build e deploy automático (`npx wrangler deploy`) a cada push em `main`.
Antes do primeiro deploy é preciso criar o D1 e colar o `database_id` no
`wrangler.toml`. Passo a passo (binding do D1, variáveis e segredos):
`docs/DEPLOY_CLOUDFLARE.md`.

Alternativa via CLI:

```bash
npm run secrets          # envia SETUP_TOKEN e HASH_SALT como secrets do Worker
npm run deploy           # typecheck → migrations remotas → deploy
```

CI: `.github/workflows/ci.yml` roda `typecheck` em cada push/PR (não faz deploy).

## API

Veja `docs/API.md`.
