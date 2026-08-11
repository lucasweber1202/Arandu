# Arandu

Arandu é uma plataforma de curadoria, apresentação e intermediação de arte brasileira contemporânea. A experiência relaciona obra, artista, território, procedência e acompanhamento humano, sem tratar o catálogo como um e-commerce genérico.

## Estado operacional

A base técnica está pronta para uma rodada séria de **staging**, mas o lançamento público e a operação comercial continuam bloqueados até existirem evidências reais.

Já estão implementados no código:

- autenticação de compradores com Supabase Auth;
- administração com sessão `HttpOnly`, papéis em `app_metadata` e MFA TOTP `aal2`;
- catálogo público fail-closed, sem promover fixtures como acervo real;
- reservas, propostas e registros comerciais transacionais;
- RLS, idempotência, concorrência e auditoria minimizada;
- política comercial versionada e snapshots imutáveis;
- intake validado de catálogo;
- piloto fechado, telemetria mínima e feedback estruturado;
- SEO, PWA, acessibilidade e jornadas desktop/mobile;
- migrations, rollback, probes, canário e evidências de release;
- CI com PostgreSQL 16, contratos, segurança, build, SEO e Playwright.

Continuam bloqueadores externos:

1. executar migration, restore e canários em staging;
2. aprovar a política comercial, fiscal e jurídica;
3. validar pelo menos 5 artistas e 20 obras reais;
4. configurar monitoramento, contato LGPD e domínio HTTPS;
5. concluir o piloto fechado sem bloqueadores críticos.

O estado oficial dos 13 gates fica em `ops/release-evidence.json`. Nenhum gate deve ser promovido sem responsável, data e referência verificável.

## Começar

Requisitos:

- Node.js 24;
- npm;
- PostgreSQL 16 apenas para a suíte de banco;
- Chromium para executar Playwright localmente.

```bash
npm ci --include=optional
npm run dev
```

## Validação local

Validação completa de código, contratos e governança:

```bash
npm run check:all
npm run build
npm run audit:ci
```

Jornadas de navegador:

```bash
npx playwright install chromium
npm run test:e2e
```

Banco descartável:

```bash
ARANDU_DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres \
  npm run test:database
```

Os checks de desenvolvimento não afirmam que staging ou produção foram validados. A liberação exige:

```bash
npm run release:status
npm run release:check
npm run predeploy
```

`release:check` e `predeploy` devem falhar enquanto os gates externos não estiverem comprovados.

## Staging rehearsal

O workflow manual `.github/workflows/staging-rehearsal.yml` ensaia o pacote de staging sem usar segredos, conectar ao Supabase real ou aplicar migrations.

Ele executa auditoria, `check:all`, build, SEO, bundle determinístico, dry-run de migration, PostgreSQL 16 descartável, Playwright opcional e smoke remoto opcional em uma origem HTTPS.

A execução gera relatórios classificados como `ci_rehearsal_only`. Esses relatórios não promovem `ops/release-evidence.json` e não podem ser tratados como `staging_validated`.

```bash
npm run check:staging
npm run staging:evidence
```

Procedimento completo: `docs/STAGING_REHEARSAL.md`.

O caminho real protegido, a validação de project ref, a máquina de estados de
pedidos, o verificador de restore e o formato v3 das evidências estão em
`docs/PRODUCTION_READINESS_FINAL.md`.

## Arquitetura

O front-end é multipágina e construído com Vite. A coerência visual vem do pipeline de build, do shell global em `js/site.js` e das camadas CSS documentadas em `docs/ARQUITETURA_FRONTEND.md`.

A API é formada por funções serverless, com `api/[...path].js` como roteador principal e funções complementares para autenticação, readiness, operação comercial, upload e painéis.

Rotas importantes:

```text
/api/catalog
/api/artists
/api/forms
/api/reservations
/api/proposals
/api/account
/api/auth/session
/api/auth/login
/api/auth/signup
/api/auth/logout
/api/admin
/api/admin-update
/api/readiness
/api/health
/api/pilot/session
/api/pilot/feedback
/api/certificates
```

