# Pendências resumidas — Arandu

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

Documento resumido. O detalhamento canônico está em
`docs/RELEASE_CANDIDATE_1.md`; evidências externas vivem em
`ops/release-evidence.json`.

## Código pronto para beta

- Site público, navegação, mobile, catálogo fail-closed e seleção.
- Autenticação, contas, portais, admin, RBAC, RLS e MFA.
- Segurança, LGPD, retenção, legal hold e outbox.
- Testes E2E, testes de banco, migrations e gates de deploy/release.
- Modo de apresentação e integração Vercel.

## P0 — bloqueia a beta pública

Pendências operacionais, não novas features:

1. identificar o projeto Supabase real;
2. aplicar migrations na ordem canônica;
3. configurar as três variáveis Supabase na Vercel;
4. configurar contato por e-mail e WhatsApp;
5. configurar `ARANDU_CONSENT_VERSION` e publicar a política correspondente;
6. definir `ARANDU_SITE_URL` em domínio HTTPS;
7. executar smoke tests reais de persistência, contato, UTM e proteção interna.

## P1 — antes de divulgar muito

- Definir contato LGPD e contato de segurança.
- Configurar monitoramento e validar canário.
- Testar a jornada em celular físico.
- Iniciar prospecção e coletar obras autorizadas.
- Preparar conteúdo e canais de suporte.

## Bloqueia catálogo real

- Pelo menos 5 artistas e 20 obras reais verificados.
- Autorizações de imagem/publicação.
- Ficha, disponibilidade, preço, moeda, procedência e certificado revisados.
- Aprovação curatorial humana.

## Bloqueia comércio

- Política comercial, fiscal e jurídica aprovada.
- Comissão, reserva, pagamento, frete, seguro, cancelamento, devolução, avaria
  e modelo fiscal definidos.
- `ARANDU_COMMERCIAL_READY` permanece desligado até a política aprovada.

## Bloqueia go-live comercial completo

- staging, restore, canários, RLS e concorrência com evidência externa;
- catálogo real e política comercial aprovados;
- monitoramento, contato LGPD e domínio;
- piloto fechado;
- `npm run predeploy` aprovado.

## Pós-beta / opcional

- Pagamento online e automações comerciais adicionais.
- Eventos de signup, login e comparação.
- Consolidação visual completa do dock de decisão e barra de comparação.
- Breadcrumbs nas páginas em que seriam apenas melhoria visual.
- CRM completo e app mobile.
