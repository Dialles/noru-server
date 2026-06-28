#!/usr/bin/env bash
# Smoke test da API. Uso: scripts/smoke.sh [base_url]   (padrão: local)
source "$(dirname "$0")/_common.sh"

require_cmd curl "Necessário para o smoke test."

BASE_URL="${1:-http://localhost:${DEV_PORT}}"
BASE_URL="${BASE_URL%/}"
fail=0

check() {
  local label="$1" url="$2" expect="${3:-200}"
  local tmp code; tmp="$(mktemp)"
  code="$(curl -s -o "$tmp" -w '%{http_code}' --max-time 15 "$url" || echo 000)"
  if [ "$code" = "$expect" ]; then
    ok "$label ($code)"
  else
    warn "$label esperava $expect, recebeu $code"
    [ -s "$tmp" ] && log "$(head -c 200 "$tmp")"
    fail=1
  fi
  rm -f "$tmp"
}

step "Smoke test · $BASE_URL"
check "GET /api/health" "$BASE_URL/api/health" 200
check "GET /api/feedback/config" "$BASE_URL/api/feedback/config?tenant=${PUBLIC_TENANT_SLUG:-noru}" 200
check "GET /client/ (página pública)" "$BASE_URL/client/" 200
check "GET /admin/ (painel)" "$BASE_URL/admin/" 200

# Confere o status do banco reportado pelo health.
health="$(curl -s --max-time 15 "$BASE_URL/api/health" || true)"
if printf '%s' "$health" | grep -q '"database": *"ok"'; then
  ok "D1 acessível (database: ok)"
else
  warn "Health não confirmou D1: $(printf '%s' "$health" | head -c 160)"
  fail=1
fi

echo
if [ "$fail" = "0" ]; then
  ok "Smoke test OK."
else
  die "Smoke test encontrou problemas."
fi
