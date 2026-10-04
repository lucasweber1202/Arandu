# Implementation Matrix — Arandu Financial Procurement & Vendor Management OS

Documento vivo. Decompõe a guideline efetiva (`docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md`
+ `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md`, que prevalece) em
requisitos implementáveis e registra, com evidência no repositório, o estado de cada um.
Outra sessão deve conseguir continuar a partir daqui sem refazer a auditoria.

- **Baseline auditada:** `pilot` @ `6ad0d4f` (merge main → pilot após guideline v2.1),
  `main` contida em `pilot` (0 atrás), sem divergência de canonicality, em 03/10/2026.
- **Autorização de escopo:** missão humana explícita desta rodada autoriza P0, P1, P2 (com
  pré-requisitos) e P3 (somente com gates). Não elimina dependency order, boundaries,
  decisão humana, gates jurídicos/segurança, provenance, isolamento nem DoD.
- **Validação local de referência:** PostgreSQL 16 local (`npm run test:database` verde),
  `npm run check:all` verde, Chromium do Playwright em `/opt/pw-browsers`. Firefox/WebKit
  **não** instalados nesta sessão: cross-browser fica para o job `validate` do CI.

## Legenda

| Status | Significado |
| --- | --- |
| `implemented` | domínio + persistência + autorização + API + UI/workflow + estados + auditoria + testes + docs, conforme aplicável, com evidência no repositório |
| `partial` | existe parte da capacidade; as lacunas estão listadas |
| `missing` | não há implementação |
| `blocked` | depende de algo externo (credencial, decisão humana/jurídica/comercial, parceiro, dado licenciado, permissão administrativa); o que já foi preparado está listado |
| `not-applicable` | não se aplica nesta fase por boundary documentado |

Evidência sempre aponta arquivo, migration, API, teste ou UI. Página sozinha não é evidência
de capacidade completa. "Verde no CI" só vale quando o run existe; aqui, salvo indicação,
"testado" significa testado **localmente** nesta sessão.

---

## P0 — Fundação comercial e enterprise

### P0.1 — Ambientes, migrations, runbooks e governança

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.1-01 | §38.3, Add. H.1 | Demo/Pilot/Production por configuração, mesma árvore | P0 | — | partial | `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`, `scripts/vercel-build.mjs`, `scripts/check-finance-env.mjs`, `lib/demo-mode.mjs`, `lib/deployment-surface.mjs` | Supabase DEMO não existe (limite Free 2 projetos); produção sem `ARANDU_ENV=production` nem banco próprio (`ARANDU_CURRENT_STATE_2026-10-02.md`) | demo/prod mal configurados | Owner: criar Supabase DEMO/PROD, setar env (ver lista de blockers) | — |
| P0.1-02 | §38.4 | Manifesto de migrations, clean install, upgrade, reapply, rollback | P0 | — | implemented | `docs/supabase-migrations.json`, `scripts/check-migrations.mjs`, `scripts/test-database.sh` (clean+upgrade+reapply+rollback), `docs/rollback/*` | — (cada migration nova deve repetir o padrão) | migration fora do manifesto | manter | — |
| P0.1-03 | §38.4, Add. E.6 | Migrations aplicadas no Pilot hospedado | P0 | P0.1-02 | blocked | Pilot em `financial-surface-hardening-1` (02/10); bundle `npm run migrations:bundle -- --after-schema` | sem credencial administrativa do Supabase nesta sessão; restore drill hospedado é pré-condição | piloto atrás do código | Owner aplica bundle após backup+drill | — |
| P0.1-04 | §38.1–38.2, Add. G.3 | Branch protection/rulesets em `main` e `pilot` | P0 | — | blocked | `docs/FINANCIAL_REPO_GOVERNANCE.md` (403 da integração); `scripts/check-governance.mjs` | permissão administrativa ausente | merge com CI vermelho | Owner configura Settings → Branches/Rulesets; ver `FINANCIAL_REPO_GOVERNANCE.md` | — |
| P0.1-05 | Add. E.1 | Restore drill local e procedimento hospedado | P0 | — | partial | `scripts/pilot-restore-drill.sh`, `scripts/pilot-backup-preflight.mjs`, `ops/sql/post-restore-probes.sql`, `docs/FINANCIAL_PILOT_PASSPORT_ROLLOUT.md` | drill hospedado nunca executado (sem DB URL) | backup ≠ restore | Owner roda `pilot:restore:drill` com `PILOT_SOURCE_DATABASE_URL` | — |
| P0.1-06 | §38, Add. E.6 | Doctor, canary e env check | P0 | — | implemented | `scripts/finance-pilot-doctor.mjs`, `lib/finance/pilot-doctor.mjs` (espera `financial-operational-resilience-1`), `scripts/pilot-canary.sh`, `ops/sql/pilot-isolation-canary.sql` (inclui isolamento por entidade), `scripts/test-pilot-doctor.mjs` | marcador esperado precisa acompanhar cada migration | GO falso | manter a cada migration | PR multi-entity |
| P0.1-07 | Add. E.4 | Incident severity model, runbook, postmortem template | P0 | — | partial | `docs/FINANCIAL_OPERATIONAL_RESILIENCE.md`, `docs/FINANCIAL_INCIDENT_POSTMORTEM.md` | nomeação de responsáveis e exercício de resposta/DR hospedado | procedimento não exercitado | owner + P0.10 | — |

### P0.2 — Multi-Entity Foundation

Migration `docs/supabase-financial-multi-entity.sql` (`financial-multi-entity-1`), rollback
`docs/rollback/supabase-financial-multi-entity.rollback.sql`. Testes: `tests/database/financial-multi-entity.sql`
(clean install, upgrade sobre base povoada, reapply, rollback no `test:database`),
`scripts/test-finance-entities.mjs` (domínio + API), `tests/e2e/finance-entities.spec.js` (Chromium desktop e mobile
locais; Firefox/WebKit no CI), canário `ops/sql/pilot-isolation-canary.sql` por membro restrito.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.2-01 | §11 | Grupo econômico (= organização compradora) + entidades legais + unidades (1 nível) | P0 | Enterprise Core | implemented | `fin_legal_entities`, `fin_create_legal_entity`/`fin_update_legal_entity` (arquivar sem apagar), `/api/finance/entities`, Configurações → Entidades do grupo | relações societárias entre entidades (participação %) e mais de um nível de unidade não modelados | — | modelar só quando um workflow exigir | PR multi-entity |
| P0.2-02 | §11, §47.2 | Escopo por membro: tesouraria do grupo × entidades concedidas; admin sempre do grupo | P0 | P0.2-01 | implemented | `fin_members.entity_scope`, `fin_member_entity_grants`, `fin_set_member_entity_scope`, constraint `fin_members_admin_group_scope`, Configurações → Escopo | delegated admin por entidade (P1.5) | — | P1.5 | PR multi-entity |
| P0.2-03 | §11 | RLS entity-aware (RFQ, convite, proposta, versão, decisão, contrato, aprovação, etapa, revisão, snapshot, marco, tarefa, evento, comentário, documento, busca, autores) | P0 | P0.2-02 | implemented | policies + `fin_search`/`fin_can_read_document`/`fin_comment_authors` reescritas; teste de banco e canário | Passport por entidade (P0.3-02) | — | — | PR multi-entity |
| P0.2-04 | §11 | Escrita cross-entity bloqueada centralmente (gatilhos), inclusive via RPC existente; aprovador precisa de escopo | P0 | P0.2-02 | implemented | `fin_*_entity_guard`, `fin_assert_entity_write`; casos negativos de transição, convite, comentário, tarefa, decisão, renovação, aprovação | — | — | — | PR multi-entity |
| P0.2-05 | §11 | Consolidado sem expor detalhe não autorizado | P0 | P0.2-03 | implemented | `consolidateByEntity` (`lib/finance/entities.mjs`) sobre linhas do RLS; `/api/finance/entity-summary`; card no Painel | consolidado de valores por moeda (depende de P0.6) | soma entre moedas | P0.6/P1.6 | PR multi-entity |
| P0.2-06 | §11 | Moeda base do grupo e moeda local por entidade | P0 | P0.2-01 | implemented | `fin_organizations.base_currency`, `fin_legal_entities.currency`, `fin_set_base_currency` | sem câmbio por decisão (boundary); objetos financeiros ainda sem moeda própria (P0.4/P0.6) | — | P0.4/P0.6 | PR multi-entity |
| P0.2-07 | §11, §34 | Escopo de entidade na trilha | P0 | P0.2-01 | implemented | `fin_events.legal_entity_id` (gatilho `fin_event_entity_stamp`), eventos `rfq_entity_changed`, `contract_entity_assigned`, `member_entity_scope_set`, `legal_entity_*` | Audit Center como superfície (§34) | — | P1 | PR multi-entity |
| P0.2-08 | §11, §39 | UI: contexto/filtro de entidade, entidade na criação de RFQ (obrigatória para restrito), reatribuição auditada, atribuição única de contrato legado, consolidado | P0 | P0.2-01..04 | implemented | `finance/src/views/entities.js` + integrações em `rfqs.js`, `rfq.js`, `company.js`, `dashboard.js`; E2E com overflow check | demo sandbox legado não emula entidades (degrada sem a seção) | — | aposentar sandbox (P0.1-01) | PR multi-entity |
| P0.2-09 | §11 | Aprovação cruzada / group treasury approval por policy | P0 | P0.2, P0.7 | partial | policy da entidade (etapa local, escopo `entity`) + policy do grupo (tesouraria, escopo `group`) somam etapas em sequência ou paralelo; aprovador não ganha acesso por ser aprovador; `tests/database/financial-policy-engine.sql` §4/§6/§9 | rollout hospedado pendente | alçada mal configurada pelo cliente | rollout com gates do piloto | feature/policy-engine-v2 |

