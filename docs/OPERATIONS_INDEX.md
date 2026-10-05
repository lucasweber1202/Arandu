# Índice operacional canônico — Arandu

Ponto de entrada para operar o **Arandu Financial Procurement**. Quando um
documento divergir, vale este índice, nesta ordem.

## Direção estratégica e produto

- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` — **addendum normativo v2.1** para enterprise hardening. Enquanto existir, deve ser lido junto da guideline mestra e prevalece em conflito sobre target-state vs. escopo de rodada, Financial Graph, core vs. capacidades futuras, data governance, operational resilience, prioridades de API/identity e canonicality de branches.
- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` — **diretriz mestra normativa** para evolução de produto e engenharia: tese B2B/enterprise, princípios, limites, arquitetura futura, IA, integrações, roadmap, priorização e Definition of Done. Na `main`, sua versão pode temporariamente ficar atrás da estratégia aprovada em `pilot`; o addendum v2.1 existe justamente para impedir que isso gere direção obsoleta.
- `docs/FINANCIAL_PRODUCT_BOUNDARIES.md` — limites funcionais/regulatórios do produto atual; prevalece para o que o software pode ou não afirmar/fazer nesta fase.
- Documentos técnicos especializados abaixo governam a implementação concreta sem contradizer a direção estratégica acima sem decisão explícita e atualização documental.

**Regra temporária de consolidação:** guideline mestra + addendum v2.1 = guideline estratégica efetiva. Quando a v2.1 for incorporada integralmente no arquivo mestre, o addendum e suas referências devem ser removidos no mesmo PR para voltar a uma única fonte estratégica.

## Financial Procurement (produto atual)

- `docs/FINANCIAL_PILOT_RELEASE_GATE.md` — gate binário de comprovantes hospedados, SHA, freshness, restore, cronologia e jornada.
- `docs/FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md` — reconciliação viva e NO-GO atual do Pilot (baseline, gates, ambientes, ações externas).
- `docs/FINANCIAL_RELEASE_EVIDENCE_2026-10-04.md` — histórico: observações hospedadas (schema, bucket, Vercel) de 04/10.
- `docs/FIRST_CUSTOMER_PILOT_CHECKLIST.md` — configuração, dados, suporte e critérios de primeiro cliente.
- `docs/FINANCIAL_PILOT_GO_LIVE.md` — checklist única de go-live do piloto, com estado por item.
- `docs/FINANCIAL_OWNER_ACTIONS.md` — o que só o proprietário pode fazer.
- `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md` — três ambientes (demo, pilot, production), `feature/* → pilot → main`, hotfix e rollback.
- `docs/FINANCIAL_PILOT_ENVIRONMENT.md` — variáveis, Supabase do piloto, backups.
- `docs/FINANCIAL_PILOT_OPERATIONS.md`, `docs/FINANCIAL_PILOT_SUPPORT.md`, `docs/FINANCIAL_PILOT_PLAYBOOK.md` — operação, suporte e incidentes.
- `docs/demo/README.md` — demo canônica: produto real com Supabase DEMO dedicado e Vitta Foods fictícia.
- `docs/FINANCIAL_DEMO_MODE.md` — sandbox público temporário sem backend, preservado até a demo canônica ser comprovada.
- `docs/FINANCIAL_SECURITY_MODEL.md`, `docs/FINANCIAL_THREAT_MODEL.md`, `docs/FINANCIAL_AUTHORIZATION_MAP.md` — segurança.
- `docs/FINANCIAL_REPO_GOVERNANCE.md` — proteção de branches e checks obrigatórios.
- `docs/supabase-migrations.json` — ordem canônica das migrations; consulte o manifesto atual. A migration P1.1 grava `schema_version = financial-value-realization-1` após `financial-p0-closure-1`; a P1.2 grava `financial-fee-intelligence-1` e a P1.3 `financial-opportunity-engine-1` em seguida. A aposentadoria destrutiva anterior continua sujeita ao procedimento de `docs/LEGACY_ART_RETIREMENT.md`; a ordem do manifest não autoriza aplicação hospedada.
- `docs/FINANCIAL_GRAPH.md` — Financial Graph relacional (camada de consulta autorizada, sem novo datastore).
- `docs/FINANCIAL_POLICY_ENGINE.md` — Policy & Approval Engine v2: policies versionadas por grupo/entidade, precedência, snapshot, SoD, exceções, delegação e prazos.
- `docs/FINANCIAL_PUBLIC_API.md` + `docs/openapi/arandu-public-api-v1.json` — Public API v1 e webhooks: autenticação de máquina, escopos, versionamento/deprecação, idempotência, assinatura e operação.
- `docs/FINANCIAL_SSO.md` — Enterprise SSO foundation: domínio verificado, broker Supabase (SAML), autorização fail-closed, exigência de SSO, sessão e revogação, prontidão, runbook e blockers.
- `docs/FINANCIAL_OPERATIONAL_RESILIENCE.md` + `docs/FINANCIAL_INCIDENT_POSTMORTEM.md` — severidade, incidentes, dependências, jobs/leases, DR e targets RPO/RTO não medidos.
- `docs/FINANCIAL_DATA_GOVERNANCE.md` + `lib/finance/data-governance.mjs` — Data Governance (P0.11): classificação por tabela, source of truth, retenção versionada, legal hold, export portável, offboarding com revogação, semântica de exclusão e lacunas.
- `docs/FINANCIAL_VALUE_REALIZATION.md` — P1.1: baseline, metodologia versionada, economia negociada/realizada e custo evitado, provenance, observação humana, rollout e rollback.
- `docs/FINANCIAL_VALUE_INTELLIGENCE_EXECUTIVE.md` — fatia de P1.6: valor, tarifas e oportunidades no Painel por moeda, entidade e período, com cobertura e links de ação; sem SoR novo.
- `docs/FINANCIAL_OPPORTUNITY_ENGINE.md` — P1.3: regras versionadas da empresa, oportunidades determinísticas com fatos congelados, dedupe/cooldown/expiração, job com lease, revisão humana, rascunho de RFQ com confirmação, Graph e governança.
- `docs/FINANCIAL_FEE_INTELLIGENCE.md` — P1.2: tarifa contratada versionada × cobrança observada, comparabilidade, proveniência, revisão humana com linguagem segura, Graph, governança, rollout e rollback.
- `docs/IMPLEMENTATION_MATRIX.md` — matriz viva guideline → capacidade, com status, evidência, lacunas e blockers; ponto de partida de qualquer rodada de implementação.
- Comandos: `finance:env:check`, `finance:pilot:doctor`, `pilot:canary`, `pilot:restore:drill`, `test:database`.

