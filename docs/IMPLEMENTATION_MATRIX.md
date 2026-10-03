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
| P0.1-01 | §38.3, Add. H.1 | Demo/Pilot/Production por configuração, mesma árvore | P0 | — | partial | `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`, `scripts/vercel-build.mjs`, `scripts/check-finance-env.mjs`, `lib/demo-mode.mjs`, `lib/legacy-surface.mjs` | Supabase DEMO não existe (limite Free 2 projetos); produção sem `ARANDU_ENV=production` nem banco próprio (`ARANDU_CURRENT_STATE_2026-10-02.md`) | demo/prod mal configurados | Owner: criar Supabase DEMO/PROD, setar env (ver lista de blockers) | — |
| P0.1-02 | §38.4 | Manifesto de migrations, clean install, upgrade, reapply, rollback | P0 | — | implemented | `docs/supabase-migrations.json`, `scripts/check-migrations.mjs`, `scripts/test-database.sh` (clean+upgrade+reapply+rollback), `docs/rollback/*` | — (cada migration nova deve repetir o padrão) | migration fora do manifesto | manter | — |
| P0.1-03 | §38.4, Add. E.6 | Migrations aplicadas no Pilot hospedado | P0 | P0.1-02 | blocked | Pilot em `financial-surface-hardening-1` (02/10); bundle `npm run migrations:bundle -- --after-schema` | sem credencial administrativa do Supabase nesta sessão; restore drill hospedado é pré-condição | piloto atrás do código | Owner aplica bundle após backup+drill | — |
| P0.1-04 | §38.1–38.2, Add. G.3 | Branch protection/rulesets em `main` e `pilot` | P0 | — | blocked | `docs/FINANCIAL_REPO_GOVERNANCE.md` (403 da integração); `scripts/check-governance.mjs` | permissão administrativa ausente | merge com CI vermelho | Owner configura Settings → Branches/Rulesets; ver `FINANCIAL_REPO_GOVERNANCE.md` | — |
| P0.1-05 | Add. E.1 | Restore drill local e procedimento hospedado | P0 | — | partial | `scripts/pilot-restore-drill.sh`, `scripts/pilot-backup-preflight.mjs`, `ops/sql/post-restore-probes.sql`, `docs/FINANCIAL_PILOT_PASSPORT_ROLLOUT.md` | drill hospedado nunca executado (sem DB URL) | backup ≠ restore | Owner roda `pilot:restore:drill` com `PILOT_SOURCE_DATABASE_URL` | — |
| P0.1-06 | §38, Add. E.6 | Doctor, canary e env check | P0 | — | implemented | `scripts/finance-pilot-doctor.mjs`, `lib/finance/pilot-doctor.mjs` (espera `financial-multi-entity-1`), `scripts/pilot-canary.sh`, `ops/sql/pilot-isolation-canary.sql` (inclui isolamento por entidade), `scripts/test-pilot-doctor.mjs` | marcador esperado precisa acompanhar cada migration | GO falso | manter a cada migration | PR multi-entity |
| P0.1-07 | Add. E.4 | Incident severity model, runbook, postmortem template | P0 | — | partial | `docs/FINANCIAL_PILOT_PLAYBOOK.md`, `docs/FINANCIAL_PILOT_SUPPORT.md`, `docs/INCIDENT_BACKUP_OBSERVABILITY_RUNBOOK.md` (legado arte) | sem modelo de severidade financeiro canônico, sem template de postmortem, sem matriz de dependências | resposta improvisada | ver P0.10 | — |

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
| P0.2-09 | §11 | Aprovação cruzada / group treasury approval por policy | P0 | P0.2, P0.7 | missing | aprovador de qualquer entidade com escopo pode ser escolhido; não há regra de alçada | — | alçada sem regra | P0.7 | — |

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
| P0.7-01 | §27 | Aprovação sequencial com snapshot, stale detection, segregação solicitante ≠ aprovador | P0 | — | implemented | `docs/supabase-financial-enterprise-approvals.sql`, `docs/supabase-financial-approval-handoff.sql`, `tests/database/financial-enterprise-approvals.sql`, `/finance/approvals.html` | — | — | — | — |
| P0.7-02 | §27 | Policies por valor/categoria/entidade/N propostas/provedor novo/garantia/covenant/prazo, versionadas, global vs local, snapshot no processo | P0 | P0.2 | missing | só flag `required_for_decision` por organização | — | policy mutar processo antigo | Policy v2 | — |
| P0.7-03 | §27 | Escalonamento, prazos de aprovação, justificativa de exceção, group treasury approval | P0 | P0.7-02 | missing | — | — | — | idem | — |