### P0.3 — Financial Passport → Financial Graph

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.3-01 | §10.2 | Proveniência por campo (source, owner, verified_at, review_after, valid_until), histórico append-only, snapshot imutável na RFQ | P0 | — | implemented | `docs/supabase-financial-passport.sql`, `lib/finance/passport.mjs`, `tests/database/financial-passport.sql`, `scripts/test-finance-passport.mjs`, `tests/e2e/finance-passport.spec.js`, `/finance/passport.html` | — | — | manter | #95 |
| P0.3-02 | §10.1 | Passport por entidade legal | P0 | P0.2 | partial | migration aditiva, RLS, history, snapshot, API, resolver, UI e prefill; docs/FINANCIAL_PASSPORT_ENTITIES.md | PostgreSQL CI 37155391334 success; quatro jobs CI success; rollout hospedado pendente | Vercel 403; banco antigo sem backup/restore executor | herança financeira indevida evitada por whitelist; rollback recusa dados de entidade | domínio/API aprovados; financeiro 239 passed/21 skips; apresentação local 301 passed/44 skips; DB remoto success | PR #105 / a2906d6 |
| P0.3-03 | §10.1, Add. B | Graph relacional dos registros canônicos, consultável | P0 | P0.2, P0.4–P0.6 | partial | views SECURITY INVOKER, RPC paginada, API sob JWT, contexto UI; docs/FINANCIAL_GRAPH.md | rollout hospedado pendente; fees sem system of record dedicado | Vercel 403; banco antigo sem executor seguro | joins de ancestrais ocultos retornam null; sem edges redundantes | CI #106 run 37156727940 (4 jobs success) na mesma árvore; reintegrado na pilot por cherry-pick (feature/integrate-financial-graph) com test:database, check:all e E2E Chromium locais | feature/integrate-financial-graph |

### P0.4 — Contract & Renewal Center v2

Migration `docs/supabase-financial-contracts-v2.sql` (`financial-contracts-v2-1`) + rollback fail-closed; testes
`tests/database/financial-contracts-v2.sql`, `scripts/test-finance-contracts.mjs`, `tests/e2e/finance-contracts.spec.js`.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.4-01 | §14.2 | Marcos de renovação D-180/120/90/60/30/7, tarefa e aviso idempotentes, nova RFQ a partir do contrato | P0 | — | implemented | `docs/supabase-financial-renewals.sql`, `fin_run_renewal_schedule`, `/api/jobs/renewals`, `fin_start_contract_rfq` (agora também para contrato importado, herdando entidade) | — | — | — | PR contratos/portfólio |
| P0.4-02 | §14.1 | Termos estruturados (partes, valores/limites, pricing, indexador, spread, fees, garantias, covenants, SLA, rescisão, repricing, renovação, campos de adquirência) | P0 | P0.2 | implemented | `lib/finance/contract-terms.mjs` (allowlist), `fin_contract_versions`, `fin_record_contract_terms`, UI "Abrir contrato" | covenants seguem como texto contratual (monitor estruturado é P1.8) | termo inferido | P1.8 | PR contratos/portfólio |
| P0.4-03 | §14.3 | Aditivos imutáveis com versão temporal e contrato pai/filho | P0 | P0.4-02 | implemented | `fin_contract_amendments`, `fin_record_contract_amendment` (preserva fim/aviso anteriores), `parent_contract_id`, diff factual (`diffContractTerms`) | — | — | — | PR contratos/portfólio |
| P0.4-04 | §14.2 | Marcos próprios e obrigações recorrentes com tarefa por ocorrência e job | P0 | P0.4-02 | implemented | `fin_contract_milestones`, `fin_contract_milestone_runs`, `fin_process_contract_milestones`, `fin_run_contract_milestones` no cron | notificação por e-mail do marco depende do provedor de e-mail (owner) | — | — | PR contratos/portfólio |
| P0.4-05 | §14.1 | Contrato existente da carteira (fora de RFQ) e categorias além de crédito/adquirência | P0 | P0.4-02 | implemented | `origin='imported'`, `fin_import_contract`, botão "Registrar contrato existente" | importação em lote (CSV/ERP) é P2.6 | — | P2.6 | PR contratos/portfólio |

### P0.5 — Provider / Bank Relationship Management

Migration `docs/supabase-financial-relationships-portfolio.sql` (`financial-relationships-portfolio-1`); testes
`tests/database/financial-relationships-portfolio.sql`, `scripts/test-finance-portfolio.mjs`, `tests/e2e/finance-portfolio.spec.js`.

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.5-01 | §12.1 | Cadastro do provedor (tipo, contato, região, evidência regulatória) | P0 | — | implemented | `fin_providers`, `fin_record_provider_evidence`, `/finance/providers.html` | — | — | — | — |
| P0.5-02 | §12.1 | Múltiplos contatos (grupo/entidade), relação provedor × entidade com owner e categorias | P0 | P0.2 | implemented | `fin_provider_contacts`, `fin_provider_relationships`, painel "Relacionamento" | — | — | — | PR contratos/portfólio |
| P0.5-03 | §12.1 | Métricas factuais: convidados, respondidos, taxa e mediana de resposta, contratos, facilities, issues | P0 | — | implemented | `relationshipMetrics` com definições; `GET /api/finance/provider-relationship` sob RLS | — | métrica inventada | — | PR contratos/portfólio |
| P0.5-04 | §12.1, §25 | Issues/follow-ups com resolução e linha do tempo | P0 | P0.5-02 | implemented | `fin_provider_issues`, `fin_open_provider_issue`/`fin_update_provider_issue`, timeline no painel | performance records importados (SLA de serviço) são P1.9 | — | P1.9 | PR contratos/portfólio |
| P0.5-05 | §12.3, §25 | Scorecards definidos pelo cliente, versionados, avaliação imutável, sem score default | P0 | P0.5-04 | implemented | `fin_scorecard_templates`, `fin_provider_reviews`, Configurações → Scorecards | — | score subjetivo | — | PR contratos/portfólio |
| P0.5-06 | §12.2 | Relationship map provedor × entidade × categoria × contratos × limites | P0 | P0.4, P0.6 | implemented | `relationshipMap` + tabela no painel | participação no wallet (exige spend, P1.7) | — | P1.7 | PR contratos/portfólio |

### P0.6 — Debt / Facilities / Limits / Guarantees

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.6-01 | §13.1 | Facility com provenance (origem, referência, verificado em, revisar depois de), histórico de alterações | P0 | P0.2, P0.4 | implemented | `fin_facilities`, `fin_facility_history` (gatilho), `fin_save_facility`, `fin_confirm_facility`, `/finance/portfolio.html` | importação/integração automática (P2.6/P2.7) | ledger paralelo | — | PR contratos/portfólio |
| P0.6-02 | §13.1 | Saldo/uso point-in-time e cronograma declarado versionado | P0 | P0.6-01 | implemented | `fin_facility_balances` (append-only), `fin_facility_repayments` (`schedule_version`) | — | — | — | PR contratos/portfólio |
| P0.6-03 | §13.1 | Garantias comprometidas | P0 | P0.6-01 | implemented | `fin_guarantees`, `fin_save_guarantee` | — | — | — | PR contratos/portfólio |
| P0.6-04 | §13.2 | Visões por moeda: limites aprovado/usado/disponível, maturity wall, mix de indexadores, concentração, refinanciamento, garantias, revisão vencida | P0 | P0.6-01 | implemented | `portfolioViews` (`lib/finance/portfolio.mjs`), definições por métrica | conversão entre moedas deliberadamente ausente | soma de moedas | — | PR contratos/portfólio |

