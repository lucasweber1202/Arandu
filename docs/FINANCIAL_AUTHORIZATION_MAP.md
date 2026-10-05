# Mapa de autorização — Financial Procurement

Auditoria de 27/09/2026 (base `a0f85df`). Cada ponto que decide acesso foi
classificado pelo domínio que protege. Resultado: o papel de plataforma
`finance_ops` não entra em nenhuma superfície legada, e nenhum papel legado abre
o console financeiro. Desde 04/10/2026 a API não tem mais nenhuma rota da antiga
vertical de arte (`docs/LEGACY_ART_RETIREMENT.md`): o admin legado e seus papéis
não têm handler.

## Papéis

| Papel | Onde vive | Quem concede | O que abre |
| --- | --- | --- | --- |
| `admin`, `finance_manager`, `analyst`, `provider_user`, `viewer` | `fin_members.role` (por organização) | a própria empresa (convite de membro) | dados da **própria** organização, via RLS |
| `finance_ops` | `auth.users.app_metadata.arandu_role` + linha em `fin_platform_operators` | responsável da plataforma (service role / SQL) | só `/finance/ops.html` e `/api/finance/ops/*`, com `aal2` |
| `admin`, `operator`, `curator` (aposentados) | `app_metadata.arandu_role` em contas antigas | ninguém (sem handler) | nada: o admin de arte foi removido; o console financeiro recusa esses papéis com 403 `finance_ops_required` |

`check-auth-security` falha se o guard administrativo aposentado (`adminGuard`,
`ADMIN_ROLES`, RBAC legada) voltar à API; `check-legacy-art` falha se os módulos
`admin-auth`/`admin-rbac` voltarem ao tree.

## Pontos de decisão

| Ponto | Domínio | Exige |
| --- | --- | --- |
| `lib/api/domains/finance.mjs` (todas as rotas `/api/finance/*` exceto `products`) | FINANCE | sessão (`requireUser`) + papel na organização conferido pelo RLS |
| `/api/finance/ops/*` | FINANCE | `finance_ops` + `aal2` na API (`lib/finance/ops-access.mjs`) **e** no banco (`fin_require_operator`: papel no JWT verificado + `fin_platform_operators` + `aal2`) |
| `/api/finance/ops/mfa` | FINANCE | sessão com papel `finance_ops` (aal1); desafio/verificação TOTP no Supabase Auth |
| `/api/jobs/renewals` | FINANCE | `CRON_SECRET` (32+, comparação em tempo constante); inclui `fin_run_approval_deadlines` (service role, só depois do segredo) |
| `/api/v1/*` | FINANCE (máquina) | `Authorization: Bearer` de conta de serviço → hash → `fin_api_*` (service role no servidor): credencial + organização + entidade + escopo + objeto; rate limit por credencial — `docs/FINANCIAL_PUBLIC_API.md` |
| `/api/jobs/webhooks` | FINANCE | `CRON_SECRET`; worker `fin_webhook_claim/complete` (service role, só depois do segredo) |
| `service-accounts*`, `webhooks*` (`/api/finance`) | FINANCE | sessão + papel `admin` confirmado no banco antes de qualquer RPC; "enviar pendentes" usa service role só no worker, filtrado pela organização |
| `/api/auth/sso/discover`, `/start`, `/callback` | AUTH | público com rate limit por IP; state HMAC + PKCE; `fin_sso_discover`/`fin_sso_authorize`/`fin_record_sso_event` só com service role, depois de validar state e identidade; sessão emitida pelo broker (Supabase) — `docs/FINANCIAL_SSO.md` |
| `/api/auth/login` (exigência de SSO) | AUTH | `fin_sso_password_allowed` (service role) antes da senha: 403 `sso_required`; 503 se a política não puder ser lida |
| `sso*` (`/api/finance`) | FINANCE | sessão + papel `admin` confirmado antes de qualquer RPC; verificação de domínio lê o DNS no servidor e envia só o hash do token (service role) |
| `approval-policies*`, `approval-exceptions*`, `approval-delegations*` | FINANCE | sessão + RLS; administração de policy e sinalizadores só `admin`; prévia sob o RLS da RFQ; exceção decidida pelo papel da policy dona da regra; delegação pelo titular (ou admin para revogar) — `docs/FINANCIAL_POLICY_ENGINE.md` |
| Qualquer outra rota `/api/*` | — | 404 `route_not_found` em todos os ambientes (sem handler); em piloto/produção/demo a lista de `lib/deployment-surface.mjs` é conferida antes do roteamento |
| `api/email-dispatch.js` | SHARED_INFRA | só GET de cron com `CRON_SECRET`; o gatilho manual da administração de arte foi removido |
| `/api/jobs/governance` | FINANCE | `CRON_SECRET`; retenção, export e offboarding com service role só depois do segredo |
| `lib/http-security.mjs` (mesma origem), limitador `consume_rate_limit`, cookie `arandu_session` | SHARED_INFRA | — (não concedem privilégio) |

