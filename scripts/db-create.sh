#!/usr/bin/env bash
# Cria a database D1 (se ainda não existir) e grava o database_id no wrangler.toml.
source "$(dirname "$0")/_common.sh"

require_wrangler

step "Database D1 '$DB_NAME'"

existing_id="$(d1_database_id || true)"
if [ -n "$existing_id" ]; then
  ok "Database já existe (id: $existing_id)."
else
  info "Criando database '$DB_NAME'…"
  run_wrangler d1 create "$DB_NAME" || die "Falha ao criar a database. Você está logado? (npx wrangler login)"
  existing_id="$(d1_database_id || true)"
  [ -n "$existing_id" ] || die "Database criada, mas não consegui obter o id. Rode novamente."
  ok "Database criada (id: $existing_id)."
fi

current_id="$(awk -F'"' '/^[[:space:]]*database_id[[:space:]]*=/{print $2}' wrangler.toml | head -1)"
if [ "$current_id" = "$existing_id" ]; then
  ok "wrangler.toml já aponta para o id correto."
else
  patch_wrangler_db_id "$existing_id"
  ok "wrangler.toml atualizado com database_id=$existing_id"
fi