Estado hospedado observado em 02/10: [`ARANDU_CURRENT_STATE_2026-10-02.md`](ARANDU_CURRENT_STATE_2026-10-02.md). Não substitui gates nem guideline.

Evidências de rodada (históricas, datadas): `docs/FINANCIAL_RELEASE_EVIDENCE_*.md`.
Fechamento da Onda 0 em andamento: [`FINANCIAL_RELEASE_EVIDENCE_2026-10-01.md`](FINANCIAL_RELEASE_EVIDENCE_2026-10-01.md).

## Release, staging e migrations (plataforma)

- `npm run deploy:check` — gate de deploy técnico.
- `npm run release:status` / `npm run release:check` — frentes de go-live de produção (código, ambiente, evidências externas, domínio, plataforma e backup); falha enquanto houver frente bloqueada.
- `npm run predeploy` — gate final; o CI exige que ele continue falhando fechado.
- `ops/release-evidence.json` — gates externos de produção (migration, backup/restore, RLS, monitoramento, contato de privacidade, domínio). Alguns gates herdados nomeiam conceitos da vertical aposentada; nenhum é atendido por este repositório sem evidência real.
- `docs/STAGING_REHEARSAL.md` + `.github/workflows/staging-rehearsal.yml` — ensaio de staging sem segredos; `npm run check:staging` impede que ele aplique migrations ou altere gates.
- `docs/MIGRATION_RELEASE_RUNBOOK.md` — preflight, dry-run, aplicação, probes e canário.
- `docs/INCIDENT_BACKUP_OBSERVABILITY_RUNBOOK.md` — backup, restore, incidente e observabilidade.
- `docs/TRANSACTIONAL_EMAIL_OUTBOX.md` — outbox transacional usada pelos avisos financeiros.

Nunca aplique migration real sem backup referenciado e ambiente explicitamente identificado.

## Legado: vertical de arte (aposentada)

A antiga vertical de marketplace de arte foi aposentada e removida da árvore
atual. Contexto, inventário, o que permanece (migrations históricas, objetos de
banco até a migration de aposentadoria) e como recuperar algo pelo Git:
[`docs/LEGACY_ART_RETIREMENT.md`](LEGACY_ART_RETIREMENT.md). Não reintroduza
código, páginas ou documentos de arte a partir do histórico sem uma tarefa
explícita de recuperação.

## Governança do repositório

- `CONTRIBUTING.md` — branches, checks e PRs; inclui a exceção docs-only de canonicality da v2.1.
- `CLAUDE.md` — regras obrigatórias para agentes; exige leitura da guideline mestra, addendum v2.1 e boundaries.
- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` — hardening enterprise normativo e regra de consolidação.
- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` — direção estratégica base de produto e engenharia.
- `docs/FINANCIAL_REPO_GOVERNANCE.md` — proteção de `main` e `pilot` e checks obrigatórios (canônico).
- `docs/BRANCH_PROTECTION.md` — versão anterior das regras; vale o documento acima.
- `docs/REPOSITORY_HYGIENE.md` — limpeza de branches e documentos históricos.
- `docs/VERSIONING.md` — estratégia de versões.
- `SECURITY.md` — reporte privado de vulnerabilidades.
- `.github/CODEOWNERS` — responsáveis pelas superfícies críticas.

## Documentos históricos

Documentos com datas antigas ou termos como “pronto para uso”, “implementação” e “auditoria” podem registrar o estado de uma rodada anterior. Eles servem como histórico, não como autorização de lançamento.

Antes de seguir qualquer instrução histórica, confirme:

1. se ela aparece neste índice;
2. se o comando ainda existe em `package.json`;
3. se o gate correspondente possui evidência atual;
4. se a migration citada ainda está na ordem canônica.

- [Pilot Passport: backup, restore e rollout hospedado](FINANCIAL_PILOT_PASSPORT_ROLLOUT.md) — gates de recuperação e procedimento sem secrets.