### P0.7 — Policy & Approval Engine v2

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.7-01 | §27 | Aprovação sequencial com snapshot, stale detection, segregação solicitante ≠ aprovador | P0 | — | implemented | `docs/supabase-financial-enterprise-approvals.sql`, `docs/supabase-financial-approval-handoff.sql`, `tests/database/financial-enterprise-approvals.sql`, `/finance/approvals.html`; preservado como caminho `legacy` sem policy | — | — | — | — |
| P0.7-02 | §27 | Policies por valor/categoria/entidade/N propostas/provedor novo/garantia/covenant/prazo, versionadas, global vs local, snapshot no processo | P0 | P0.2 | partial | `docs/supabase-financial-policy-engine.sql`, `docs/FINANCIAL_POLICY_ENGINE.md` (fatos, precedência determinística grupo+entidade+fallback, fronteira de moeda), versões imutáveis, snapshot no pedido, `lib/finance/policy.mjs`, Configurações → Governança; testes DB/unit/API/E2E | rollout hospedado pendente; covenant é fato declarado (sem covenant estruturado); sem câmbio por desenho | regra do cliente incompleta (mitigado por fato desconhecido = conservador) | rollout com backup/restore drill/doctor/canário | feature/policy-engine-v2 |
| P0.7-03 | §27 | Escalonamento, prazos de aprovação, justificativa de exceção, group treasury approval | P0 | P0.7-02 | partial | prazos por etapa, escalação idempotente e expiração (`fin_process_approval_deadlines`, job `approval_deadlines`), exceção explícita (`fin_policy_exceptions`), delegação (`fin_approval_delegations`), SoD padrão + configurável, devolução com `reason_code`, substituição explícita | escalação na cadência do cron diário (+ acionamento manual); rollout pendente (aviso próprio de exceção pedida/decidida entregue em `financial-p0-closure-1`) | prazo vencido sem ação humana (mitigado por tarefa + aviso) | idem | feature/policy-engine-v2 |

### P0.8 — Public API & Webhooks Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.8-01 | §31.1 | API versionada com service accounts/API keys, scopes, tenant/entity auth, paginação, rate limit, idempotency, audit | P0 | P0.2 | partial | `/api/v1/*` (`lib/api/domains/public-api.mjs`), `docs/supabase-financial-public-api.sql` (token só por hash, credencial AND organização AND entidade AND escopo AND objeto em `fin_api_*`), keyset, filtros fechados, rate limit por credencial fail-closed, `Idempotency-Key`, correlação, trilha em `fin_events`; administração em Configurações → Integrações; `docs/FINANCIAL_PUBLIC_API.md`, OpenAPI | rollout hospedado pendente; escrita v1 só cria rascunho de RFQ | token vazado (mitigado: expiração, revogação imediata, last_used, prefixo por ambiente) | rollout + chave de cifragem por ambiente | feature/public-api-webhooks |
| P0.8-02 | §31.1 | Webhooks: registro, assinatura HMAC, replay protection, retries, delivery log, dead-letter | P0 | P0.8-01 | partial | outbox por gatilho em `fin_events` (payload mínimo), `fin_webhook_claim`/`complete` com lease/fencing, backoff 1 min→24 h, dead-letter na 8ª, auto-desativação em 20 falhas, replay manual, HMAC sobre `t.delivery_id.body`, segredo AES-256-GCM, SSRF (URL + DNS na entrega), `lib/finance/webhook-dispatch.mjs`, job `webhooks` | cadência diária do cron (blocker: agendador em minutos); DNS rebinding resolvido (IP validado fixado no socket, `test-operational-resilience`) | receptor sem verificação (doc + exemplo) | blockers em `docs/FINANCIAL_PUBLIC_API.md` | feature/public-api-webhooks |
| P0.8-03 | §31.1 | Docs, versioning e deprecation policy | P0 | P0.8-01 | implemented | `docs/FINANCIAL_PUBLIC_API.md` (compatibilidade, deprecação ≥ 180 dias com `Deprecation`/`Sunset`, envelopes, erros), `docs/openapi/arandu-public-api-v1.json` com teste de paridade rota↔contrato | — | — | manter Histórico a cada mudança | feature/public-api-webhooks |

### P0.9 — Enterprise IAM / SSO Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.9-01 | §33 | MFA para operador da plataforma | P0 | — | implemented | `lib/finance/ops-access.mjs`, `scripts/finance-operator-mfa.mjs` | MFA de usuários de cliente por policy não existe | — | P0.9-02 | — |
| P0.9-02 | §33, Add. F.1 | Abstração SAML/OIDC, mapeamento domínio→organização, session policy, readiness | P0 | P0.2 | partial | `docs/supabase-financial-sso.sql` (conexões, domínio verificado por TXT e globalmente único, `fin_sso_authorize` fail-closed, `fin_sso_session_valid`, revogação, trilha sem PII), adapters `lib/finance/sso-adapters.mjs` (Supabase SAML + IdP de teste), `verifyIdToken` estrito, state HMAC + PKCE, `/api/auth/sso/*`, Configurações → Segurança com prontidão honesta; `docs/FINANCIAL_SSO.md` | nenhum login real com IdP de cliente; rollout hospedado; adapter OIDC direto (além do broker) não ligado ao callback | SSO "funcionando" sem prova (mitigado: "operacional" exige broker real + login de teste registrado) | blockers em `docs/FINANCIAL_SSO.md` (SSO no Supabase, IdP do cliente, DNS, segredos por ambiente, rollout) | feature/enterprise-sso-foundation |
| P0.9-03 | §33, Add. F.1 | Exigência de SSO por organização e falha fechada (issuer, audience, nonce, state, expiração, domínio, organização, membro bloqueado, sessão revogada, tenant sem configuração) | P0 | P0.9-02 | partial | 403 `sso_required` antes da senha e 503 se a política não puder ser lida (`lib/api/domains/auth.mjs`); recusas com motivo estável testadas em `scripts/test-finance-sso.mjs` e `tests/database/financial-sso.sql`; E2E `tests/e2e/finance-sso.spec.js` | depende de P0.9-02 hospedado; MFA de quem entra por SSO fica com o IdP | admin trancado fora (runbook com forward-fix) | rollout + primeiro cliente com IdP | feature/enterprise-sso-foundation |

### P0.10 — Operational Resilience

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.10-01 | Add. E.1 | Backup preflight, restore drill, probes pós-restore | P0 | — | partial | ver P0.1-05 | hospedado | — | owner | — |
| P0.10-02 | Add. E.4 | Severidade, incident runbook, postmortem, dependency failure modes, RPO/RTO honestos | P0 | — | partial | `FINANCIAL_OPERATIONAL_RESILIENCE.md`, `FINANCIAL_INCIDENT_POSTMORTEM.md` | nomeação de responsáveis e ensaio DR hospedado | não há SLA/RPO/RTO garantidos | owner + drill | CI pendente |
| P0.10-03 | Add. E.5 | Health, request IDs, job runs, outbox retry/backoff | P0 | — | implemented | `/api/health`, `X-Request-ID`, `fin_job_runs` (inclui `approval_deadlines`, `webhooks`), `lib/email-outbox.mjs`, estado por entrega de webhook, `X-Correlation-Id` na API v1, `scripts/test-observability.mjs` | console ampliado; CI da rodada pendente | nenhuma disponibilidade inferida de configuração | P0.10 | CI pendente |

