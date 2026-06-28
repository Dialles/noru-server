#!/usr/bin/env bash
# Zera a database D1 LOCAL (estado em .wrangler) e reaplica as migrations.
# Não afeta a database remota.
source "$(dirname "$0")/_common.sh"

require_wrangler

step "Reset da database local"
warn "Isto apaga todos os dados locais de desenvolvimento (.wrangler/state)."
if ! confirm "Continuar?"; then
  info "Cancelado."
  exit 0
fi

state_dir=".wrangler/state/v3/d1"
if [ -d "$state_dir" ]; then
  rm -rf "$state_dir"
  ok "Estado local do D1 removido."
else
  log "Nenhum estado local encontrado (nada a apagar)."
fi

bash "$SCRIPT_DIR/db-migrate.sh" local
ok "Database local recriada."