`/api/health` expõe somente liveness. `/api/readiness` exige identidade administrativa, papel autorizado e MFA.

## Supabase e migrations

A ordem canônica está em `docs/supabase-migrations.json`. Antes de executar qualquer migration real, leia:

- `docs/TRANSACTIONS_RLS_RBAC.md`;
- `docs/MIGRATION_RELEASE_RUNBOOK.md`;
- `docs/INCIDENT_BACKUP_OBSERVABILITY_RUNBOOK.md`.

Comandos principais:

```bash
npm run check:migrations
npm run migrations:bundle
npm run migrations:release -- --dry-run --environment staging
npm run seed:supabase:dry
npm run staging:validate
```

Nunca aplique migrations sem backup referenciado, preflight aprovado e plano de rollback.

## Catálogo e operação comercial

Os arquivos de demonstração não contam como catálogo real. A publicação exige autorizações, procedência, disponibilidade, preço, moeda, dimensões, técnica, certificado, consentimento e aprovação editorial.

A operação comercial permanece fail-closed enquanto a política não estiver completa e aprovada. Valores enviados pelo navegador não substituem cálculo no servidor e no banco.

Documentação comercial e de crescimento mantida como referência obrigatória:

- `docs/OPERACAO_COMERCIAL_INDEX.md` — índice da operação comercial;
- `docs/GO_LIVE_ARANDU.md` — roteiro de promoção e abertura;
- `docs/PRIMEIROS_30_DIAS.md` — operação inicial após o lançamento;
- `docs/PROSPECCAO_ARTISTAS_PLAYBOOK.md` — prospecção e qualificação de artistas;
- `docs/CHECKLIST_PARCEIRA_ARTISTA.md` — autorizações e parceria;
- `docs/PROSPECCAO_COMPRADORES_EMPRESAS.md` — aquisição B2C e B2B;
- `docs/FLUXO_COMPRA_RESERVA.md` — jornada comercial;
- `docs/OBJECOES_E_RESPOSTAS.md` — respostas comerciais padronizadas;
- `docs/CALENDARIO_CONTEUDO_30_DIAS.md` — preparação editorial;
- `docs/METRICAS_FUNIL_ARANDU.md` — métricas de aquisição e conversão;
- `docs/SEO_DOMINIO_CHECKLIST.md` — domínio, indexação e SEO final.

## Governança do repositório

Leia antes de contribuir:

- `CONTRIBUTING.md` — fluxo de branches, validação e PRs;
- `SECURITY.md` — reporte responsável de vulnerabilidades;
- `docs/OPERATIONS_INDEX.md` — documentação operacional canônica;
- `docs/BRANCH_PROTECTION.md` — configuração recomendada da `main`;
- `docs/REPOSITORY_HYGIENE.md` — política para branches e documentos históricos;
- `docs/VERSIONING.md` — estratégia de versões antes do lançamento público.

A CI executa `scripts/check-governance.mjs` e `scripts/check-staging-rehearsal.mjs` para impedir regressões nos controles mínimos do repositório e no workflow de preparação de staging.

## Variáveis de produção

Use `.env.example` como fonte de verdade. Os grupos essenciais incluem:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ARANDU_SITE_URL=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=

ARANDU_BRAND_READY=false
ARANDU_COMMERCIAL_READY=false
ARANDU_PILOT_ENABLED=false
ARANDU_PILOT_APPROVED=false
```

Segredos pertencem somente ao ambiente do servidor. Não registre valores reais no Git, em issues, logs ou evidências.

## Critério de lançamento

O Arandu só deve abrir publicamente quando:

- migrations e probes tiverem sido executados em staging;
- backup e restauração estiverem comprovados;
- RLS, concorrência, idempotência e canário real estiverem aprovados;
- catálogo mínimo real estiver autorizado e revisado;
- política comercial estiver aprovada;
- domínio, contato LGPD e monitoramento estiverem ativos;
- piloto fechado estiver concluído;
- `npm run predeploy` terminar com sucesso.
