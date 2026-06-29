<<<<<<< HEAD
# Design — Novos recursos do Painel de Gestão
=======
# Design — Painel de Gestão: tela única (lista de avaliações)
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))

Data: 2026-06-29
Branch base: `fix/admin-panel-audit`

## Contexto

<<<<<<< HEAD
O painel admin (`public/admin/`) é uma SPA simples com 4 seções (dashboard, reviews,
settings, qr) servida estaticamente, com backend em Cloudflare Workers + D1
(`src/server/app.ts`). Esta entrega adiciona recursos à página de gestão e remove
o recurso de QR Code.
=======
O painel admin (`public/admin/`) hoje é uma SPA com 4 seções (dashboard, reviews,
settings, qr) + navegação, servida estaticamente, com backend em Cloudflare Workers
+ D1 (`src/server/app.ts`).

Esta entrega **simplifica o admin para uma única tela**: o conteúdo principal passa
a ser só a lista de avaliações (com filtros e ações), e a sidebar passa a ser só as
configurações da página do cliente. Todo o resto é removido (KPIs, QR, navegação
entre seções, troca de senha, identidade do negócio).
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))

Restrição de ambiente: o container local não roda `workerd` (limite de memória),
então a verificação é por typecheck (`tsc`) + revisão. Teste funcional fica para o
deploy.

## Decisões de escopo (confirmadas com o usuário)

<<<<<<< HEAD
- **"Excluir avaliação" = arquivar**: usa o status `archived` que já existe via
  `PATCH /admin/feedback/:id`. Sem DELETE real, sem migração, sem perda de dados.
- **Filtros**: busca por texto, nota, período (datas) e ordenação — todos
  server-side.
- **Configurações**: identidade do negócio editável, troca de senha do admin, e
  reorganização dos grupos. O editor de perguntas do formulário foi **adiado**: a
  página do cliente não renderiza `settings.questions` (formulário fixo/custom), e
  habilitá-lo exigiria reescrever o formulário do cliente — fica como follow-up.
- **QR Code**: remoção completa (UI, JS, libs vendor, campos de settings órfãos).
- **Sem migração de banco**: tudo cabe nas tabelas atuais (`settings` é key/value;
  arquivar e troca de senha usam tabelas existentes).
- **Identidade do negócio**: é exibição no painel (settings keys
  `business_name`/`business_location`); não renomeia o `tenant` nem altera a página
  do cliente.
- **WhatsApp**: mensagem padrão fixa, sem novo campo de template configurável.

Confirmação de segurança da remoção do QR: a página do cliente
(`public/client/js/app.js`) usa apenas `whatsapp_url`. Não consome
`public_page_url` nem `stable_qr_url`, então remover a UI do QR e esses 2 campos é
seguro.

## 1. Backend — `/admin/feedback` (lista): novos parâmetros

Estende `adminFeedbackList` em `src/server/app.ts`. Mantém `status`, `rating`,
`limit`, `offset`. Adiciona:

- `q` — busca: `(customer_name LIKE ? ESCAPE '\' OR comment LIKE ? ESCAPE '\')`.
  Escapar `%`, `_` e `\` no termo; envolver em `%termo%`. Limitar tamanho (ex.: 80
  chars) via `asString`.
- `from` / `to` — intervalo sobre `created_at`. Validar formato ISO de data
  (`YYYY-MM-DD`). `from` → `created_at >= from`. `to` → `created_at <= to + fim do
  dia` (acrescentar `T23:59:59.999Z` ou comparar com `< to+1 dia`). Datas inválidas
  retornam `400 validation_error`.
- `sort` — whitelist mapeada para `ORDER BY` seguro (nunca interpolar input do
  usuário):
=======
- **Tela única**: apagar todos os recursos e deixar somente um "dashboard" com a
  lista das avaliações, filtros e ações personalizadas.
- **Sidebar = configurações** com todos os parâmetros ajustáveis da página do
  cliente.
- **Sem faixa de KPIs** no topo (tela 100% focada na lista).
- **Sem QR Code** (remoção completa: UI, JS, libs vendor, campos de settings
  órfãos).
- **Ações por avaliação**: núcleo (WhatsApp, Abrir detalhe, Arquivar) + extra
  escolhido: **Status rápido** (select inline).
- **"Excluir avaliação" = arquivar** (status `archived`) via `PATCH
  /admin/feedback/:id`. Sem DELETE real, sem migração.
- **Removidos** (em relação a iterações anteriores do design): troca de senha do
  admin, identidade do negócio editável, editor de perguntas do formulário, e
  faixa de KPIs.
- **Sem migração de banco**.

Confirmação de segurança da remoção do QR: a página do cliente
(`public/client/js/app.js`) usa apenas `whatsapp_url`, `review_min_rating` e
`platforms`. Não consome `public_page_url` nem `stable_qr_url`, então remover a UI
do QR e esses campos é seguro.

## Layout alvo

```
┌─ sidebar ──────────┬─ main ─────────────────────────────────┐
│ NORU (marca)       │ topbar:  Avaliações · Atualizar · Sair  │
│                    │                                          │
│ CONFIGURAÇÕES      │ [ Todas Novas Atenção Contatadas        │
│  Nota mínima       │   Resolvidas Promotoras Arquivadas ]     │
│  WhatsApp          │ [ busca | nota | de–até | ordenação | × ]│
│  Google            │ ┌ tabela de avaliações ────────────────┐ │
│  Tripadvisor       │ │ Cliente · Nota · Comentário · Origem  │ │
│  Instagram         │ │ Status · Ações                        │ │
│  Msg nota alta     │ │ …                                     │ │
│  Msg nota baixa    │ └───────────────────────────────────────┘ │
│  [Salvar][Recarregar]                                          │
└────────────────────┴──────────────────────────────────────────┘
```

Mobile: a sidebar continua off-canvas com o toggle (hambúrguer) que já existe.

## 1. Backend — `/admin/feedback` (lista): novos parâmetros

Único arquivo de backend tocado: `adminFeedbackList` em `src/server/app.ts`.
Mantém `status`, `rating`, `limit`, `offset`. Adiciona:

- `q` — busca: `(customer_name LIKE ? ESCAPE '\' OR comment LIKE ? ESCAPE '\')`.
  Escapar `%`, `_` e `\` no termo; envolver em `%termo%`. Limitar tamanho (≤80) via
  `asString`.
- `from` / `to` — intervalo sobre `created_at`. Validar `YYYY-MM-DD`. `from` →
  `created_at >= from`. `to` → `created_at < to+1 dia` (cobre o dia inteiro). Data
  inválida → `400 validation_error`.
- `sort` — whitelist mapeada para `ORDER BY` seguro (nunca interpolar input):
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))
  - `recent` (padrão) → `created_at DESC`
  - `oldest` → `created_at ASC`
  - `rating_high` → `rating DESC, created_at DESC`
  - `rating_low` → `rating ASC, created_at DESC`

<<<<<<< HEAD
O bloco `where`/`binds` já é montado dinamicamente; os novos filtros entram no
mesmo padrão. A query de `COUNT` usa o mesmo `where`/`binds` (sem `sort`).

## 2. Backend — Troca de senha (novo endpoint)

`POST /admin/account/password` com `{ current_password, new_password }`.

- Exige sessão (`requireAdmin`).
- Verifica `current_password` contra o hash do admin (reusar verificação do
  `auth.ts` / `crypto.ts`; a mesma rotina usada no login).
- Valida `new_password` (mín. 10, máx. 160) via `asString`.
- Grava novo hash (`hashPassword`), atualiza `updated_at`.
- Registra `audit_logs` com action `admin.password_change` (sem senha no payload).
- Rota registrada em `handleRequest` antes do match genérico de feedback.

Decisão: não invalidar outras sessões nesta entrega (mantém simples; pode ser
follow-up).

## 3. Backend — Settings

Em `adminSettings` / `validateSetting`:

- `allowedKeys` += `business_name`, `business_location`.
- `validateSetting`: `business_name`, `business_location` → `asString` (máx. ~120).
- `DEFAULT_SETTINGS` ganha `business_name` e `business_location` com valores atuais
  ("Noru Sushi Lounge" / "Salão principal · São Paulo") para retrocompatibilidade.

O tratamento de `questions` fica como está (sem editor nesta entrega).

Os campos `stable_qr_url`/`public_page_url` permanecem em `allowedKeys` no backend
(inofensivo), mas saem da UI. Não há necessidade de removê-los do backend.

## 4. Frontend — Reviews (filtros + ações contextuais)

`public/admin/index.html` (seção `#reviews`) e `public/admin/js/app.js`.

### Barra de filtros
- Chips de status: `all`, `new`, `needs_attention`, `contacted`, `resolved` **+
  nova chip `archived` ("Arquivadas")**.
=======
`where`/`binds` seguem o padrão dinâmico já existente; o `COUNT` reusa o mesmo
`where`/`binds` (sem `sort`).

Nenhum outro endpoint muda. `/admin/dashboard` continua existindo no backend mas
deixa de ser chamado pelo front (inofensivo). Sem endpoint novo. Settings já
suporta todos os parâmetros usados (sem alteração de `allowedKeys`/`validateSetting`).

## 2. Frontend — estrutura geral (`public/admin/index.html` + `js/app.js`)

Reescrita do admin para tela única:

- Remove a navegação entre seções (`.nav` com Dashboard/Reviews/Settings/QR) e o
  conceito de `setSection`/`meta`.
- Remove a seção de KPIs do dashboard e o uso de `/admin/dashboard` no front
  (`loadDashboard`).
- Sidebar passa a conter a marca (logo) + o painel de Configurações.
- Topbar: título fixo "Avaliações", pill de identidade, "Atualizar", "Sair".
- Mantém auth screen, sessão, toasts, helpers de formatação/escape.

## 3. Frontend — Configurações na sidebar

Campos (todos parâmetros consumidos pela página do cliente), via
`GET/PATCH /admin/settings` já existentes:

- `review_min_rating` (select 1–5)
- `whatsapp_url`
- `google_review_url`, `tripadvisor_review_url`, `instagram_url`
- `public_message` (mensagem p/ nota alta)
- `negative_message` (mensagem p/ nota baixa)
- Botões "Salvar" e "Recarregar".

`fillSettingsForm`/`collectSettingsForm` enxutos para esses campos. Removidos
`stable_qr_url` e `public_page_url` da UI. Sem editor de perguntas, sem identidade
do negócio, sem troca de senha.

## 4. Frontend — Lista de avaliações (filtros)

### Barra de filtros
- Chips de status: `all`, `new`, `needs_attention`, `contacted`, `resolved`,
  `promoter`, **+ `archived` ("Arquivadas")**.
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))
- Campo de busca (input text) com debounce (~250ms) → `q`.
- Select de nota: Todas / 5 / 4 / 3 / 2 / 1 → `rating`.
- Dois inputs `type="date"` (de/até) → `from`/`to`.
- Select de ordenação → `sort`.
<<<<<<< HEAD
- Botão "Limpar" reseta filtros para o padrão.