### P0.8 — Public API & Webhooks Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.8-01 | §31.1 | API versionada com service accounts/API keys, scopes, tenant/entity auth, paginação, rate limit, idempotency, audit | P0 | P0.2 | missing | API interna de sessão `/api/finance/*` | — | abuso/vazamento | API foundation | — |
| P0.8-02 | §31.1 | Webhooks: registro, assinatura HMAC, replay protection, retries, delivery log, dead-letter | P0 | P0.8-01 | missing | outbox de e-mail existe (`lib/email-outbox.mjs`) como padrão reaproveitável | — | webhook forjado | idem | — |
| P0.8-03 | §31.1 | Docs, versioning e deprecation policy | P0 | P0.8-01 | missing | — | — | — | idem | — |

### P0.9 — Enterprise IAM / SSO Foundation

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.9-01 | §33 | MFA para operador da plataforma | P0 | — | implemented | `lib/finance/ops-access.mjs`, `scripts/finance-operator-mfa.mjs` | MFA de usuários de cliente por policy não existe | — | P0.9-02 | — |
| P0.9-02 | §33, Add. F.1 | Abstração SAML/OIDC, mapeamento domínio→organização, session policy, readiness | P0 | P0.2 | missing | — | IdP real exige tenant externo | SSO "funcionando" sem prova | foundation + readiness; integração real = blocked | — |

### P0.10 — Operational Resilience

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.10-01 | Add. E.1 | Backup preflight, restore drill, probes pós-restore | P0 | — | partial | ver P0.1-05 | hospedado | — | owner | — |
| P0.10-02 | Add. E.4 | Severidade, incident runbook, postmortem, dependency failure modes, RPO/RTO honestos | P0 | — | partial | ver P0.1-07 | — | claim sem prova | runbook canônico | — |
| P0.10-03 | Add. E.5 | Health, request IDs, job runs, outbox retry/backoff | P0 | — | implemented | `/api/health`, `X-Request-ID`, `fin_job_runs`, `lib/email-outbox.mjs`, `scripts/test-observability.mjs` | métricas de webhook/integração inexistentes (dependem de P0.8) | — | P0.8 | — |

### P0.11 — Data Governance Baseline

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P0.11-01 | Add. D.1–D.2 | Classificação e minimização documentadas | P0 | — | partial | `docs/FINANCIAL_DATA_CLASSIFICATION.md` | não cobre tabelas novas; sem metadado de classificação consultável | — | atualizar a cada módulo | — |
| P0.11-02 | Add. D.4–D.5 | Retenção, legal hold, export, offboarding de tenant, revogação de integrações | P0 | P0.8 | missing | export factual por RFQ (`GET /api/finance/export`) | — | exclusão descrita como total sem ser | governance foundation | — |
| P0.11-03 | Add. D.6 | Superfície de subprocessadores e readiness jurídica | P0 | — | blocked | `docs/FINANCIAL_LEGAL_REVIEW_REQUIRED.md` | parecer jurídico | claim LGPD | owner/jurídico | — |

---

## P1 — Recorrência, ROI e diferenciação

| ID | Guideline | Capability | Pri | Dependency | Status | Evidence | Gaps | Risk | Next action | PR/commit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1.1 | §19 | Savings & Value Realization Ledger | P1 | P0.4, P0.2 | missing | painel expõe `savings: null` | — | savings inventado | após PR contratos | — |
| P1.2 | §17 | Bank Fee Intelligence | P1 | P0.4, P0.5 | missing | — | — | falso positivo | — | — |
| P1.3 | §18 | Opportunity Engine determinístico | P1 | P0.4–P0.6 | missing | — | — | virar recomendação | — | — |
| P1.4 | §23 | Proposal & Document Intelligence | P1 | docs privados | missing | upload privado existe (`fin_private_documents`) | extração exige provedor de IA/OCR | extração errada | foundation com confirmação humana | — |
| P1.5 | §33, Add. F.2 | SCIM / JIT / access reviews / service accounts | P1 | P0.9 | missing | — | — | misconfiguration | — | — |
| P1.6 | §26 | Executive Portfolio | P1 | P0.4–P0.6 | partial | `/finance/dashboard.html` (pipeline, tarefas, prazos, consolidado por entidade), `/finance/portfolio.html` (dívida, limites, concentração, garantias) | sem fees, savings, opportunities, cycle times numa visão executiva única | dashboard sem ação | após P1.1–P1.3 | — |
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
