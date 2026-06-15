# API consolidada — Vercel Hobby

## Problema resolvido

O plano Hobby da Vercel limita a quantidade de Serverless Functions por deploy. Como cada arquivo em `api/` conta como uma função, a arquitetura anterior ultrapassava o limite.

## Solução aplicada

Todas as rotas foram consolidadas em uma única função:

```text
api/[...path].js
```

Essa função atua como roteador interno e mantém os mesmos caminhos públicos usados pelo front.

## Rotas mantidas

```text
/api/forms
/api/reservations
/api/proposals
/api/catalog
/api/artists
/api/certificates
/api/certificate-document
/api/admin
/api/admin-update
/api/operational
/api/media
/api/selections
/api/dashboard
/api/auth/session
/api/auth/login
/api/auth/signup
/api/auth/logout
```

## O que não deve voltar

Não recriar arquivos separados como:

```text
api/forms.js
api/catalog.js
api/admin.js
api/dashboard.js
api/auth/login.js
```

Se esses arquivos voltarem, a Vercel volta a contar cada um como função separada e o erro de limite pode retornar.

## Como testar

Localmente:

```bash
npm install
npm run build
npm run check:backend
npm run dev
```

No navegador ou terminal:

```text
/api/catalog
/api/artists
/api/auth/session
```

Sem Supabase configurado, algumas rotas respondem em modo `demo`. Isso é esperado.

## Variáveis necessárias para produção real

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
```

## Critério de sucesso

- Deploy na Vercel não acusa limite de funções.
- `api/[...path].js` existe.
- Arquivos serverless antigos não existem.
- Front continua chamando as mesmas URLs `/api/...`.
- `npm run check:backend` reconhece a arquitetura consolidada.