`loadFeedbacks` passa a montar `URLSearchParams` a partir de um objeto de estado de
filtros (`state.filters`) em vez de só `filter`.

### Ações por linha
A célula "Ações" da tabela ganha botões compactos (ícone):
- **WhatsApp** — só aparece se `customer_phone` existir; abre
  `https://wa.me/<digits>?text=<msg>` em nova aba. `<digits>` = telefone sem
  não-dígitos. `<msg>` = saudação padrão usando `business_name`.
- **Abrir** — abre o modal de detalhe (já existe).
- **Arquivar** — "excluir": confirma e faz `PATCH status=archived`, recarrega lista
  e dashboard.

### Modal de detalhe
Adiciona uma linha de ações rápidas: **Chamar no WhatsApp** (se telefone),
**Copiar contato** (telefone/email para clipboard), **Arquivar**. Mantém o
select de status + nota interna + "Salvar tratativa" já existentes.

## 5. Frontend — Configurações (reorganizado)

Seção `#settings` reescrita em grupos:

1. **Identidade do negócio** — `business_name`, `business_location`. Após salvar,
   re-renderiza a sidebar (bloco `.tenant`) e, se aplicável, o subtítulo.
2. **Plataformas externas** — Google / Tripadvisor / Instagram (mantém).
3. **Mensagens de retorno** — nota alta / nota baixa (mantém).
4. **WhatsApp** — `whatsapp_url` (mantém; sai do grupo "públicas").
5. **Conta** — formulário de troca de senha (atual + nova + confirmar) →
   `POST /admin/account/password`.

(O editor de perguntas foi adiado — ver "Não incluído".)

Removidos da UI: campos `stable_qr_url` e `public_page_url`.

`fillSettingsForm` / `collectSettingsForm` atualizados para os novos campos e sem os
campos de QR. A identidade do negócio é aplicada à sidebar no carregamento de
settings.

## 6. Remoção do QR

- **HTML** (`public/admin/index.html`):
  - Remove o botão de nav "QR Code".
  - Remove a seção `#qr` inteira.
  - Remove o card "Canal público" do dashboard; substitui por card de
    **distribuição de notas** (usa `data.distribution` já retornado pelo
    `/admin/dashboard`).
  - Remove os 2 `<script src=".../vendor/qrcode-*.js">`.
  - Remove o CSS específico do QR (`.qr-layout`, `.qr-box`, `#qrCanvas`,
    `.qr-fallback`, `.url-box`, `.history*`, regras de `@media print` do QR).
