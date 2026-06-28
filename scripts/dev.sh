#!/usr/bin/env bash
# Sobe o ambiente local (Cloudflare Pages + Functions + D1) com checagens prévias.
source "$(dirname "$0")/_common.sh"

require_wrangler

if [ ! -f .dev.vars ]; then
  warn "Sem .dev.vars — rode 'npm run setup' para gerar segredos locais."
fi

# Garante que a database local tem o schema aplicado.
if [ ! -d ".wrangler/state/v3/d1" ]; then
  info "Aplicando migrations locais (primeira execução)…"
  bash "$SCRIPT_DIR/db-migrate.sh" local || warn "Falha nas migrations locais — siga e verifique o D1."
fi

step "Servidor local em http://localhost:${DEV_PORT}"
log "Cliente: http://localhost:${DEV_PORT}/client/   ·   Admin: http://localhost:${DEV_PORT}/admin/"
exec $WRANGLER_BIN pages dev "$PUBLIC_DIR" --compatibility-date="$COMPAT_DATE" --port "$DEV_PORT"