### P0.11 — Data Governance Baseline

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.11-01 | Add. D.1–D.2 | Classificação, minimização e source of truth consultáveis | P0 | — | implemented | registro por tabela `lib/finance/data-governance.mjs` (77 tabelas/views + infra compartilhada: SoR, classificação, PII/financeiro/credencial, retenção, exclusão, export, hold, dono), gate de cobertura contra as migrations em `scripts/test-finance-data-governance.mjs`, mapa SoR (Graph/busca/painel derivados), gate de minimização da trilha em `tests/database/financial-data-governance.sql`; `docs/FINANCIAL_DATA_GOVERNANCE.md` | metadado não é consultável por SQL (vive no código, verificado em CI) | tabela nova sem classificação (mitigado: gate falha) | P1 nasce classificada | branch `claude/stoic-archimedes-5tb1jj` |
| P0.11-02 | Add. D.4–D.5 | Retenção, legal hold, export, offboarding de tenant, revogação de integrações | P0 | P0.8, P0.9, P0.10 | partial | `docs/supabase-financial-data-governance.sql` (`financial-data-governance-1`): políticas versionadas sem prazo padrão (pisos/tetos técnicos), executor em lote com dry-run, lock, rerun idempotente, hold-aware e trilha `fin_governance_log`; legal hold com escopo validado; export assíncrono com manifesto + sha256 por conjunto, sem segredos, expiração 7 dias; offboarding determinístico com revogação idempotente (contas de serviço, credenciais, webhooks, SSO, convites, membros) sem cascade; job `/api/jobs/governance` com lease em `fin_job_runs`; UI Configurações → Governança de dados; card no console; rollback só sem uso; testes DB (matriz negativa: outro tenant, provedor, viewer, analista, escopo de entidade, sem vínculo, membro e conta de serviço revogados, export/hold/offboarding cross-tenant), JS, concorrência e E2E | exclusão física do tenant não implementada (`closed` exige zero linhas); export até 64 MB/conjunto com download em faixas de 4 MB e checksum (`financial-p0-closure-1`); offboarding de organização provedora; rollout hospedado | exclusão descrita como total (mitigado: docs e UI dizem o contrário) | decisão jurídica de retenção pós-contrato → executor de purge; rollout piloto | branch `claude/stoic-archimedes-5tb1jj` |
| P0.11-03 | Add. D.6 | Superfície de subprocessadores e readiness jurídica | P0 | — | blocked | `docs/FINANCIAL_LEGAL_REVIEW_REQUIRED.md` | parecer jurídico | claim LGPD | owner/jurídico | — |

---

### Legacy Art Marketplace Decommission

Inventário, categorias e procedimento em `docs/LEGACY_ART_RETIREMENT.md` (ponte para o Git: `76c50bf` último estado só de arte, `cfd51ea` último `pilot` com o runtime de arte no tree).

| ID | Capability | Status | Evidence | Gaps / blockers | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- |
| LEG-01 | Runtime, assets, client JS/CSS, dados estáticos, funções serverless, rotas de API e libs só de arte fora do tree | implemented (code complete, CI validated no merge) | ~150 páginas, `js/`, `css/`, `assets/`, `data/`, `content/`, `types/`, `supabase/`, stack Next/TS, 9 funções `api/*`; 23 rotas de arte removidas do roteador `api/[...path].js`; 8 módulos de domínio e 6 libs de arte apagados; `check:legacy-art` (tree, com prova negativa `test-legacy-art-gate`) e `check:financial-surface --dist` | deploys hospedados anteriores ainda respondem `legacy_surface_closed` até o próximo deploy | — | #114, PR final legacy runtime cleanup |
| LEG-02 | Scripts, testes, dependências, variáveis de ambiente e documentos de arte fora do tree | implemented (code complete) | ~35 scripts, 5 specs E2E, `typescript`, ~115 documentos; 8 testes de rotas de arte trocados por ausência (`test-auth-api`: 23 rotas em 404; `test-deployment-surface`); 27 variáveis de arte fora do `.env.example`/validadores, com gate | variáveis antigas podem continuar definidas nos projetos Vercel (não lidas) | limpeza opcional no painel pelo owner | #114, PR final legacy runtime cleanup |
| LEG-03 | Objetos de banco e storage da arte | partial | migration nova `docs/supabase-financial-legacy-art-decommission.sql` (marker `financial-legacy-art-decommission-1`): recusa sem `arandu.legacy_art_decommission_ack=export-verified:<ref>`, grava evidência só de contagens, remove ~36 tabelas, 18 views, ~29 funções e o trigger de perfil sem CASCADE, preserva rate limit e outbox transacional; rollback recusa (restore + forward-fix); clean install, upgrade povoado, reaplicação, canário e probes no `test:database` | aplicação hospedada e bucket de mídia hospedado BLOCKED (backup/restore verificado, export, decisão do owner) | owner executa o procedimento hospedado de `docs/LEGACY_ART_RETIREMENT.md` | PR legacy database decommission |

## P1 — Recorrência, ROI e diferenciação

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1.1 | §19 | Savings & Value Realization Ledger | P1 | P0.4, P0.2 | implemented | Mergeado na #118 (`pilot@d0d5deb`): tabelas próprias, baseline documentado, metodologias v1 imutáveis por tipo, observação e verificação humana, RLS/FORCE/entity scope, API JWT, `/finance/value.html`, totais por tipo/moeda, Graph derivado, registry/export/hold, migration/rollback, testes negativos. CI do HEAD final `f4b78a2` falhou e foi corrigido na #119 (`pilot@1016b0f`, quatro gates verdes no HEAD exato `189bc9d`, run `37212668535`) | **code complete + CI validated**; hosted validated e production ready pendentes (rollout) | merge com gate pendente (ocorreu); mitigado por `npm run merge:gates` + template; branch protection = BLOCKER | rollout hospedado (BLOCKER) | #118, #119 |
| P1.2 | §17 | Bank Fee Intelligence | P1 | P0.4, P0.5 | implemented | Mergeado na #120 (`pilot@4f97e16`): `fin_fee_schedules`/`_versions` (versionadas, vinculadas a `fin_contract_versions`), `fin_fee_observations` (origem, referência, evidência, verificação humana, dedupe idempotente), `fin_fee_variances` (snapshot imutável, comparabilidade com motivos, sem número forçado), `fin_fee_reviews` (máquina de estados humana); RLS/FORCE/entity scope; RPCs; API JWT; `/finance/fees.html` (renderer genérico + apresentador no servidor, linguagem segura); painel do provedor; Graph; registry/export/hold/offboarding; migration/rollback; testes SQL/API/E2E (`docs/FINANCIAL_FEE_INTELLIGENCE.md`) | ingestão automática (API/ERP/arquivo/extração) inexistente por desenho; API pública sem `fees:read`; hosted pendente | falso positivo de diferença (mitigado: só comparável calcula, linguagem segura, revisão humana); **code complete + CI validated** (run `37214713845`, quatro gates success no HEAD exato `e889aff`); hosted validated e production ready pendentes | rollout hospedado (BLOCKER) | #120 |
| P1.3 | §18 | Opportunity Engine determinístico | P1 | P0.4–P0.6, P0.10, P1.1, P1.2 | partial | Branch `feature/opportunity-engine`: regras versionadas da empresa (14 tipos, limiares financeiros sem padrão), `fin_opportunities` com fatos congelados, fingerprint/dedupe, cooldown, reabertura por mudança material, expiração com motivo, máquina de estados humana com revisor, job `opportunities` (lease/fencing/lotes/cursor) na cron diária, gatilho incremental de tarifas, rascunho de RFQ com confirmação, worklist `/finance/opportunities.html`, Graph, registry/export/hold, migration/rollback, testes (`docs/FINANCIAL_OPPORTUNITY_ENGINE.md`) | notificações por oportunidade; API pública sem `opportunities:read`; cadência da cron diária (BLOCKER P0.10); hosted pendente | virar recomendação (mitigado: fato+regra da empresa+ação possível, sem ranking, linguagem testada) | CI verde no HEAD exato e merge | — |
| P1.4 | §23 | Proposal & Document Intelligence | P1 | docs privados | missing | upload privado existe (`fin_private_documents`) | extração exige provedor de IA/OCR | extração errada | foundation com confirmação humana | — |
| P1.5 | §33, Add. F.2 | SCIM / JIT / access reviews / service accounts | P1 | P0.9 | missing | — | — | misconfiguration | — | — |
| P1.6 | §26 | Executive Portfolio | P1 | P0.4–P0.6 | partial | `/finance/dashboard.html` (pipeline, tarefas, prazos, consolidado por entidade, **Inteligência de valor**: valor negociado/realizado/evitado, diferenças e revisões de tarifa, cobertura, oportunidades — por moeda, entidade e período, com links de ação; `docs/FINANCIAL_VALUE_INTELLIGENCE_EXECUTIVE.md`), `/finance/portfolio.html` (dívida, limites, concentração, garantias) | cycle times; P1.7 Spend Analytics; export executivo | dashboard sem ação (mitigado: cada cartão leva ao trabalho); soma entre moedas/tipos (proibida e testada) | CI verde no HEAD exato e merge | — |
| P1.7 | §16 | Financial Spend Analytics | P1 | P1.2 | missing | — | — | dupla contagem | — | — |
| P1.8 | §15 | Covenant & Obligation Monitor | P1 | P0.4 | missing | — | — | breach falso | com contracts v2 | — |
| P1.9 | §25 | Provider Performance | P1 | P0.5 | missing | — | — | score universal | — | — |
| P1.10 | §35 | Enterprise Search | P1 | P0.2 | partial | `fin_search` (RFQ/proposta/provedor/contrato/tarefa, limitado), entity-aware desde a multi-entity | sem filtros de entidade/data/estado/categoria; não cobre documentos, comentários, obrigações | leakage | após P0.4–P0.6 | — |
| P1.11 | §22 | Enterprise Intake | P1 | P0.2 | missing | intake só na demo (`DEMO_ONLY_PAGES`) | — | campo crítico inferido | — | — |
| P1.12 | §21 | Scenario Builder / split award | P1 | comparação | missing | — | — | parecer recomendação | — | — |

