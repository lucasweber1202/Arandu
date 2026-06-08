# Upgrade de conta e banco — Arandu

Esta rodada iniciou a transformação da Arandu em produto real com rotas serverless na Vercel e preparação para Supabase.

## Páginas criadas

- `cadastro.html`
- `login.html`
- `minha-conta.html`
- `painel.html`

## Arquivos de código criados

- `js/auth.js`
- `api/auth/signup.js`
- `api/auth/login.js`
- `api/auth/session.js`
- `api/auth/logout.js`
- `api/artworks.js`
- `api/dashboard.js`
- `api/selections.js`

## Arquivos atualizados

- `api/_supabase.js`
- `api/health.js`
- `js/site.js`
- `sitemap.xml`
- `scripts/check-static.mjs`
- `supabase/schema.sql`

## O que já dá para testar

- `/cadastro.html`
- `/login.html`
- `/minha-conta.html`
- `/painel.html`
- `/api/health`
- `/api/artworks`
- `/api/dashboard`
- `/api/auth/session`

## Funcionamento atual

Sem Supabase, várias rotas respondem em modo demonstração. Com Supabase configurado na Vercel, cadastro, login, métricas e dados começam a usar banco real.

## Próximo passo

1. Criar projeto no Supabase.
2. Rodar `supabase/schema.sql`.
3. Rodar `supabase/seed.sql`.
4. Configurar variáveis do Supabase na Vercel.
5. Fazer redeploy.
6. Testar cadastro, login, sessão e painel.

## Próximas melhorias

- CRUD real de obras.
- CRUD real de artistas.
- Upload de imagens.
- Persistência real de Minha Seleção.
- Certificados em PDF.
- Área do artista.
- Área da empresa.
