#!/usr/bin/env bash
# Aplica as migrations do D1. Uso: db-migrate.sh [local|remote]   (padrão: local)
source "$(dirname "$0")/_common.sh"

require_wrangler

target="${1:-local}"
case "$target" in
  local)  flag="--local" ;;
  remote) flag="--remote" ;;
  *) die "Alvo inválido: '$target'. Use 'local' ou 'remote'." ;;
esac

if [ "$target" = "remote" ]; then
  current_id="$(awk -F'"' '/^[[:space:]]*database_id[[:space:]]*=/{print $2}' wrangler.toml | head -1)"
  case "$current_id" in
    ""|REPLACE_WITH_D1_DATABASE_ID)
      die "wrangler.toml ainda sem database_id. Rode 'npm run db:create' antes do remoto." ;;
  esac
fi

step "Aplicando migrations ($target)"
run_wrangler d1 migrations apply "$DB_NAME" "$flag"
ok "Migrations aplicadas em $target."
