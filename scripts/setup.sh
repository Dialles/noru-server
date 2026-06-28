#!/usr/bin/env bash
# Bootstrap completo do ambiente de desenvolvimento NORU Reviews.
#  1. Verifica dependências
#  2. Garante .dev.vars com segredos gerados
#  3. Instala dependências npm (se faltarem)
#  4. Cria a database D1 e grava o id no wrangler.toml
#  5. Aplica as migrations locais
source "$(dirname "$0")/_common.sh"

step "1/5 · Dependências"
require_cmd node "Instale o Node.js 22+ (https://nodejs.org)."
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || die "Node 22+ necessário (atual: $(node --version))."
ok "Node $(node --version)"

step "2/5 · Variáveis locais (.dev.vars)"
if [ -f .dev.vars ]; then
  ok ".dev.vars já existe (mantido)."
else
  [ -f .dev.vars.example ] || die ".dev.vars.example não encontrado."
  setup_token="$(gen_secret)"
  hash_salt="$(gen_secret)"
  tmp="$(mktemp)"
  awk -v st="$setup_token" -v hs="$hash_salt" '
    /^SETUP_TOKEN=/ { print "SETUP_TOKEN=" st; next }
    /^HASH_SALT=/   { print "HASH_SALT=" hs; next }
    { print }
  ' .dev.vars.example > "$tmp" && mv "$tmp" .dev.vars
  ok ".dev.vars criado com SETUP_TOKEN e HASH_SALT aleatórios."
fi

step "3/5 · Dependências npm"
if [ -d node_modules ]; then
  ok "node_modules presente."
elif command -v npm >/dev/null 2>&1 && npm --version >/dev/null 2>&1; then
  info "Rodando 'npm install'…"
  npm install
  ok "Dependências instaladas."
else
  warn "npm indisponível — pule e rode 'npm install' manualmente antes do deploy."
fi

step "4/5 · Database D1"
if $WRANGLER_BIN --version >/dev/null 2>&1; then
  bash "$SCRIPT_DIR/db-create.sh"
else
  warn "Wrangler indisponível. Rode 'npm install' e depois 'npm run db:create'."
fi

step "5/5 · Migrations locais"
if $WRANGLER_BIN --version >/dev/null 2>&1; then
  bash "$SCRIPT_DIR/db-migrate.sh" local
else
  warn "Pulei as migrations (sem wrangler)."
fi

step "Pronto"
cat <<EOF
${C_GRN}Ambiente preparado.${C_RESET}

Próximos passos:
  ${C_BLD}npm run dev${C_RESET}           inicia o servidor local em http://localhost:${DEV_PORT}
  ${C_BLD}npm run create-admin${C_RESET}  cria o primeiro admin (usa o SETUP_TOKEN do .dev.vars)
  ${C_BLD}npm run db:seed${C_RESET}       (opcional) popula dados de exemplo

Para produção: ${C_BLD}npm run secrets${C_RESET} e ${C_BLD}npm run deploy${C_RESET}.
EOF
