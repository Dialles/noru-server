# Deploy na Cloudflare grátis

Arquitetura usada:

- Cloudflare Workers com **static assets** servindo os arquivos de `public/`.
- O mesmo Worker (`src/worker.ts`) roteia a API em `/api/*` para `src/server/app.ts`.
- D1 como banco SQLite serverless.
- Cookies HttpOnly para sessão admin.

## Caminho rápido (scripts)

```bash
npm install
npm run setup            # cria D1, grava database_id, migra local, gera .dev.vars
npx wrangler login       # se ainda não autenticado
npm run db:migrate:remote
npm run secrets          # envia SETUP_TOKEN e HASH_SALT como secrets do Worker
npm run deploy           # typecheck → valida database_id → migrations remotas → deploy
```

Em seguida valide e crie o admin de produção:

```bash
npm run smoke -- https://SEU-DOMINIO
npm run create-admin -- --url https://SEU-DOMINIO
```

As seções abaixo detalham cada etapa manualmente. Veja `scripts/README.md`.

## 1. Instalar dependências

```bash
npm install
```

> O Wrangler 4 exige **Node.js >= 22**. A versão usada no build vem do `.nvmrc`.

## 2. Login no Cloudflare

```bash
npx wrangler login
```

## 3. Criar banco D1

```bash
npm run db:create
```

Copie o `database_id` gerado e substitua em `wrangler.toml` (não é segredo, é
versionado e **obrigatório** para o Worker encontrar o D1):

```toml
database_id = "SEU_DATABASE_ID"
```

## 4. Aplicar schema local

```bash
npm run db:migrate:local
```

## 5. Rodar local

```bash
npm run dev
```

Teste:

```bash
curl http://localhost:8788/api/health
```

## 6. Criar o primeiro admin local

Copie `.dev.vars.example` para `.dev.vars`. Defina `SETUP_TOKEN` no arquivo `.dev.vars` ou nas variáveis do dev local.

Exemplo `.dev.vars`:

```txt
SETUP_TOKEN=troque-por-um-token-longo
HASH_SALT=troque-por-um-salt-longo
PUBLIC_TENANT_SLUG=noru
SESSION_COOKIE_NAME=noru_admin_session
ADMIN_SESSION_DAYS=7
PUBLIC_REVIEW_MIN_RATING=4
ALLOWED_ORIGINS=http://localhost:8788
COOKIE_SECURE=false
```

Crie o admin em `http://localhost:8788/admin` usando o painel, ou via API:

```bash
curl -X POST http://localhost:8788/api/admin/setup \
  -H "content-type: application/json" \
  -H "x-setup-token: troque-por-um-token-longo" \
  -d '{
    "tenant_slug":"noru",
    "tenant_name":"Noru Sushi Lounge",
    "email":"admin@seudominio.com",
    "password":"senha-forte-com-10-caracteres",
    "name":"Administrador"
  }'
```

## 7. Aplicar schema remoto

```bash
npm run db:migrate:remote
```

## 8. Configurar variáveis em produção

Os **segredos** (`SETUP_TOKEN`, `HASH_SALT`) devem ir como _secrets_ do Worker.
Use o script (lê de `.prod.vars`/`.dev.vars` ou da env):

```bash
npm run secrets
```

Ou manualmente:

```bash
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put HASH_SALT
```

As variáveis **não-secretas** ficam em `[vars]` no `wrangler.toml` (versionado) ou
no painel Cloudflare > Workers & Pages > (seu Worker) > Settings > Variables and Secrets:

```txt
PUBLIC_TENANT_SLUG=noru
SESSION_COOKIE_NAME=noru_admin_session
ADMIN_SESSION_DAYS=7
PUBLIC_REVIEW_MIN_RATING=4
ALLOWED_ORIGINS=https://seudominio.com.br
```

Não configure `COOKIE_SECURE=false` em produção.

Depois de criar o primeiro admin em produção, o endpoint `/api/admin/setup` passa a recusar novas criações.

## 9. Deploy

```bash
npm run deploy
```

## 10. Rotas finais

```txt
/feedback             Página pública
/admin                Painel admin
/api/health           Health check (verifica conexão com o D1)
/api/feedback         Registro de feedback
/api/admin/*          Rotas protegidas
```

O `/api/health` retorna `200` com `{"database":"ok"}` quando o D1 responde e
`503` caso contrário — útil para monitores de uptime.

## 11. Deploy contínuo (Cloudflare Workers + GitHub)

Fluxo recomendado: conectar o repositório do GitHub direto ao Cloudflare Workers
(**Workers Builds**). A cada push em `main`, a Cloudflare roda `npx wrangler deploy`.

### 11.1. Importar o repositório

No painel: **Workers & Pages > Create > Workers > Connect to Git**, selecione o
repositório. Os comandos padrão já servem:

```txt
Deploy command    npx wrangler deploy
Build (não-prod)  npx wrangler versions upload
```

A versão do Node vem do `.nvmrc` (>= 22, exigido pelo Wrangler 4). Se necessário,
defina `NODE_VERSION` nas variáveis de build.

O `wrangler.toml` define tudo o que o build precisa: `main` (o Worker), `[assets]`
(os estáticos de `public/`) e o binding do D1.

### 11.2. D1 (obrigatório antes do primeiro deploy)

Crie o banco e cole o `database_id` real no `wrangler.toml` (commit). Sem isso o
deploy falha por não achar o D1.

```bash
npx wrangler login
npm run db:create                                   # cria e grava o database_id
npx wrangler d1 migrations apply noru_reviews --remote   # aplica o schema
```

`wrangler deploy` **não** roda migrations — aplique-as separadamente (comando acima
ou no fluxo `npm run deploy`).

### 11.3. Variáveis e segredos

No Worker, em **Settings > Variables and Secrets**:

- Segredos (tipo _Secret_): `SETUP_TOKEN`, `HASH_SALT` — ou via `npx wrangler secret put`.
- Não-secretas: já estão em `[vars]` do `wrangler.toml`; ajuste `ALLOWED_ORIGINS`
  para o domínio real (no `wrangler.toml` ou no painel).

Não defina `COOKIE_SECURE=false` em produção.

### 11.4. CI

O workflow `.github/workflows/ci.yml` roda apenas `npm run typecheck` em cada
push/PR — é um portão de qualidade, não faz deploy. O deploy é responsabilidade
do Workers Builds.

## Notas de configuração de borda

- Roteamento: os estáticos de `public/` são servidos primeiro; requisições sem
  arquivo correspondente caem no Worker, que trata `/api/*`.
- `public/_redirects` reescreve `/feedback` e `/admin` para os respectivos
  `index.html` (suportado por Workers Static Assets).
- `public/_headers` define CSP, HSTS, headers de segurança e cache dos assets.
- A lib de QR Code do painel é servida localmente em `public/admin/vendor/` (sem CDN externo).
