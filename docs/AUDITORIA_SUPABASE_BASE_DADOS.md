# Auditoria Supabase e base de dados — Arandu

## Resumo

O projeto já possui uma base técnica real para trabalhar com Supabase, autenticação, formulários, catálogo, artistas, reservas, propostas, certificados e painel administrativo.

## O que existe no backend

A API principal está em `api/[...path].js`.

Ela já lê variáveis de ambiente para Supabase e autenticação, usa uma chave de serviço ou chave pública quando configurada e também prevê token administrativo.

Rotas identificadas:

- `/api/forms`
- `/api/reservations`
- `/api/proposals`
- `/api/certificates`
- `/api/certificate-document`
- `/api/catalog`
- `/api/artists`
- `/api/admin`
- `/api/admin-update`
- `/api/operational`
- `/api/media`
- `/api/selections`
- `/api/dashboard`
- `/api/auth/session`
- `/api/auth/login`
- `/api/auth/signup`
- `/api/auth/logout`

## Tabelas usadas ou esperadas

- `artworks`
- `artists`
- `certificates`
- `leads`
- `artist_submissions`
- `company_briefs`
- `proposals`
- `proposal_items`
- `reservations`
- `tasks`
- `saved_selections`
- `newsletter_subscriptions`
- `crm_notes`

## Views esperadas

- `v_artworks_full`
- `v_public_catalog`
- `v_sales_pipeline`

## Modos de funcionamento

Se Supabase não estiver configurado, os endpoints retornam modo demo/local para evitar quebra de interface.

Se Supabase estiver configurado, os endpoints passam a gravar e consultar os dados reais.

## O que falta confirmar no painel Supabase

- Se todas as tabelas existem.
- Se as views existem.
- Se as políticas de acesso estão adequadas.
- Se as variáveis de ambiente foram configuradas no deploy.
- Se login e cadastro estão ativados no provedor de autenticação.
- Se os formulários estão gravando em `leads`, `artist_submissions` e `company_briefs`.
- Se reservas e seleções estão gravando corretamente.
- Se certificados reais estão ligados às obras.

## Conclusão

A estrutura de Supabase e base de dados existe no código. O ponto que ainda precisa ser confirmado não é código, mas configuração operacional: projeto Supabase, tabelas, views, policies e variáveis no ambiente de deploy.
