# Estrutura do projeto

```txt
noru-reviews-cloudflare/
├── src/
│   ├── worker.ts                    # Entrada do Worker: serve public/ e roteia /api/*
│   └── server/
│       ├── app.ts                   # Rotas HTTP e regras de negócio
│       ├── auth.ts                  # Login, sessão e cookies HttpOnly
│       ├── crypto.ts                # Hash de senha e token de sessão
│       ├── http.ts                  # JSON, CORS, erros e headers
│       ├── types.ts                 # Tipos do ambiente Cloudflare
│       └── validators.ts            # Validação de payloads
├── migrations/
│   └── 0001_init.sql                # Schema D1
├── scripts/                         # Automação de setup/dev/deploy (ver scripts/README.md)
│   ├── _common.sh                   # Helpers compartilhados
│   ├── setup.sh                     # Bootstrap do ambiente
│   ├── dev.sh                       # Dev local com checagens
│   ├── db-create.sh                 # Cria D1 e grava database_id
│   ├── db-migrate.sh                # Migrations local/remote
│   ├── db-reset.sh                  # Zera D1 local
│   ├── seed.sh                      # Dados de exemplo
│   ├── secrets.sh                   # Secrets do Pages
│   ├── create-admin.sh             # Cria o primeiro admin
│   ├── smoke.sh                     # Smoke test da API
│   └── deploy.sh                    # Pipeline de deploy
├── public/
│   ├── admin/                       # Interface admin estática
│   │   ├── index.html               # Estrutura do painel
│   │   ├── js/app.js                # Integração com API admin
│   │   └── vendor/                  # QR Code vendorizado (sem CDN externo)
│   ├── client/                      # Interface pública estática
│   │   ├── index.html               # Estrutura do formulário público
│   │   └── js/app.js                # Integração com API pública
│   ├── assets/                      # Assets públicos (logo, favicon.svg)
│   ├── site.webmanifest             # PWA / ícones
│   ├── _headers                     # Headers dos estáticos (CSP, cache)
│   └── _redirects                   # Rotas estáticas amigáveis
├── docs/
│   ├── API.md                       # Contrato da API
│   ├── DEPLOY_CLOUDFLARE.md         # Deploy Cloudflare
│   └── PROJECT_STRUCTURE.md         # Esta árvore
├── .github/workflows/ci.yml         # CI (typecheck; deploy é via Workers Builds)
├── wrangler.toml                    # Configuração Cloudflare
├── package.json                     # Scripts do projeto
├── tsconfig.json                    # TypeScript
├── .nvmrc                           # Versão do Node
├── .dev.vars.example                # Variáveis locais
└── .prod.vars.example               # Segredos de produção (npm run secrets)
```

## Separação principal

- `public/` contém somente arquivos servidos ao navegador; integrações ficam em `public/**/js/app.js`.
- `src/worker.ts` serve os estáticos (binding ASSETS) e expõe a API em `/api/*`.
- `src/server/` concentra autenticação, validações e acesso ao D1.
- `migrations/` define o banco versionado.
