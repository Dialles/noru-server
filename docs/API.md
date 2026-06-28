# API — NORU Reviews

Base path: `/api`

Todas as respostas usam JSON.

## Público

### `GET /api/health`

Verifica se a API está online.

### `GET /api/feedback/config?tenant=noru`

Retorna configurações públicas do tenant.

Resposta:

```json
{
  "ok": true,
  "tenant": { "id": "tenant_noru", "slug": "noru", "name": "Noru Sushi Lounge" },
  "settings": {
    "review_min_rating": 4,
    "public_message": "Obrigado por compartilhar sua experiência.",
    "negative_message": "Obrigado pelo feedback. A equipe irá analisar com atenção.",
    "whatsapp_url": "https://wa.me/5561992760230",
    "public_page_url": "https://seudominio.com.br/client/?tenant=noru",
    "stable_qr_url": "https://seudominio.com.br/client/?tenant=noru",
    "questions": [],
    "platforms": [
      { "id": "google", "label": "Google", "url": "https://..." }
    ]
  }
}
```

### `POST /api/feedback`

Registra feedback interno.

Payload mínimo:

```json
{
  "tenant_slug": "noru",
  "rating": 5,
  "comment": "Excelente experiência."
}
```

Payload completo:

```json
{
  "tenant_slug": "noru",
  "rating": 5,
  "customer_name": "Cliente",
  "customer_phone": "+55 00 00000-0000",
  "customer_email": "cliente@email.com",
  "visit_date": "2026-06-28",
  "table_code": "M12",
  "contact_permission": true,
  "comment": "Excelente experiência.",
  "question_scores": {
    "food": 5,
    "service": 5,
    "ambience": 4,
    "wait_time": 4
  }
}
```

Se a nota for maior ou igual a `review_min_rating`, a resposta retorna `next_action: "external_review"` e a lista de plataformas configuradas.

### `POST /api/feedback/click`

Registra clique em plataforma externa de review.

```json
{
  "tenant_slug": "noru",
  "feedback_id": "uuid-opcional",
  "platform": "google"
}
```

## Admin

As rotas admin usam cookie HttpOnly criado no login.

### `POST /api/admin/setup`

Cria o primeiro admin. Só funciona se ainda não existir admin.

Header obrigatório:

```txt
x-setup-token: valor-de-SETUP_TOKEN
```

Payload:

```json
{
  "tenant_slug": "noru",
  "tenant_name": "Noru Sushi Lounge",
  "email": "admin@seudominio.com",
  "password": "senha-com-10-ou-mais-caracteres",
  "name": "Administrador"
}
```

### `POST /api/admin/auth/login`

```json
{
  "email": "admin@seudominio.com",
  "password": "senha"
}
```

### `POST /api/admin/auth/logout`

Remove a sessão atual.

### `GET /api/admin/me`

Retorna o admin autenticado.

### `GET /api/admin/dashboard?days=30`

Retorna métricas, distribuição de notas, cliques externos e feedbacks recentes.

### `GET /api/admin/feedback?status=needs_attention&rating=3&limit=30&offset=0`

Lista feedbacks com filtros opcionais e retorna `total`, `limit`, `offset` e `feedbacks`.

### `GET /api/admin/feedback/:id`

Retorna um feedback específico.

### `PATCH /api/admin/feedback/:id`

Atualiza status e nota interna.

```json
{
  "status": "resolved",
  "internal_note": "Cliente contatado."
}
```

Status aceitos:

```txt
new, needs_attention, contacted, resolved, archived, promoter
```

### `GET /api/admin/settings`

Retorna configurações do tenant autenticado.

### `PATCH /api/admin/settings`

Atualiza configurações permitidas.

```json
{
  "review_min_rating": 4,
  "google_review_url": "https://...",
  "tripadvisor_review_url": "https://...",
  "instagram_url": "https://...",
  "whatsapp_url": "https://wa.me/55...",
  "public_page_url": "https://seudominio.com.br/client/?tenant=noru",
  "stable_qr_url": "https://seudominio.com.br/client/?tenant=noru",
  "public_message": "Obrigado por compartilhar sua experiência.",
  "negative_message": "Obrigado pelo feedback. A equipe irá analisar com atenção.",
  "questions": [
    { "id": "food", "label": "Comida", "type": "rating" }
  ]
}
```
