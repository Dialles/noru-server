#!/usr/bin/env bash
# Deploy de produção no Cloudflare Workers:
#   1. typecheck   2. valida database_id   3. migrations remotas   4. deploy
# Use --skip-typecheck ou --skip-migrate se necessário.
source "$(dirname "$0")/_common.sh"

require_wrangler

SKIP_TYPECHECK=0; SKIP_MIGRATE=0
for arg in "$@"; do
  case "$arg" in
    --skip-typecheck) SKIP_TYPECHECK=1 ;;
    --skip-migrate) SKIP_MIGRATE=1 ;;
    *) die "Argumento desconhecido: $arg" ;;
  esac
done

step "1/4 · Type check"
if [ "$SKIP_TYPECHECK" = "1" ]; then
  warn "Type check pulado (--skip-typecheck)."
elif [ -d node_modules ]; then
  npx tsc --noEmit && ok "Sem erros de tipo."
else
  warn "node_modules ausente — type check pulado. Rode 'npm install'."
fi

step "2/4 · Validar database_id"
current_id="$(awk -F'"' '/^[[:space:]]*database_id[[:space:]]*=/{print $2}' wrangler.toml | head -1)"
case "$current_id" in
  ""|REPLACE_WITH_D1_DATABASE_ID)
    die "wrangler.toml sem database_id válido. Rode 'npm run db:create'." ;;
  *) ok "database_id: $current_id" ;;
esac

step "3/4 · Migrations remotas"
if [ "$SKIP_MIGRATE" = "1" ]; then
  warn "Migrations remotas puladas (--skip-migrate)."
else
  run_wrangler d1 migrations apply "$DB_NAME" --remote
  ok "Migrations aplicadas no remoto."
fi

step "4/4 · Deploy Worker"
run_wrangler deploy

echo
ok "Deploy concluído."
log "Valide com: ${C_BLD}npm run smoke -- https://SEU-DOMINIO${C_RESET}"
log "Primeiro admin em produção: ${C_BLD}npm run create-admin -- --url https://SEU-DOMINIO${C_RESET}"