## Superfície compartilhada com o legado

| Item | Achado | Ação |
| --- | --- | --- |
| Papéis administrativos | O operador financeiro precisava do papel legado `operator` para ter `aal2`, e esse papel escreve em leads, reservas, propostas e pedidos de arte | **Corrigido**: papel `finance_ops` + MFA no próprio console; `operator` não abre mais o console |
| Guardas de API | O guard administrativo de arte (`requireAdmin` + RBAC) foi removido com as rotas; as rotas antigas respondem 404 também para `finance_ops` com MFA (ensaio local) | **Removido** (04/10/2026) |
| Service role | Só domínio financeiro, crons e outbox usam service role | NO ACTION REQUIRED |
| Rotas | `api/[...path].js` só atende `finance/`, `auth/`, `v1/`, `jobs/` e security.txt | **Removido** o restante (04/10/2026) |
| Tabelas | `transactional_email_outbox` é compartilhada; só o cron dispara o despacho | Acoplamento removido com o gatilho manual de arte |
| Build | Páginas administrativas de arte e `api/internal-page.js` foram removidas do código | Gate `check:legacy-art` |
| Middleware | Cookie `arandu_session` único; o MFA do `finance_ops` troca o cookie por uma sessão `aal2` da mesma conta | NO ACTION REQUIRED |

## Compatibilidade

- `operator` era o papel do admin de arte, que não existe mais. Uma conta antiga
  com esse papel **não abre** o console financeiro, mesmo com registro em
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


## Operational Resilience (P0.10)

`fin_job_begin`/`fin_job_finish`, `fin_job_leases` e mutação de `fin_job_runs`
são exclusivos de service role, sem grants de cliente e com FORCE RLS nas
tabelas. RPCs recusam `auth.uid()` não nulo; lease/token atual e prazo são
validados na conclusão. Cron exige segredo de pelo menos 32 bytes e comparação
em tempo constante, antes de qualquer acesso administrativo. Console mantém
finance_ops + AAL2 + operador registrado; overview exclui fencing tokens, URLs,
segredos e payloads. SSO indisponível continua fechado; nenhum fallback novo.

## Data Governance (P0.11)

| Ação | Quem | Onde a regra vive |
| --- | --- | --- |
| Ver resumo, políticas, holds, exports, offboarding | `admin` da organização compradora | RLS `fin_*_read` (`fin_has_role(org, admin)`) + `fin_governance_require_admin` |
| Criar/ativar/aposentar política de retenção da organização | `admin` da compradora | `fin_governance_*_retention_policy` |
| Política de plataforma (`PLATFORM_*`) | operador `finance_ops` com AAL2 | `fin_require_operator()` dentro da RPC |
| Prévia de retenção | `admin` (só a própria organização) | `fin_governance_retention_run(dry_run=true)` |
| Executar retenção, montar export, avançar offboarding | service role (job com segredo) | RPC recusa `auth.uid()` não nulo |
| Criar/liberar legal hold | `admin` da compradora | `fin_governance_*_legal_hold` |
| Pedir/baixar export | `admin` atual, export pronto e não vencido | `fin_governance_request_export`, `fin_governance_export_*`; `fin_data_export_parts` sem grant de cliente |
| Pedir offboarding, exportar, revogar, cancelar | `admin` da compradora | `fin_governance_offboarding_action` |
| Fechar ou cancelar offboarding pós-revogação, prévia de exclusão | operador `finance_ops` com AAL2 | `fin_governance_offboarding_close/operator_cancel`, `fin_governance_deletion_preview` |

