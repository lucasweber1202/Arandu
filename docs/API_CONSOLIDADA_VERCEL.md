# API consolidada — Vercel Hobby

## Problema resolvido

O plano Hobby da Vercel limita a quantidade de Serverless Functions por deploy. Como cada arquivo em `api/` conta como uma função, a arquitetura anterior ultrapassava o limite.

## Solução aplicada

As rotas operacionais foram consolidadas na função principal:

```text
api/[...path].js
```

Funções complementares cobrem diagnóstico, coleções, operação comercial, painel MVP e upload administrativo:

```text
api/health.js
api/collections.js
api/commercial.js
api/mvp-dashboard.js
api/upload.js
```

A arquitetura atual fica com 6 funções serverless, ainda abaixo do limite de 12 do plano Hobby.

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
/api/account
/api/dashboard
/api/auth/session
/api/auth/login
/api/auth/signup
/api/auth/logout
/api/health
```

`/api/account` exige sessão do comprador. `/api/dashboard`, `/api/mvp-dashboard`, `/api/commercial`, `/api/upload` e as rotas administrativas exigem `x-arandu-admin-token`.

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

## Health check

A rota abaixo confirma se as variáveis de produção estão chegando ao servidor:

```text
/api/health
```

Ela retorna apenas indicadores booleanos, sem expor chaves ou tokens.

Também existe uma página visual:

```text
/status.html
```

Use essa página depois do deploy para confirmar se Supabase e token administrativo estão configurados.

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
/api/health
/status.html
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
- `api/health.js` existe.
- As 6 funções de `api/` carregam sem import quebrado.
- Arquivos serverless antigos não existem.
- Front continua chamando as mesmas URLs `/api/...`.
- `/api/health` responde em produção.
- `status.html` mostra quais variáveis ainda estão pendentes.
- `npm run check:backend` reconhece a arquitetura consolidada.