## P2 — Product Packs e integrações

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P2.1 | §30.2 | FX Pack | P2 | gate §43.1 | missing | catálogo `lib/finance/products.mjs` com 2 produtos | gate §43.1 não respondido | boundary regulatório | após P0/P1 | — |
| P2.2 | §30.2 | Guarantees/Surety Pack | P2 | gate §43.1 | missing | — | — | — | — | — |
| P2.3 | §30.2 | Cash Management RFP | P2 | gate §43.1 | missing | — | — | escopo virar TMS | — | — |
| P2.4 | §30.2 | Working Capital / Receivables | P2 | gate §43.1 | missing | — | — | — | — | — |
| P2.5 | §30.2 | Acquiring Intelligence v2 | P2 | P1.2 | partial | adquirência v1 (MDR, PIX, antecipação, liquidação) | contrato vs realizado | — | — | — |
| P2.6 | §31 | ERP/TMS connector framework | P2 | P0.8 | missing | — | — | source conflict | — | — |
| P2.7 | §32 | Open Finance | P2 | P0.11, consentimento | blocked | — | consentimento real/parceiro | privacy | readiness | — |
| P2.8 | §31.4 | Teams/Slack/BI/provider APIs | P2 | P0.8 | missing | — | — | decisão fora do contexto | — | — |

## P3 — Network effects e data moat

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P3.1 | §28 | Provider Discovery Network | P3 | buyer-side maturity | blocked | — | gate de maturidade buyer-side não comprovado (sem cliente real em operação) | privacy/neutrality | não iniciar | — |
| P3.2 | §29.2 | Internal benchmarks | P3 | P1.1, P1.2 | missing | — | — | — | após P1 | — |
| P3.3 | §29.3, §43.2 | External benchmark | P3 | gates jurídicos/estatísticos | blocked | — | volume, contrato/legal basis, anonimização, revisão jurídica | reidentificação | não iniciar | — |

## Camada assistiva — AI Financial Procurement Analyst

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI-01 | §24 | Assistente factual com grounding sob RLS | P1+ | P0/P1 dados confiáveis | missing | — | provedor de modelo, revisão de dados em IA (§50) | retrieval sem permissão | depois de P1 | — |

---

## Log de execução da rodada (03/10/2026)

### Estabilização pós-#103

Baseline viva `pilot@742fc1f`; ver `PILOT_STABILIZATION_2026-10-03.md`.
`presentation` no run 37148718617 falhou por overflow determinístico de 31 px
no Mobile Safari, causado pelo rótulo nowrap da ação de Contract Center. Correção
localizada nos botões de contratos e teste 320/393 px, light/dark, teclado e scroll
de marcos. Gates locais e resultados remotos constam na PR de estabilização.
Os deploys dos três projetos Vercel falharam nesse SHA; logs/configuração bloqueados
por 403 de acesso à equipe. Causa do deploy ainda não comprovada. Pilot **não** é
declarada saudável. P0.3-02/P0.3-03 continuam `missing`; P0.7 não foi antecipado.

1. Sincronizado `pilot` (`6ad0d4f`), confirmado `main` ⊂ `pilot`, branch de trabalho a partir de `pilot`.
2. Auditoria acima. Primeiro gap P0 não bloqueado: **P0.2 Multi-Entity Foundation** (P0.1
   restante é externo/owner).
3. P0.2 implementado (migration, RLS, guardas, API, UI, testes, docs). Validação local: `test:database`
   verde (clean/upgrade/reapply/rollback/canário com membros restritos: 0 vazamentos), `check:all` verde,
   build + gates de dist, E2E financeiro em Chromium desktop/mobile (65 + 14 passaram, 7 pulados por
   projeto), `audit:ci` 0 vulnerabilidades. PR #101.