`finance_manager`, `analyst`, `viewer`, escopo restrito a entidade, provedor,
outro tenant, conta sem vínculo e membro revogado não alcançam nenhuma dessas
ações nem leituras (testado em `tests/database/financial-data-governance.sql`).


## Bank Fee Intelligence (P1.2)

| Ação | Quem | Onde a regra vive |
| --- | --- | --- |
| Ler tarifas, observações, diferenças e revisões | `admin`, `finance_manager`, `analyst`, `viewer` no escopo da entidade do contrato | RLS `fin_fee_*_read` (`fin_entity_allows` + contrato legível) |
| Registrar/versionar tarifa contratada, registrar cobrança observada | `admin`, `finance_manager` no escopo da entidade do contrato, compradora, sem offboarding | `fin_create_fee_schedule`, `fin_version_fee_schedule`, `fin_record_fee_observation` |
| Verificar observação, revisar diferença | `admin`, `finance_manager` no escopo, estado esperado | `fin_verify_fee_observation`, `fin_review_fee_variance` |

Provedor, outro tenant, membro revogado e escopo de outra entidade não leem nem escrevem (testado em `tests/database/financial-fee-intelligence.sql`). Nenhuma credencial de API alcança tarifas.

## Proposal & Document Intelligence (P1.4)

| Ação | Quem | Onde a regra vive |
| --- | --- | --- |
| Ler extrações, fatos e revisões | `admin`, `finance_manager`, `analyst`, `viewer` da compradora **e** documento legível agora (escopo de entidade) | RLS `fin_document_extraction_read`, `fin_extraction_fact_read`, `fin_extraction_review_read` (`fin_can_read_document`) |
| Iniciar extração | `admin`, `finance_manager`, `analyst` da compradora dona do documento, sem offboarding | `fin_document_extraction_begin` (devolve a chave do objeto só ao servidor, para leitor automático) |
| Registrar fatos / falha | quem iniciou a extração, enquanto `processing` | `fin_document_extraction_record`, `fin_document_extraction_fail` |
| Confirmar/corrigir campo crítico | `admin`, `finance_manager` | `fin_review_extraction_fact` |
| Confirmar/rejeitar/corrigir campo padrão; rejeitar crítico | `admin`, `finance_manager`, `analyst` | `fin_review_extraction_fact` (estado esperado obrigatório) |

Provedor (inclusive dono do documento compartilhado), outro tenant, viewer (escrita) e membro restrito a outra entidade são recusados (testado em `tests/database/financial-document-intelligence.sql`).

## Opportunity Engine (P1.3)

| Ação | Quem | Onde a regra vive |
| --- | --- | --- |
| Ler oportunidades e histórico | `admin`, `finance_manager`, `analyst`, `viewer` no escopo da entidade (itens de grupo só para escopo de grupo) | RLS `fin_opportunity_read`, `fin_opportunity_event_read` |
| Ler regras | papéis compradores da organização | RLS `fin_opportunity_rule_read` |
| Criar versão de regra | `admin` da compradora, sem offboarding | `fin_set_opportunity_rule` |
| Transicionar estado, criar rascunho de RFQ | `admin`/`finance_manager` no escopo; em revisão, só o revisor ou `admin` conclui; revisor precisa ter o papel e o escopo | `fin_transition_opportunity`, `fin_opportunity_start_rfq` |
| Avaliar (motor) | service role (job com lease) ou gatilho de diferença de tarifa | `fin_run_opportunity_engine`, `fin_evaluate_opportunities` (sem `EXECUTE` para usuários) |

## Value Intelligence executivo (Painel)

| Ação | Quem | Onde a regra vive |
| --- | --- | --- |
| Ler resumo executivo (`GET /api/finance/executive`) | `admin`, `finance_manager`, `analyst`, `viewer` da compradora, no escopo de entidade de cada SoR | `fin_value_totals`, `fin_fee_summary`, `fin_opportunity_summary` (security invoker sob RLS de quem chama); sem escrita |
