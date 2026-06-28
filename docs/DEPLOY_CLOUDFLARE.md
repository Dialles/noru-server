# Deploy na Cloudflare grátis

Arquitetura usada:

- Cloudflare Pages para arquivos estáticos em `public/`.
- Pages Functions para API em `/api/*`.
- D1 como banco SQLite serverless.
- Cookies HttpOnly para sessão admin.

## Caminho rápido (scripts)

```bash
npm install
npm run setup            # cria D1, grava database_id, migra local, gera .dev.vars
npx wrangler login       # se ainda não autenticado
npm run db:migrate:remote
npm run secrets          # envia SETUP_TOKEN e HASH_SALT como secrets do Pages
npm run deploy           # typecheck → migrations remotas → deploy
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

## 2. Login no Cloudflare

```bash
npx wrangler login
```

## 3. Criar banco D1

```bash
npm run db:create
```

Copie o `database_id` gerado e substitua em `wrangler.toml`:

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

Copie `.dev.vars.example` para `.dev.vars`. Defina `SETUP_TOKEN` no arquivo `.dev.vars` ou nas variáveis do Pages Dev.

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

Os **segredos** (`SETUP_TOKEN`, `HASH_SALT`) devem ir como _secrets_ do Pages.
Use o script (lê de `.prod.vars`/`.dev.vars` ou da env):

```bash
npm run secrets
```

Ou manualmente:

```bash
npx wrangler pages secret put SETUP_TOKEN --project-name=noru-reviews
npx wrangler pages secret put HASH_SALT   --project-name=noru-reviews
```

As variáveis **não-secretas** ficam em `[vars]` no `wrangler.toml` (versionado) ou
no painel Cloudflare > Pages > Settings > Environment variables:

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

## 11. Deploy contínuo (Cloudflare Pages + GitHub)

Fluxo recomendado: conectar o repositório do GitHub direto ao Cloudflare Pages.
O Pages faz build e deploy automático a cada push em `main`.

### 11.1. Importar o repositório

No painel: **Workers & Pages > Create > Pages > Connect to Git**, selecione o
repositório e configure o build:

```txt
Framework preset          None
Build command             (deixe vazio — não há etapa de build)
Build output directory     public
Root directory            / (padrão)
```

A versão do Node vem do `.nvmrc`. Se necessário, defina a variável de ambiente
`NODE_VERSION` no painel.

As Pages Functions em `functions/api/` são detectadas e empacotadas
automaticamente; `public/_routes.json` garante que elas rodem apenas em `/api/*`.

### 11.2. Binding do D1

Crie o banco (`npm run db:create` ou pelo painel) e adicione o binding em
**Settings > Functions > D1 database bindings**:

```txt
Variable name    DB
D1 database      noru_reviews
```

Para aplicar o schema em produção, preencha o `database_id` real no
`wrangler.toml` e rode localmente (o `database_id` é um identificador público,
pode ser versionado):

```bash
npx wrangler login
npx wrangler d1 migrations apply noru_reviews --remote
```

### 11.3. Variáveis e segredos

Em **Settings > Environment variables (Production)**:

- Segredos (marque como _encrypted_): `SETUP_TOKEN`, `HASH_SALT`.
- Não-secretas (já estão em `[vars]` do `wrangler.toml`; defina aqui se quiser
  sobrescrever): `PUBLIC_TENANT_SLUG`, `SESSION_COOKIE_NAME`,
  `ADMIN_SESSION_DAYS`, `PUBLIC_REVIEW_MIN_RATING` e `ALLOWED_ORIGINS` com o
  domínio real.

Não defina `COOKIE_SECURE=false` em produção.

### 11.4. CI

O workflow `.github/workflows/ci.yml` roda apenas `npm run typecheck` em cada
push/PR — é um portão de qualidade, não faz deploy. O deploy é responsabilidade
da integração Git do Pages.

## Notas de configuração de borda

- `public/_routes.json` faz as Functions rodarem apenas em `/api/*`; o restante é servido como estático.
- `public/_headers` define CSP, HSTS, headers de segurança e cache dos assets.
- A lib de QR Code do painel é servida localmente em `public/admin/vendor/` (sem CDN externo).