4. P0.4 Contract Center v2, P0.5 Provider RM e P0.6 Debt/Facilities implementados em `agent/contract-center-v2`
   (PR empilhada sobre #101). Próximo: P0.7 Policy & Approval Engine v2 → P0.8 API/Webhooks → P0.9 IAM/SSO.

### Continuação P0.3 após #104

Baseline pilot 69e1472, #104 mergeado; quatro jobs CI success (run 37151733366). Blockers hospedados permanecem no documento de estabilização, com owner/ação/verificação. Passport entity-aware está em implementação/teste, sem claim de operação hospedada. Próximo passo independente: Financial Graph relacional; Policy v2 depende desta base.

## Continuação Passport e Graph — 2026-10-03

#105: banco e deploy-boundaries success no run 37155391334; validate success; presentation success. Local Passport: 239 financeiros e 301 apresentação aprovados, 21/44 skips existentes. O estado histórico acima registra observações anteriores; P0.3-02 e P0.3-03 agora partial. Graph é camada de consulta, sem duplicar records. Próxima ação: validar Graph no CI real e seguir P0.7. Vercel/rollout continuam externos, sem claim de saúde.

## Integração do Financial Graph na pilot — 2026-10-03

O #106 foi mergeado em `feature/passport-legal-entity` (PR empilhada), não na `pilot`. A recuperação nasce de `pilot@1caa67f` e traz só `b59ab5d` + `b3449e2` por cherry-pick (`-x`); a árvore resultante é idêntica à validada no run 37156727940. Gates locais nesta branch: audit, SBOM, check:all, build, dist-assets, build-size, test:database (Postgres 16), E2E financeiro e apresentação em Chromium desktop/mobile; Firefox/WebKit ficam com o CI. Regra desta rodada: nenhuma PR empilhada; cada feature nasce da `pilot` e volta para a `pilot`.

## P0.7 Policy & Approval Engine v2 — 2026-10-03

Branch `feature/policy-engine-v2` nasce de `pilot@dc43f57` (merge do #107, Graph integrado), sem empilhamento. Entrega: migration `financial-policy-engine-1` (aditiva, idempotente, rollback que aborta diante de trilha), domínio, API, UI (Governança, aba Aprovações, caixa de aprovações), job de prazos e docs (`docs/FINANCIAL_POLICY_ENGINE.md`). Evidência local: `test:database` completo (clean, upgrade sobre aprovações v1, reaplicação, rollback), `check:all`, testes de domínio/API e E2E. Status `partial` (não `implemented`) porque o rollout hospedado segue bloqueado pelos gates do piloto. Próximo: P0.8 Public API & Webhooks a partir da `pilot` após o merge.

## P0.8 Public API v1 & Webhooks — 2026-10-03

Branch `feature/public-api-webhooks` rebaseada sobre `pilot@582291c` (merge do #108), sem empilhamento. Entrega: migration `financial-public-api-1` (contas de serviço, credenciais por hash, idempotência, endpoints, eventos, entregas; rollback que aborta diante de trilha), borda `/api/v1/*` com contrato estável e OpenAPI, administração em Configurações → Integrações, worker de entrega e job `webhooks`. Evidência local: `test:database` completo, testes de domínio/API/integrações, E2E. Blockers externos (chave de cifragem por ambiente, agendador em minutos, rollout hospedado) com BLOCKER/WHY/WHO/ACTION/READY/VERIFY em `docs/FINANCIAL_PUBLIC_API.md`. Próximo: P0.9 Enterprise IAM/SSO foundation a partir da `pilot` após o merge.

## P0.9 Enterprise SSO foundation — 2026-10-04

Branch `feature/enterprise-sso-foundation` nasce da `pilot` após o merge do #109, sem empilhamento. Entrega: migration `financial-sso-1` (aditiva, idempotente, rollback que aborta diante de configuração ou trilha), validação estrita de identidade com IdP de teste de chaves reais, adapter Supabase SAML, callback com motivos estáveis, exigência de SSO no login por senha, limite e revogação de sessão, administração e prontidão em Configurações → Segurança, "Entrar com SSO" no login, runbook e threat model. Status `partial`: não houve login real com IdP de cliente e o rollout hospedado segue bloqueado; não há claim de SSO funcionando. Próximo: P0.10 Operational Resilience a partir da `pilot` após o merge.

## Correção do gate pós-#110 — 2026-10-04

Baseline viva `pilot@13532e188bc7547e4042440e61b45988d5278e80`.
O run `37165743881` terminou com `validate`, `database` e `deploy-boundaries`
aprovados; `presentation` falhou no teste de desempenho da RFQ em WebKit desktop:
p95 de navegação de 1892 ms, 1592 ms e 1557 ms nas três tentativas, contra o
orçamento obrigatório de 1500 ms. Os limites, navegadores, retries e assertions
permanecem intactos.

Branch `fix/pilot-webkit-route-performance`, diretamente desta `pilot`, remove
cascatas independentes no caminho crítico: imports do transporte local em
paralelo, transporte e workspace em paralelo, preload apenas do módulo da tela
atual durante o bootstrap, e consulta de entidades em paralelo às consultas de
aprovação no detalhe da RFQ. Regras de autorização e validação da política
continuam no servidor; somente a ordem de início das leituras independentes muda.

Validação local: `npm ci --include=optional`; `check:all` executado sem
credenciais herdadas e com conexões reais de rede bloqueadas; build aprovado.
WebKit local não pôde iniciar por bibliotecas de sistema ausentes; a instalação
das dependências também foi recusada pelo ambiente de execução. Evidência
cross-browser e os quatro gates completos ficam pendentes do CI desta PR.
Nenhum merge está autorizado enquanto algum gate obrigatório estiver pendente
ou falhando. P0.10, P0.11 e P1 permanecem com seus estados anteriores.

A revisão cirúrgica identificou para P0.10: preflight de backup com allowlist
de marcadores desatualizada, conclusão de webhook com falha ocultada, cron de
renovação respondendo sucesso apesar de falhas nos jobs dependentes e resolução
DNS de webhook sem timeout próprio. São lacunas encontradas, ainda não corrigidas
nesta PR de estabilização. Próximo: concluir os gates desta correção, merge
verde e nova branch da `pilot` para P0.10.


### P0.10 — rodada de resiliência, 2026-10-04

A PR #111 foi mergeada em `3be02b4c60631dfb592184e1d42bed1063239586` após os quatro gates verdes ([CI](https://github.com/lucasweber1202/Arandu/actions/runs/37167183736)): validate 319 passed/21 skips preexistentes; presentation 301 passed/44 skips preexistentes, sem flaky e performance desktop aprovada na primeira tentativa nos três motores. Branch de resiliência nasce diretamente desse merge.

Entrega da rodada: schema `financial-operational-resilience-1`; jobs running/início/fim/failed e leases com fencing; conclusão idempotente, expiração e retomada; lotes limitados e sem starvation de ocorrências já processadas; falha parcial/telemetria não vira sucesso HTTP; resposta externa inválida não vira zero; DNS com prazo, IP de webhook fixado no TLS, completion_failed/deferred visíveis, lease vencido rejeitado, 4xx semântico terminal e backoff com jitter; preflight reconhece os marcadores recentes sem liberar origem/escopo desconhecido; console existente ampliado mantendo finance_ops + MFA e auditoria; runbook canônico, severidades, dependências, DR e postmortem.

P0.10 permanece **partial**: nomes e escala de responsáveis, restore/DR hospedados, RPO/RTO medidos, IdP real e jornada hospedada dependem do owner/executor. Nenhum banco hospedado alterado, nenhum gate externo marcado pronto, nenhum SLA ou recovery garantido. Testes locais de contratos, banco/upgrade/rollback e quatro gates remotos são necessários; Local: check:all sem credenciais/rede real, build limpo, assets e budgets aprovados (406236 bytes JS/800000); testes de timeout, DNS, respostas malformadas, lote parcial, UTF-8 e códigos seguros aprovados. Banco/concorrência/upgrade/rollback e CI desta rodada ainda pendentes. P0.11 e P1 não avançaram antes do merge verde de P0.10.


## P0.11 Data Governance — 2026-10-04

Partiu de `pilot` @ `cfd51ea` (merge da #112, P0.10), sem PR posterior e com `feature/data-governance` idêntica à `pilot`. Entregue no código: registro de classificação/SoR, retenção versionada, legal hold, export portável, offboarding com revogação, semântica de exclusão, trilha, UI, job e documentação (`docs/FINANCIAL_DATA_GOVERNANCE.md`). Local: `npm run test:database` verde (clean install, reaplicação, upgrade sobre base povoada, rollback recusado com estado e aceito sem uso, canário com as tabelas novas, concorrência), `npm run check:all` verde, build e budgets aprovados (governança em chunk próprio sob demanda), E2E financeiro em Chromium desktop + mobile. Firefox/WebKit ficam para o CI. Hospedado: nada aplicado; P0.11 permanece `partial` até a exclusão física (decisão jurídica) e o rollout do piloto. Próximo: aposentadoria do legado de arte (runtime, depois banco/storage).


## Legacy art runtime cleanup — 2026-10-04

Partiu de `pilot` @ `07f6221` (merge da #113, P0.11). Removido do tree: 567 arquivos (−35,6 mil linhas): tracked files 1259 → 721; bytes versionados 31,6 MB → 28,6 MB (o restante é majoritariamente evidência visual da demo financeira). Artefato publicado inalterado em superfície (JS 421 kB / 800 kB, sem página, texto, asset ou SEO de arte, conferido pelo novo `check-legacy-art --dist`). Blocker registrado: a leitura do roteador `api/[...path].js` foi negada pela política de permissões desta sessão; as rotas de arte dentro dele seguem fechadas (404) em piloto/produção/demo e são o próximo passo do owner.


## Legacy art database decommission — 2026-10-04

Partiu de `pilot` @ `0738693` (merge da #114). Migration aditiva nova; nenhuma migration histórica editada. Local: `npm run test:database` verde (clean install em passada única com 25 suítes financeiras, upgrade sobre base com dados de arte recusado sem ack e com ack inválido e aceito com ack, reaplicação idempotente, canário, probes pós-migração, rollback recusado). Hospedado: nada aplicado; piloto e produção só recebem a migration depois de backup com restore verificado, export dos dados de arte e decisão registrada do owner (BLOCKER em `docs/LEGACY_ART_RETIREMENT.md`).


## Final legacy runtime cleanup — 2026-10-04

Partiu de `pilot` @ `051f10f` (merge da #115). `api/[...path].js` lido por inteiro e reescrito para a superfície financeira (finance/*, auth/*, v1/*, crons, security.txt); 23 rotas de arte, 8 módulos de domínio e 6 libs de arte removidos; `authSessionCookie` (console finance_ops) e security.txt preservados em módulos próprios; modelos de e-mail de arte e 27 variáveis de ambiente de arte removidos; `lib/legacy-surface.mjs` → `lib/deployment-surface.mjs` (`route_not_found`). Gate `check:legacy-art` ampliado (módulos, imports, rotas do roteador, env, modelos de e-mail) com prova negativa. Login, cadastro, refresh, logout, recuperação, SSO, MFA do console, API financeira, Public API, crons, health e security.txt cobertos por `test-auth-api`, `test-finance-sso`, `test-finance-public-api`, `test-deployment-surface`, `check-security-contact` e E2E.


## Clean-room final e P0 closure — 2026-10-04

Clean-room num clone limpo de `pilot` @ `63dddd5` (merge da #116), sem artefato do checkout de trabalho: `npm ci --include=optional`, `audit:ci`, `sbom:ci`, `check:all`, `build`, `check:dist-assets`, `check:build-size`, `check:seo:dist`, `check:financial-surface`, `check:legacy-art`, `test:e2e:list`, `test:database`, `test:e2e`, `test:e2e:presentation`, `git diff --check` — todos verdes: audit 0 vulnerabilidades, SBOM 21 componentes, E2E Chromium desktop+mobile 135 aprovados (7 skipped), apresentação 119 aprovados (19 skipped), 0 falhas. Estado final da arte em `docs/LEGACY_ART_RETIREMENT.md`: runtime, rotas, assets, dependências e variáveis = 0; testes de arte = só ausência/aposentadoria (testes de comportamento de reserva, pedido, perfil, status operacional e retenção de arte saíram do `test:database`; a outbox compartilhada passou a ser testada pelo caminho financeiro); migrations históricas preservadas; limpeza hospedada de banco e storage controlada por blocker.

Revisão de todos os P0 `partial`/`missing`:

| ID | Gap | Classe | Resultado |
| --- | --- | --- | --- |
| P0.7-03 | aviso de exceção sem notificação própria | CODE_IMPLEMENTABLE | **feito**: `financial-p0-closure-1` (pedida → quem decide; decidida → quem pediu), preferência própria, teste DB |
| P0.11-02 | export > 4 MB por conjunto falha | CODE_IMPLEMENTABLE | **feito**: teto 64 MB, `fin_governance_export_part_range`, manifesto isolado, download em faixas conferido por sha256 na interface |
| P0.8-02 | DNS rebinding residual | CODE_IMPLEMENTABLE | **já resolvido no código** (P0.10); documentação corrigida |
| P0.7-02 | covenant estruturado; câmbio | INTENTIONAL_BOUNDARY | Covenant Monitor é P1 (addendum P1.8); sem câmbio por desenho |
| P0.8-01 | escrita v1 só rascunho de RFQ | INTENTIONAL_BOUNDARY | ação material permanece humana |
| P0.9-02 | adapter OIDC direto sem callback | INTENTIONAL_BOUNDARY | a sessão é emitida pelo broker (Supabase Auth); adapter direto só com cliente que exija, sem broker |
| P0.11-02 | offboarding de organização provedora | EXTERNAL_BLOCKER | exige decisão de produto sobre propostas que pertencem a compradores |
| P0.11-02 | exclusão física do tenant | EXTERNAL_BLOCKER | exige decisão jurídica de retenção pós-contrato |
| P0.1-01, P0.1-05, P0.1-07, P0.2-09, P0.3-02, P0.3-03, P0.7-02/03, P0.8-01/02, P0.9-02/03, P0.10-01/02, P0.11-02 | rollout/drill/DR/IdP/cron/DEMO/produção | EXTERNAL_BLOCKER | blocos abaixo |

```
BLOCKER: rollout hospedado das migrations financeiras (piloto; produção depois)
WHY: o banco do piloto está atrás do código; aplicar exige ambiente confirmado e restore verificado
WHO MUST ACT: owner com acesso ao Supabase do piloto
EXACT ACTION: ARANDU_ENV=pilot npm run finance:pilot:doctor; npm run pilot:backup:preflight; npm run pilot:restore:drill (destino descartável); npm run migrations:bundle -- --after-schema=<marker atual>; aplicar; doctor, canário e jornada autenticada. A aposentadoria da arte só com o procedimento de docs/LEGACY_ART_RETIREMENT.md
WHAT IS READY: migrations com rollback/forward-fix, bundle por marker, canário, probes, doctor com marker esperado
HOW TO VERIFY: doctor GO com o marker esperado; canário sem falha; jornada autenticada
```

```
BLOCKER: restore drill e ensaio de DR hospedados; RPO/RTO medidos
WHY: nenhum restore hospedado foi executado; sem medição não há RPO/RTO declarável
WHO MUST ACT: owner / responsável pela plataforma
EXACT ACTION: npm run pilot:restore:drill contra o backup real em destino descartável, cronometrado; registrar em docs/FINANCIAL_RELEASE_EVIDENCE_<data>.md
WHAT IS READY: scripts de preflight, drill e probes pós-restore
HOW TO VERIFY: evidência datada com tempo de restore e probes verdes
```

```
BLOCKER: login real com IdP de cliente (SSO)
WHY: o caminho broker foi testado com IdP de teste; nenhum IdP corporativo real
WHO MUST ACT: owner + primeiro cliente com IdP
EXACT ACTION: configurar SSO no Supabase do ambiente, domínio verificado por TXT, login de teste registrado (docs/FINANCIAL_SSO.md)
WHAT IS READY: fluxo fail-closed, prontidão honesta na interface, testes
HOW TO VERIFY: login SSO real registrado; prontidão "operacional" na tela
```

```
BLOCKER: cadência de cron em minutos (webhooks, escalação de aprovação, governança)
WHY: o plano atual do Vercel executa cron diariamente
WHO MUST ACT: responsável pela plataforma
EXACT ACTION: agendar /api/jobs/* com CRON_SECRET a cada 1–5 min (plano Vercel adequado, pg_cron + pg_net, ou agendador externo)
WHAT IS READY: endpoints idempotentes com lease e fin_job_runs
HOW TO VERIFY: fin_job_runs na cadência configurada
```

```
BLOCKER: ambiente DEMO com Supabase próprio e produção com banco próprio
WHY: limite do plano Supabase e configuração de projetos fora do repositório
WHO MUST ACT: owner
EXACT ACTION: criar projetos dedicados e definir ARANDU_ENV/SUPABASE_* por projeto Vercel (docs/FINANCIAL_OWNER_ACTIONS.md)
WHAT IS READY: build e doctor por ambiente, guarda contra banco legado
HOW TO VERIFY: ARANDU_ENV=<env> npm run finance:pilot:doctor GO em cada ambiente
```

```
BLOCKER: proteção de branch no GitHub
WHY: não verificada nesta sessão (sem permissão de administração); não se afirma que está ativa
WHO MUST ACT: owner do repositório
EXACT ACTION: exigir os quatro checks (database, validate, presentation, deploy-boundaries) e PR para pilot e main
WHAT IS READY: CI com os quatro jobs
HOW TO VERIFY: Settings → Branches mostra as regras
```

Status de entrega: **code complete** e **CI validated** para o que entra por PR; **hosted validated** e **production ready** continuam dependentes dos blockers acima.

## P1.1 — implementação em andamento, 2026-10-04

Base viva: `pilot@0445e750525f7671e04fe1c482fd7e7cc88970b3`, PR #117 mergeada; run `37195610327` com os quatro jobs verdes. `main...pilot`: ahead 63, behind 0. Branch nova `feature/savings-value-realization`, sem PR empilhada. Novas fontes canônicas: `fin_value_records`, `fin_value_methodologies`, `fin_value_observations`. Graph, totais e busca contextual são projeções. Custos incomparáveis não recebem número; realização exige observação posterior ao baseline, período encerrado, cobertura completa, mesma moeda e verificação humana.

Local: domínio/API de valor passou; check:all hermético final passou (inclui domínio/API de valor, paridade registry/export, manifest e preflight); build passou, JS 435602/800000, maior chunk 82339/100000, sem aumento de thresholds. SBOM gerado (21 componentes); assets 30 páginas/232 referências, navegação 30 páginas e financial-surface/legacy-art passaram. SEO dist passou com ARANDU_SITE_URL de fixture igual ao CI (30 páginas, zero erros), sem claim de domínio real. npm ci/audit bloqueados por DNS de registry.npmjs.org. test:database não executou SQL: psql ausente. E2E tentou os cinco projetos, falhou na inicialização por executáveis Playwright ausentes; não constitui evidência de comportamento da UI. Nenhum gate externo foi marcado pronto.

CI da PR #118, primeiro HEAD `fda0c6be`, run `37207857787`: presentation passou; deploy-boundaries falhou por JS preview 812530/800000; database falhou por fixture com product credito em vez do catálogo credit; validate falhou no seletor exato de Título com indicador obrigatório. As causas foram corrigidas em lote, preservando testes/projetos/thresholds. Nova validação local: check:all hermético e vercel-build preview passaram, JS 798442/800000, maior chunk 88479/100000; E2E list 365 testes em nove arquivos. Sprite mantém exatamente os 42 glyphs originais; teste browser exige bbox positivo. Run corretivo `37210038487` em `e70ce5e`: deploy-boundaries passou; database avançou até a suíte histórica da instalação final e revelou duas assertions de compatibilidade sem o novo marker. Atualizadas para reconhecer a migration aditiva, mantendo a rejeição de markers desconhecidos; adicionados negativos de replay, precisão, escrita direta e freeze antes da revogação. Revisão de profundidade adicionou filtro de categoria com paridade lista/totais, metodologia própria contrafactual de custo evitado (sem claim de caixa) e metodologia observada de realização; negativos de provedor e invalidação em cascata. Run `37210272796` em `e0775164`: database e deploy-boundaries passaram; navegadores ainda em execução nesse HEAD. Revisão final local passou check:all e preview vercel-build, JS 798701/800000 (maior chunk 88479/100000). CI do lote final continua pendente; nenhum merge autorizado por gates da base ou do HEAD anterior.

BLOCKER: validação local de banco/browser e dependências novas.
WHY: este executor não tem psql nem browsers e DNS de registry.npmjs.org não resolve.
WHO MUST ACT: executor com PostgreSQL e navegadores disponíveis; CI valida o lote em PR draft.
EXACT ACTION: executar npm ci --include=optional, gates completos e testes SQL clean/upgrade/reapply/rollback, todos os projetos Playwright; corrigir qualquer falha antes do merge.
WHAT IS READY: implementação, migration aditiva, rollback fail-closed, canário, testes negativos e documentação nesta branch.
HOW TO VERIFY: quatro jobs obrigatórios no SHA exato da PR, sem falhas, além de revisão do diff e evidência local declarada.

BLOCKER: rollout do Pilot hospedado.
WHY: não foi disponibilizado acesso autenticado ao banco/ambiente, backup e restore drill verificáveis.
WHO MUST ACT: owner do ambiente e operador autorizado.
EXACT ACTION: confirmar projeto e markers vivos; backup; restore em alvo descartável; comparação pós-restore; gerar bundle exato após marker observado; doctor e canário; jornada autenticada. Para decommission com dados, export verificado e reconhecimento export-verified:<ref> são obrigatórios.
WHAT IS READY: manifest, bundle determinístico, doctor e canário incluindo financial-value-realization-1; não houve aplicação hospedada.
HOW TO VERIFY: docs/FINANCIAL_PILOT_GO_LIVE.md e evidência datada dos comandos, checks e jornada no ambiente correto.


## P1.1 pós-merge — reconciliação da #118, 2026-10-04

A #118 foi mergeada em `pilot` (`d0d5deb`) com `validate` e `presentation` ainda em execução no HEAD final `f4b78a2`. Resultado final do run `37210594484` nesse SHA: `database` success, `deploy-boundaries` success, **`validate` failure**, **`presentation` failure**. P1.1, portanto, **não** estava CI validated; P1.2 não foi iniciada sobre essa base.

Causas raiz (reproduzidas localmente com Chromium antes de corrigir):

- `presentation` (chromium/firefox/webkit desktop, `demo-workspace-next` "tema escuro sem vazamento"): o `h1` saía com `--text` claro (`#101828`) sobre fundo escuro. A #118 desligou `modulePreload` para caber no orçamento de JS; com isso o Vite passou a emitir o CSS da demo (`boot-*.css`, de `finance/demo/experience.css`) antes de `finance/style.css`. Os aliases de token da demo ficavam em `.dw{}` e os do produto em `:root{}` — mesma especificidade — e a ordem passou a decidir. Correção: os três blocos-base da demo passam a `html.dw{}` (0-1-1), tornando a precedência independente da ordem de carregamento; relação com os seletores de atributo (`.dw[data-theme=dark]`, 0-2-0) inalterada. Restaurar o `modulePreload` padrão também corrigia, mas estourava o orçamento (804.226/800.000); preload só de CSS não corrigia (o problema é ordem, não ausência).
- `validate` (mobile-chrome, mobile-safari, `finance-value`): o teste do sprite media o primeiro `svg.icon use` do DOM, que no celular está na barra lateral oculta (bbox 0). No mesmo celular, os ícones visíveis (topbar, tabbar, estado vazio) desenham com bbox 16–18. O produto estava correto; o teste passa a medir o primeiro ícone **visível**, com a mesma asserção (bbox > 0).
- `presentation` também registrou um *flaky* em webkit-desktop (`demo-workspace-v2` aria-expanded após Escape) que passou no retry; não é causa da falha do job e não foi alterado.

Sem aumento de orçamento, threshold, retry ou skip; nenhum navegador ou assertion removido. Orçamento preview inalterado: JS 798.701/800.000 (maior chunk 88.479/100.000); produção 426.641.

Trava de governança nova: `lib/merge-gates.mjs` + `npm run merge:gates -- <PR>` exigem os quatro jobs concluídos com sucesso no SHA exato do HEAD da PR (pending/in_progress/falha/cancelado/skip/ausente/run de outro SHA bloqueiam), testado em `check:governance` (`scripts/test-merge-gates.mjs`, inclui o cenário exato da #118). Template de PR e CONTRIBUTING exigem a verificação. Branch protection: `pilot` e `main` observadas com `protected=false` via API nesta sessão; sem permissão administrativa, permanece BLOCKER em `docs/BRANCH_PROTECTION.md`.

Status P1.1: code complete; **CI validated** pela #119 — run `37212668535` no HEAD exato `189bc9d`: `database`, `deploy-boundaries`, `validate` e `presentation` success; mergeada em `pilot@1016b0f` com `expectedHeadSha`. Hosted validated e production ready pendentes (BLOCKER de rollout acima).
## P1.2 Bank Fee Intelligence — 2026-10-04

Branch `feature/bank-fee-intelligence`, criada da `pilot` só depois de reconciliar a #118 (P1.2 não foi construída sobre base com CI vermelho; a branch recebe a `pilot` com a correção da #119 antes do PR). Migration aditiva `financial-fee-intelligence-1` após `financial-value-realization-1`.

Orçamento de JS: a primeira versão da tela levou o preview a 817.209/800.000. Em vez de relaxar o orçamento, a interface de registros factuais passou a ser **composta no servidor** (apresentadores `lib/finance/fee-presenter.mjs` e `lib/finance/value-presenter.mjs`) e desenhada por um renderer genérico (`finance/src/views/ledger.js` + `formDrawer` em `ui.js`); a tela de Valor (P1.1) foi migrada para o mesmo renderer, mantendo rótulos e textos. Preview com P1.2: 795.717/800.000 — menor que a baseline anterior sem P1.2 (798.701). Produção sem demo: ver PR. Os E2E de Valor e Tarifas usam o apresentador real nos mocks, então a cópia vista pelo usuário segue testada no navegador; a linguagem segura é testada também em Node sobre a saída do apresentador.

Local (este executor): `test:database` verde (clean com a suíte nova, upgrade com rollback + reaplicação dupla + suíte, fresh com todas as suítes, canário, probes); `check:all` verde; prova negativa do gate de governança (tabela de tarifa fora do registry falha). E2E Chromium desktop + mobile: tarifas 8/8, valor 7/8 antes de receber a correção da #119 (o restante é exatamente o teste de sprite corrigido lá). Firefox/WebKit só no CI.

Status P1.2: code complete; **CI validated** pela #120 — run `37214713845` no HEAD exato `e889aff`: `database`, `deploy-boundaries`, `validate` e `presentation` success (verificados antes do merge); mergeada em `pilot@4f97e16` com `expectedHeadSha`. `mergeable_state=unstable` no momento do merge refletia apenas o status externo do Vercel (cota diária de deploys), que não é gate obrigatório. Hosted validated e production ready pendentes (BLOCKER de rollout).

## P1.3 Opportunity Engine — 2026-10-04

Branch `feature/opportunity-engine`, criada da `pilot` só depois do merge da #120 (P1.2 CI validated); não empilha sobre branch não mergeada. Migration aditiva `financial-opportunity-engine-1` após `financial-fee-intelligence-1`; inclui o job `opportunities` nas listas do P0.10 e roda na cron diária com lease/fencing. Worklist composta no servidor (`lib/finance/opportunity-presenter.mjs`) e desenhada pelo renderer genérico, mantendo o orçamento de JS sem alterá-lo. Regras com limiar financeiro (concentração, utilização, propostas, exceções, sourcing) não têm padrão: só existem quando a empresa as configura. Detalhes em `docs/FINANCIAL_OPPORTUNITY_ENGINE.md`.

Status P1.3: code complete na branch; CI validated só quando os quatro gates passarem no HEAD exato da PR; hosted validated e production ready pendentes (BLOCKER de rollout).

## Value Intelligence executivo — 2026-10-04

Branch `feature/value-intelligence-executive`, PR pequena e separada, criada da `pilot` depois do merge de P1.3. Seção no Painel sobre os resumos existentes de P1.1/P1.2/P1.3; nenhuma tabela, migration ou RPC nova. Não é P1.7. Preview JS 798.135/800.000 com orçamento inalterado — margem curta: a próxima interface precisa vir acompanhada de redução de bundle (candidatos: migrar outras telas factuais para o renderer genérico).

Status: code complete na branch; CI validated só com os quatro gates no HEAD exato; hosted validated e production ready pendentes (rollout de P1.1–P1.3).

Avaliação de P1.4 (Proposal & Document Intelligence) nesta rodada: **não iniciada**. Uma vertical robusta exige provedor de extração (IA/OCR) com contrato, minimização de dados e avaliação de erro — inexistente no ambiente e sem decisão de produto registrada — e interface nova, que hoje caberia só com redução prévia de bundle (margem de ~1,9 kB no preview). Começar sem esses pré-requisitos produziria extração inventada ou tela fora do orçamento; fica como próxima prioridade com esses pré-requisitos explícitos.
