#!/usr/bin/env bash
# Cria o primeiro admin chamando POST /api/admin/setup.
# Uso:
#   scripts/create-admin.sh [--url <base>] [--email <e>] [--password <p>]
#                           [--name <n>] [--tenant <slug>] [--token <setup_token>]
# Sem --url usa o ambiente local (http://localhost:PORT).
# O SETUP_TOKEN é lido de --token, da env SETUP_TOKEN ou do .dev.vars.
source "$(dirname "$0")/_common.sh"

require_cmd curl "Necessário para chamar a API."

BASE_URL="http://localhost:${DEV_PORT}"
EMAIL=""; PASSWORD=""; NAME="Administrador"; TENANT="${PUBLIC_TENANT_SLUG:-noru}"; TOKEN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --url) BASE_URL="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --tenant) TENANT="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    *) die "Argumento desconhecido: $1" ;;
  esac
done

# Token: prioridade para --token, depois env, depois .dev.vars
if [ -z "$TOKEN" ]; then
  TOKEN="${SETUP_TOKEN:-}"
fi
if [ -z "$TOKEN" ] && [ -f .dev.vars ]; then
  load_vars_file .dev.vars || true
  TOKEN="${SETUP_TOKEN:-}"
fi
[ -n "$TOKEN" ] || die "SETUP_TOKEN não definido. Use --token, env SETUP_TOKEN ou .dev.vars."

BASE_URL="${BASE_URL%/}"

step "Criar admin em $BASE_URL"
if [ -z "$EMAIL" ]; then printf 'E-mail do admin: ' >&2; read -r EMAIL; fi
[ -n "$EMAIL" ] || die "E-mail obrigatório."
if [ -z "$PASSWORD" ]; then
  printf 'Senha (mín. 10 caracteres): ' >&2; read -rs PASSWORD; printf '\n' >&2
fi
[ "${#PASSWORD}" -ge 10 ] || die "Senha deve ter ao menos 10 caracteres."

payload="$(node -e '
  const [tenant,name,email,password]=process.argv.slice(1);
  process.stdout.write(JSON.stringify({tenant_slug:tenant,tenant_name:"Noru Sushi Lounge",name,email,password}));
' "$TENANT" "$NAME" "$EMAIL" "$PASSWORD")"

tmp="$(mktemp)"
code="$(curl -s -o "$tmp" -w '%{http_code}' \
  -X POST "$BASE_URL/api/admin/setup" \
  -H 'content-type: application/json' \
  -H "x-setup-token: $TOKEN" \
  -d "$payload")"

body="$(cat "$tmp")"; rm -f "$tmp"

case "$code" in
  201) ok "Admin criado: $EMAIL (tenant: $TENANT)";;
  409) warn "Já existe admin neste ambiente (HTTP 409). Faça login normalmente.";;
  403) die "Token de setup inválido (HTTP 403).";;
  000) die "Não consegui conectar em $BASE_URL. O servidor está rodando?";;
  *)   die "Falha (HTTP $code): $body";;
esac