- **JS** (`public/admin/js/app.js`):
  - Remove `renderQr`, `renderQrDebounced`, `syncQrFromSettings`, `saveRedirect`,
    `downloadQr`, `renderHistory`, `renderRecentHistory`, `state.historyItems`, e os
    binds/handlers do QR. Remove `qr` de `meta`.
  - `loadDashboard` passa a renderizar a distribuição de notas no novo card.
- **Arquivos**: deleta `public/admin/vendor/qrcode-generator.min.js` e
  `public/admin/vendor/qrcode-canvas.js` (e a pasta `vendor/` se ficar vazia).
- **Texto**: ajustar `<meta name="description">` e o `<title>` para não citar QR.
=======
- Botão "Limpar" reseta filtros ao padrão.

`loadFeedbacks` monta `URLSearchParams` a partir de `state.filters` (objeto único)
em vez de só `filter`.

### Tabela
Colunas: Cliente (nome + data) · Nota (estrelas) · Comentário (truncado) · Origem
(`table_code`) · Status (badge) · Ações.

## 5. Frontend — Ações por avaliação (personalizadas)

Na célula "Ações" de cada linha:

- **WhatsApp** — só se `customer_phone` existir; abre
  `https://wa.me/<digits>?text=<msg>` em nova aba. `<digits>` = telefone só com
  dígitos (best-effort; assume DDI já presente). `<msg>` = saudação padrão.
- **Status rápido** — `<select>` nativo inline com Nova / Atenção / Contatada /
  Resolvida / Promotora; `onchange` faz `PATCH status=...` e atualiza a linha.
  (Native select = acessível, sem menu custom, ok no mobile.)
- **Arquivar** — ícone (lixeira) = "excluir"; confirma e faz `PATCH
  status=archived`; recarrega a lista.
- **Abrir** — abre o modal de detalhe.

### Modal de detalhe (mantido e enxuto)
Mostra cliente, nota, contato, origem, comentário; permite editar status + nota
interna ("Salvar tratativa"); inclui ações **Chamar no WhatsApp** e **Arquivar**.

## 6. Remoção do QR

- **HTML**: remove seção `#qr`, os 2 `<script src=".../vendor/qrcode-*.js">`, e o
  CSS do QR (`.qr-layout`, `.qr-box`, `#qrCanvas`, `.qr-fallback`, `.url-box`,
  `.history*`, regras `@media print` do QR). Ajusta `<title>`/`<meta description>`
  para não citar QR.
- **JS**: remove `renderQr`, `renderQrDebounced`, `syncQrFromSettings`,
  `saveRedirect`, `downloadQr`, `renderHistory`, `renderRecentHistory`,
  `state.historyItems` e binds relacionados.
- **Arquivos**: deleta `public/admin/vendor/qrcode-generator.min.js` e
  `public/admin/vendor/qrcode-canvas.js` (e a pasta `vendor/` se ficar vazia).
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))

## 7. Verificação

- `npx tsc --noEmit` (typecheck do worker) deve passar.
- Revisão manual do HTML/JS (sem `workerd` local).
<<<<<<< HEAD
- Checklist funcional para o usuário validar no deploy: filtros combinados,
  busca, ordenação, arquivar/desarquivar via chip "Arquivadas", WhatsApp abre com
  número correto, troca de senha, identidade do negócio na sidebar.
=======
- Checklist funcional para o usuário no deploy: filtros combinados (status+busca+
  nota+período+ordenação), chip "Arquivadas", WhatsApp abre com número correto,
  status rápido persiste, arquivar some da lista ativa, configurações da sidebar
  salvam e refletem na página do cliente.
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))

## Não incluído (follow-ups possíveis)

- Editor de perguntas do formulário + reescrita do formulário do cliente para
  renderizar `settings.questions` dinamicamente.
<<<<<<< HEAD
- DELETE real / lixeira de reviews.
- Template de mensagem de WhatsApp configurável.
- Edição do nome real do `tenant` / branding na página do cliente.
- Invalidação de sessões na troca de senha.
- Gestão de múltiplos admins (criar/remover/roles).
=======
- Troca de senha do admin / gestão de múltiplos admins.
- Identidade do negócio editável.
- Faixa de KPIs / dashboard analítico.
- DELETE real / lixeira de reviews.
- Template de mensagem de WhatsApp configurável.
>>>>>>> 931b1d1 (docs: design do painel de gestão em tela única (lista + filtros + ações))
