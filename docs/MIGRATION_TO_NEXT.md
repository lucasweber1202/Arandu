# Plano de migração para Next.js — Arandu

## Por que migrar

O MVP estático é suficiente para validar a proposta. A migração para Next.js faz sentido quando houver catálogo dinâmico, banco de dados, painel e SEO em escala.

## Componentes a criar

- Header
- Footer
- ArtworkCard
- ArtistCard
- CollectionCard
- FormCard
- Tag
- SectionHeader
- CertificatePreview
- SelectionSummary

## Rotas sugeridas

- `/`
- `/obras`
- `/obras/[slug]`
- `/artistas`
- `/artistas/[slug]`
- `/colecoes`
- `/colecoes/[slug]`
- `/curadoria`
- `/autenticidade`
- `/empresas-e-arquitetos`
- `/para-artistas`
- `/minha-selecao`
- `/verificar-certificado`

## Integrações futuras

- Supabase para banco de dados.
- Resend para e-mail.
- Storage para imagens de obras e artistas.
- Vercel para deploy.
- Stripe ou solução local para pagamento, se necessário.

## Ordem recomendada

1. Migrar layout e páginas institucionais.
2. Migrar catálogo com JSON local.
3. Conectar Supabase.
4. Criar painel administrativo.
5. Implementar certificados e seleção persistente.
