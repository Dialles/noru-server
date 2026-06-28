#!/usr/bin/env bash
# Popula a database com feedbacks de exemplo (para testar dashboard e listas).
# Uso: scripts/seed.sh [--remote]   (padrão: local)
source "$(dirname "$0")/_common.sh"

require_wrangler
require_cmd node "Necessário para gerar os dados de exemplo."

target="local"; flag="--local"
if [ "${1:-}" = "--remote" ]; then target="remote"; flag="--remote"; fi

step "Seed de dados de exemplo ($target)"
if [ "$target" = "remote" ] && ! confirm "Inserir dados de exemplo na database REMOTA?"; then
  info "Cancelado."
  exit 0
fi

sql_file="$(mktemp /tmp/noru-seed.XXXXXX.sql)"
trap 'rm -f "$sql_file"' EXIT

node > "$sql_file" <<'NODE'
const tenant = 'tenant_noru';
const esc = s => String(s).replace(/'/g, "''");
const day = 24 * 60 * 60 * 1000;
const samples = [
  [5, 'promoter',        'Marina Alves',  'Comida impecável e atendimento atencioso.', 'mesa:12'],
  [5, 'promoter',        'Rafael Souza',  'Melhor sushi de Brasília, voltarei!',        'mesa:04'],
  [4, 'promoter',        'Júlia Antunes', 'Ambiente lindo, só o tempo de espera pesou.','mesa:08'],
  [4, 'new',             'Pedro Lima',    'Boa experiência no geral.',                  'mesa:15'],
  [3, 'needs_attention', 'Carla Nunes',   'Atendimento demorou um pouco.',              'mesa:02'],
  [2, 'needs_attention', 'Bruno Dias',    'Prato veio frio, mas resolveram na hora.',   'mesa:21'],
  [5, 'resolved',        'Ana Prado',     'Excelente coquetelaria.',                    'mesa:06'],
  [1, 'contacted',       'Lucas Reis',    'Reserva não estava registrada.',             'mesa:09'],
  [4, 'new',             'Sofia Martins', 'Gostei bastante do rodízio.',                'mesa:11'],
  [3, 'archived',        'Diego Costa',   'Experiência regular.',                       'mesa:17'],
  [5, 'promoter',        'Helena Vieira', 'Ocasião especial perfeita.',                 'mesa:03'],
  [4, 'resolved',        'Tiago Moraes',  'Voltaria com a família.',                    'mesa:19'],
];

const lines = [];
const ids = [];
samples.forEach((s, i) => {
  const [rating, status, name, comment, table] = s;
  const id = (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID());
  ids.push({ id, status });
  const created = new Date(Date.now() - (i * 2 + 1) * day).toISOString();
  const scores = JSON.stringify({ nps: Math.min(10, rating * 2), ponto_chave: rating >= 4 ? 'comida' : 'tempo' });
  lines.push(
    `INSERT INTO feedbacks (id, tenant_id, rating, comment, customer_name, table_code, ` +
    `contact_permission, question_scores_json, metadata_json, status, created_at, updated_at) VALUES (` +
    `'${id}','${tenant}',${rating},'${esc(comment)}','${esc(name)}','${esc(table)}',1,` +
    `'${esc(scores)}','{}','${status}','${created}','${created}');`
  );
});

// alguns cliques de plataforma para os promotores
ids.filter(x => x.status === 'promoter').forEach((x, i) => {
  const id = (globalThis.crypto?.randomUUID?.() ?? require('crypto').randomUUID());
  const created = new Date(Date.now() - (i + 1) * day).toISOString();
  const platform = i % 2 === 0 ? 'google' : 'tripadvisor';
  lines.push(
    `INSERT INTO review_clicks (id, tenant_id, feedback_id, platform, metadata_json, created_at) VALUES (` +
    `'${id}','${tenant}','${x.id}','${platform}','{}','${created}');`
  );
});

process.stdout.write(lines.join('\n') + '\n');
NODE

rows="$(grep -c 'INSERT INTO' "$sql_file" || echo 0)"
info "Inserindo $rows registros…"
run_wrangler d1 execute "$DB_NAME" "$flag" --yes --file="$sql_file"
ok "Seed concluído ($target)."
