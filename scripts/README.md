# Scripts de operação — NORU Reviews

Automação para preparar, rodar e publicar o servidor na infraestrutura Cloudflare
(Pages + Functions + D1). Todos os scripts são idempotentes quando faz sentido e
aceitam configuração por variáveis de ambiente.

## Uso rápido (via npm)

| Comando | O que faz |
| --- | --- |
| `npm run setup` | Bootstrap completo: gera `.dev.vars`, instala deps, cria o D1, grava o `database_id` e aplica as migrations locais. |
| `npm run dev` | Sobe o ambiente local em `http://localhost:8788` (com checagens prévias). |
| `npm run create-admin` | Cria o primeiro admin chamando `/api/admin/setup`. |
| `npm run db:seed` | Popula feedbacks de exemplo para testar dashboard e listas. |
| `npm run db:create` | Cria a database D1 e grava o `database_id` no `wrangler.toml`. |
| `npm run db:migrate` | Aplica as migrations locais. |
| `npm run db:migrate:remote` | Aplica as migrations no D1 remoto. |
| `npm run db:reset` | Zera a database **local** e reaplica as migrations. |
| `npm run secrets` | Envia `SETUP_TOKEN`/`HASH_SALT` como secrets do Pages. |
| `npm run smoke` | Smoke test da API (`/api/health`, config, páginas). |
| `npm run deploy` | Typecheck → valida `database_id` → migrations remotas → deploy. |

## Detalhes por script

- **`scripts/setup.sh`** — ponto de partida. Não sobrescreve `.dev.vars` existente.
- **`scripts/dev.sh`** — aplica migrations locais na primeira execução e roda `wrangler pages dev`.
- **`scripts/db-create.sh`** — usa `wrangler d1 list --json` para obter o `uuid` e atualiza o `wrangler.toml`.
- **`scripts/db-migrate.sh [local|remote]`** — bloqueia o remoto se o `database_id` ainda for placeholder.
- **`scripts/db-reset.sh`** — remove `.wrangler/state/v3/d1` (apenas local) e remigra.
- **`scripts/create-admin.sh`** — flags: `--url --email --password --name --tenant --token`. Token vem de `--token`, env `SETUP_TOKEN` ou `.dev.vars`.
- **`scripts/seed.sh [--remote]`** — gera SQL com Node e executa via `wrangler d1 execute`.
- **`scripts/secrets.sh`** — lê valores de env, `.prod.vars` ou `.dev.vars` (nessa ordem de precedência).
- **`scripts/smoke.sh [base_url]`** — valida endpoints e confirma `database: ok` no health.
- **`scripts/deploy.sh [--skip-typecheck] [--skip-migrate]`** — pipeline de publicação.

## Variáveis de ambiente reconhecidas

| Variável | Padrão | Uso |
| --- | --- | --- |
| `NORU_DB_NAME` | `noru_reviews` | Nome da database D1. |
| `NORU_PROJECT_NAME` | `noru-reviews` | Nome do projeto Pages. |
| `NORU_COMPAT_DATE` | `2026-06-28` | `compatibility_date` do dev local. |
| `NORU_DEV_PORT` | `8788` | Porta do `wrangler pages dev`. |
| `WRANGLER_BIN` | `npx wrangler` | Como invocar o Wrangler. |

## Exemplos

```bash
# Primeira vez
npm run setup && npm run dev          # em outro terminal:
npm run create-admin                  # cria o admin local
npm run db:seed                       # dados de exemplo
npm run smoke                         # valida a API local

# Produção
npm run secrets                       # envia os segredos
npm run deploy                        # publica
npm run smoke -- https://SEU-DOMINIO  # valida produção
npm run create-admin -- --url https://SEU-DOMINIO
```
