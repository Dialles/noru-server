# Design — Novos recursos do Painel de Gestão

Data: 2026-06-29
Branch base: `fix/admin-panel-audit`

## Contexto

O painel admin (`public/admin/`) é uma SPA simples com 4 seções (dashboard, reviews,
settings, qr) servida estaticamente, com backend em Cloudflare Workers + D1
(`src/server/app.ts`). Esta entrega adiciona recursos à página de gestão e remove
o recurso de QR Code.

Restrição de ambiente: o container local não roda `workerd` (limite de memória),
então a verificação é por typecheck (`tsc`) + revisão. Teste funcional fica para o
deploy.

## Decisões de escopo (confirmadas com o usuário)

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
  - `recent` (padrão) → `created_at DESC`
  - `oldest` → `created_at ASC`
  - `rating_high` → `rating DESC, created_at DESC`
  - `rating_low` → `rating ASC, created_at DESC`

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
- Campo de busca (input text) com debounce (~250ms) → `q`.
- Select de nota: Todas / 5 / 4 / 3 / 2 / 1 → `rating`.
- Dois inputs `type="date"` (de/até) → `from`/`to`.
- Select de ordenação → `sort`.
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

## 7. Verificação

- `npx tsc --noEmit` (typecheck do worker) deve passar.
- Revisão manual do HTML/JS (sem `workerd` local).
- Checklist funcional para o usuário validar no deploy: filtros combinados,
  busca, ordenação, arquivar/desarquivar via chip "Arquivadas", WhatsApp abre com
  número correto, troca de senha, identidade do negócio na sidebar.

## Não incluído (follow-ups possíveis)

- Editor de perguntas do formulário + reescrita do formulário do cliente para
  renderizar `settings.questions` dinamicamente.
- DELETE real / lixeira de reviews.
- Template de mensagem de WhatsApp configurável.
- Edição do nome real do `tenant` / branding na página do cliente.
- Invalidação de sessões na troca de senha.
- Gestão de múltiplos admins (criar/remover/roles).
