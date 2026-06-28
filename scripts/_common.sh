#!/usr/bin/env bash
# Funções e configurações compartilhadas pelos scripts do NORU Reviews.
# Use: source "$(dirname "$0")/_common.sh"

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuração (sobrescrevível por variáveis de ambiente)
# ---------------------------------------------------------------------------
DB_NAME="${NORU_DB_NAME:-noru_reviews}"
PROJECT_NAME="${NORU_PROJECT_NAME:-noru-reviews}"
COMPAT_DATE="${NORU_COMPAT_DATE:-2026-06-28}"
PUBLIC_DIR="${NORU_PUBLIC_DIR:-public}"
DEV_PORT="${NORU_DEV_PORT:-8788}"

# Raiz do projeto (um nível acima de scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Saída colorida
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET="$(printf '\033[0m')"; C_DIM="$(printf '\033[2m')"
  C_RED="$(printf '\033[31m')"; C_GRN="$(printf '\033[32m')"
  C_YLW="$(printf '\033[33m')"; C_BLU="$(printf '\033[36m')"; C_BLD="$(printf '\033[1m')"
else
  C_RESET=""; C_DIM=""; C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_BLD=""
fi

log()  { printf '%s\n' "${C_DIM}·${C_RESET} $*"; }
info() { printf '%s\n' "${C_BLU}›${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YLW}!${C_RESET} $*" >&2; }
die()  { printf '%s\n' "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }
step() { printf '\n%s\n' "${C_BLD}${C_BLU}» $*${C_RESET}"; }

# ---------------------------------------------------------------------------
# Wrangler (usa binário local via npx por padrão)
# ---------------------------------------------------------------------------
WRANGLER_BIN="${WRANGLER_BIN:-npx wrangler}"
run_wrangler() { $WRANGLER_BIN "$@"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Comando '$1' não encontrado. $2"
}

require_wrangler() {
  if ! $WRANGLER_BIN --version >/dev/null 2>&1; then
    die "Wrangler indisponível. Rode 'npm install' ou ajuste WRANGLER_BIN."
  fi
}

# ---------------------------------------------------------------------------
# Segredos e .dev.vars
# ---------------------------------------------------------------------------
gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# Exporta as variáveis de um arquivo KEY=VALUE (.dev.vars / .prod.vars).
load_vars_file() {
  local file="$1"
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    local key="${line%%=*}"
    local value="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || continue
    export "$key=$value"
  done < "$file"
}

confirm() {
  local prompt="${1:-Confirmar?} [s/N] " reply
  printf '%s' "$prompt" >&2
  read -r reply || true
  case "$reply" in [sSyY]*) return 0 ;; *) return 1 ;; esac
}

# UUID da database D1 (lendo `wrangler d1 list --json`)
d1_database_id() {
  run_wrangler d1 list --json 2>/dev/null | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{
        const list=JSON.parse(s);
        const row=(Array.isArray(list)?list:[]).find(x=>x.name===process.argv[1]);
        if(row&&row.uuid){process.stdout.write(row.uuid);}
      }catch(_){/* sem saída */}
    });
  ' "$DB_NAME"
}

# Substitui o database_id no wrangler.toml de forma portável.
patch_wrangler_db_id() {
  local id="$1" tmp
  tmp="$(mktemp)"
  awk -v id="$id" '
    /^[[:space:]]*database_id[[:space:]]*=/ { print "database_id = \"" id "\""; next }
    { print }
  ' wrangler.toml > "$tmp" && mv "$tmp" wrangler.toml
}
