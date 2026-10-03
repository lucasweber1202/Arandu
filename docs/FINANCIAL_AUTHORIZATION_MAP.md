# Mapa de autorização — Financial Procurement × legado de Arte

Auditoria de 27/09/2026 (base `a0f85df`). Cada ponto que decide acesso foi
classificado pelo domínio que protege. Resultado: o papel de plataforma
`finance_ops` não entra em nenhuma superfície legada, e nenhum papel legado abre
o console financeiro.

## Papéis

| Papel | Onde vive | Quem concede | O que abre |
| --- | --- | --- | --- |
| `admin`, `finance_manager`, `analyst`, `provider_user`, `viewer` | `fin_members.role` (por organização) | a própria empresa (convite de membro) | dados da **própria** organização, via RLS |
| `finance_ops` | `auth.users.app_metadata.arandu_role` + linha em `fin_platform_operators` | responsável da plataforma (service role / SQL) | só `/finance/ops.html` e `/api/finance/ops/*`, com `aal2` |
| `admin`, `operator`, `curator` (legado) | `app_metadata.arandu_role` | responsável da plataforma | admin legado de arte (`requireAdmin` + RBAC em `lib/admin-rbac.mjs`) |

`finance_ops` **não** está em `ADMIN_ROLES` (`lib/admin-auth.mjs`) nem na matriz
RBAC legada; `scripts/test-admin-rbac.mjs` e `scripts/test-admin-auth.mjs`
falham se isso mudar.

## Pontos de decisão

| Ponto | Domínio | Exige |
| --- | --- | --- |
| `lib/api/domains/finance.mjs` (todas as rotas `/api/finance/*` exceto `products`) | FINANCE | sessão (`requireUser`) + papel na organização conferido pelo RLS |
| `/api/finance/ops/*` | FINANCE | `finance_ops` + `aal2` na API (`lib/finance/ops-access.mjs`) **e** no banco (`fin_require_operator`: papel no JWT verificado + `fin_platform_operators` + `aal2`) |
| `/api/finance/ops/mfa` | FINANCE | sessão com papel `finance_ops` (aal1); desafio/verificação TOTP no Supabase Auth |
| `/api/jobs/renewals` | FINANCE | `CRON_SECRET` (32+, comparação em tempo constante) |
| `api/commercial.js`, `api/orders.js`, `api/upload.js`, `api/mvp-dashboard.js`, `api/internal-page.js` | LEGACY_ART | `requireAdmin` (papel legado + `aal2`) + permissão RBAC |
| `lib/api/domains/admin-operations.mjs`, `accounts.mjs`, `dashboard.mjs`, `pilot.mjs` (métricas) | LEGACY_ART | `adminGuard` → `requireAdmin` + RBAC; tabelas fixas (`TABLES`), nenhuma `fin_*` |
| `api/admin-auth.js` (sessão, desafio e verificação MFA) | SHARED_INFRA (legado) | papel legado; recusa `finance_ops` |
| `api/readiness.js` | SHARED_INFRA | `requireAdmin` + `diagnostics:read` |
| `api/email-dispatch.js` | SHARED_INFRA | GET: `CRON_SECRET`; POST: `requireAdmin` + `commercial:update` |
| `lib/http-security.mjs` (mesma origem), limitador `consume_rate_limit`, cookie `arandu_session` | SHARED_INFRA | — (não concedem privilégio) |

## Superfície compartilhada com o legado

| Item | Achado | Ação |
| --- | --- | --- |
| Papéis administrativos | O operador financeiro precisava do papel legado `operator` para ter `aal2`, e esse papel escreve em leads, reservas, propostas e pedidos de arte | **Corrigido**: papel `finance_ops` + MFA no próprio console; `operator` não abre mais o console |
| Guardas de API | Rotas financeiras não aceitam `requireAdmin`; rotas legadas não aceitam `finance_ops` (17/17 recusadas no ensaio real) | NO ACTION REQUIRED |
| Service role | Legado usa service role só depois de `requireAdmin`, e só em tabelas de arte listadas; nenhum arquivo legado referencia `fin_*` | NO ACTION REQUIRED |
| Rotas | Mesma função (`api/[...path].js`), prefixos disjuntos (`finance/`, `jobs/` × rotas de arte) | NO ACTION REQUIRED |
| Tabelas | `transactional_email_outbox` é compartilhada. Um admin legado com `commercial:update` pode disparar o despacho, que também envia avisos financeiros; a resposta traz só contagens | Acoplamento aceito: operacional, sem leitura de conteúdo |
| Build | Mesmo build Vite; páginas legadas administrativas são servidas por `api/internal-page.js` com `requireAdmin` | NO ACTION REQUIRED |
| Middleware | Cookie `arandu_session` único; o MFA do `finance_ops` troca o cookie por uma sessão `aal2` da mesma conta | NO ACTION REQUIRED |

## Compatibilidade

- `operator` continua sendo o papel legado de arte, com as mesmas permissões.
  Ele **deixa de abrir** o console financeiro, mesmo com registro em
  `fin_platform_operators` e MFA (ensaio: 403 `finance_ops_required`).
- Migrar um operador existente: trocar o papel para `finance_ops`
  (`FINANCIAL_PILOT_GO_LIVE.md` → Operador). Nada é migrado automaticamente.
- O papel vai no JWT: depois de mudar `app_metadata`, a pessoa entra de novo.
- `npm run finance:pilot:doctor` lista registros em `fin_platform_operators`
  sem papel `finance_ops` e contas com o papel legado `operator`.

## Escopo por entidade (multi-entity)

| Dimensão | Onde vive | Quem concede | Efeito |
| --- | --- | --- | --- |
| `entity_scope = group` | `fin_members.entity_scope` | padrão de todo membro; admin é sempre `group` | lê e escreve, conforme o papel, em todo o grupo, inclusive objetos sem entidade |
| `entity_scope = entities` | `fin_members.entity_scope` + `fin_member_entity_grants` | admin do grupo (`fin_set_member_entity_scope`) | papel vale só nas entidades concedidas e nas unidades abaixo delas; objetos de nível de grupo ficam invisíveis |

O papel (`admin`, `finance_manager`, `analyst`, `viewer`) continua decidindo **o
que** a pessoa faz; o escopo decide **onde**. As duas checagens são
cumulativas e ficam no banco.

## Policies de aprovação (v2)

| Ação | Quem | Onde é checado |
| --- | --- | --- |
| Ler policies | membro da compradora com visibilidade da entidade da policy (global: todos) | RLS de `fin_policy_versions` |
| Publicar / aposentar | admin | `fin_publish_policy`, `fin_retire_policy` |
| Prévia para um processo | quem lê a RFQ | `fin_preview_policy` |
| Pedir aprovação | finance_manager/admin com escrita na entidade; aprovadores conforme a policy | `fin_request_approval_v2` |
| Registrar decisão | finance_manager/admin; nunca o solicitante quando a policy exige segregação | `fin_record_decision` |
