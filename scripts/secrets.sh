#!/usr/bin/env bash
# Envia os segredos de produção para o Cloudflare Workers (wrangler secret put).
# Valores lidos de (nesta ordem): variáveis de ambiente, .prod.vars, .dev.vars.
# Segredos enviados: SETUP_TOKEN, HASH_SALT.
source "$(dirname "$0")/_common.sh"

require_wrangler

# Carrega valores sem sobrescrever o que já vier do ambiente.
_load_if_unset() {
  local file="$1"
  [ -f "$file" ] || return 0
  local before_setup="${SETUP_TOKEN:-}" before_hash="${HASH_SALT:-}"
  load_vars_file "$file" || true
  # Mantém precedência da env: restaura se já existia.
  [ -n "$before_setup" ] && export SETUP_TOKEN="$before_setup"
  [ -n "$before_hash" ] && export HASH_SALT="$before_hash"
}

_load_if_unset .prod.vars
_load_if_unset .dev.vars

SECRET_NAMES="SETUP_TOKEN HASH_SALT"

step "Segredos do Worker · projeto '$PROJECT_NAME'"
warn "As variáveis NÃO-secretas (PUBLIC_*, SESSION_*, ALLOWED_ORIGINS) ficam em [vars] no wrangler.toml ou no painel."

for name in $SECRET_NAMES; do
  value="$(eval "printf '%s' \"\${$name:-}\"")"
  if [ -z "$value" ] || printf '%s' "$value" | grep -qi 'troque-por'; then
    warn "$name ausente ou placeholder — pulado. Defina em .prod.vars ou na env."
    continue
  fi
  info "Enviando $name…"
  if printf '%s' "$value" | run_wrangler secret put "$name"; then
    ok "$name configurado."
  else
    die "Falha ao enviar $name. Você fez login? (npx wrangler login)"
  fi
done

ok "Segredos processados."
