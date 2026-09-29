# Arandu — estado de produção

> **Legado — vertical de arte (aposentada).** Documento histórico: não descreve o produto atual (Arandu Financial Procurement). Ver [`LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md) e [`OPERATIONS_INDEX.md`](OPERATIONS_INDEX.md).

## Fonte de verdade

Este documento resume o estado operacional. Em caso de divergência, siga
`docs/RELEASE_CANDIDATE_1.md`, o código da `main` e
`ops/release-evidence.json`.

O Arandu separa três decisões que não podem ser confundidas:

| Estado | Comando / evidência | O que autoriza |
|---|---|---|
| Deploy técnico | `npm run deploy:check` | Build e publicação técnica do site |
| Beta pública | checklist do RC1 + smoke tests reais | Site público com catálogo e comércio explicitamente fechados |
| Go-live comercial completo | `npm run predeploy` | Catálogo real, comércio e operação completos |

## Deploy técnico

Antes de publicar um preview ou a beta técnica:

```bash
npm ci --include=optional
npm run deploy:check
```

A Vercel usa `npm run vercel-build`, que preserva essa separação. Um deploy
técnico verde não promove catálogo, política comercial, piloto ou evidência
externa.

## Beta pública

A beta pode ser publicada com catálogo fechado e comércio fechado. Ela requer:

- projeto Supabase real identificado;
- migrations aplicadas na ordem de `docs/supabase-migrations.json`;
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
  `SUPABASE_SERVICE_ROLE_KEY` configuradas somente no ambiente;
- `ARANDU_CONTACT_EMAIL` e `ARANDU_WHATSAPP_NUMBER`;
- `ARANDU_CONSENT_VERSION` e política correspondente;
- `ARANDU_SITE_URL` em domínio HTTPS;
- smoke tests de formulário, persistência, UTM, WhatsApp, celular e proteção das
  páginas internas.

A beta não exige catálogo real, política comercial aprovada, piloto fechado nem
todos os gates de release. Sem `ARANDU_CONSENT_VERSION`, analytics permanece desligado e o checklist desta beta não está completo.

## Go-live comercial completo

Execute:

```bash
npm run predeploy
```

`predeploy` inclui `deploy:check` e o gate fail-closed de release. Ele deve
continuar falhando enquanto staging, restore, canários, catálogo real, política
comercial, monitoramento, contato LGPD, domínio e piloto não tiverem evidência
externa verificável.

Nunca altere gates ou evidências apenas para liberar um deploy.

## Teste manual prioritário

1. `/`
2. `comprar-arte.html`
3. `minha-selecao.html`
4. `para-artistas.html`
5. `empresas-e-arquitetos.html`
6. `contato.html`
7. `login.html`
8. `/painel.html` (deve exigir autenticação administrativa)

Critérios: navegação sem duplicidade, seleção vazia sem ações inertes,
comparação clicável no desktop/mobile, formulários com retorno honesto,
consentimento acima das superfícies fixas e nenhuma página interna exposta.

## Estado atual

Código e contratos estão prontos para beta. As pendências prioritárias são de
ambiente e operação; o estado oficial dos 13 gates externos permanece em
`ops/release-evidence.json`.
