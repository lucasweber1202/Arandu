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

- `docs/FINANCIAL_PILOT_GO_LIVE.md` — checklist única de go-live do piloto, com estado por item.
- `docs/FINANCIAL_OWNER_ACTIONS.md` — o que só o proprietário pode fazer.
- `docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md` — três ambientes (demo, pilot, production), `feature/* → pilot → main`, hotfix e rollback.
- `docs/FINANCIAL_PILOT_ENVIRONMENT.md` — variáveis, Supabase do piloto, backups.
- `docs/FINANCIAL_PILOT_OPERATIONS.md`, `docs/FINANCIAL_PILOT_SUPPORT.md`, `docs/FINANCIAL_PILOT_PLAYBOOK.md` — operação, suporte e incidentes.
- `docs/demo/README.md` — demo canônica: produto real com Supabase DEMO dedicado e Vitta Foods fictícia.
- `docs/FINANCIAL_DEMO_MODE.md` — sandbox público temporário sem backend, preservado até a demo canônica ser comprovada.
- `docs/FINANCIAL_SECURITY_MODEL.md`, `docs/FINANCIAL_THREAT_MODEL.md`, `docs/FINANCIAL_AUTHORIZATION_MAP.md` — segurança.
- `docs/FINANCIAL_REPO_GOVERNANCE.md` — proteção de branches e checks obrigatórios.
- `docs/supabase-migrations.json` — ordem canônica das migrations; consulte o manifesto atual. A última migration desta baseline grava `schema_version = financial-public-api-1` (`docs/supabase-financial-public-api.sql`).
- `docs/FINANCIAL_GRAPH.md` — Financial Graph relacional (camada de consulta autorizada, sem novo datastore).
- `docs/FINANCIAL_POLICY_ENGINE.md` — Policy & Approval Engine v2: policies versionadas por grupo/entidade, precedência, snapshot, SoD, exceções, delegação e prazos.
- `docs/FINANCIAL_PUBLIC_API.md` + `docs/openapi/arandu-public-api-v1.json` — Public API v1 e webhooks: autenticação de máquina, escopos, versionamento/deprecação, idempotência, assinatura e operação.
- `docs/IMPLEMENTATION_MATRIX.md` — matriz viva guideline → capacidade, com status, evidência, lacunas e blockers; ponto de partida de qualquer rodada de implementação.
- Comandos: `finance:env:check`, `finance:pilot:doctor`, `pilot:canary`, `pilot:restore:drill`, `test:database`.

Estado hospedado observado em 02/10: [`ARANDU_CURRENT_STATE_2026-10-02.md`](ARANDU_CURRENT_STATE_2026-10-02.md). Não substitui gates nem guideline.

Evidências de rodada (históricas, datadas): `docs/FINANCIAL_RELEASE_EVIDENCE_*.md`.
Fechamento da Onda 0 em andamento: [`FINANCIAL_RELEASE_EVIDENCE_2026-10-01.md`](FINANCIAL_RELEASE_EVIDENCE_2026-10-01.md).

## Legado: vertical de arte

Tudo abaixo descreve a vertical de arte, aposentada (ver
`docs/LEGACY_ART_RETIREMENT.md`). Continua no repositório para auditoria e
porque o banco ainda carrega esse esquema; não é produto atual e não bloqueia o
piloto financeiro.

### Estado e decisão de release (arte)

- `ops/release-evidence.json` — fonte oficial dos 13 gates externos.
- `ops/pilot-evidence.json` — evidências do piloto fechado.
- `docs/RELEASE_CANDIDATE_1.md` — checklist da beta pública com catálogo e comércio fechados.
- `npm run deploy:check` — gate de deploy técnico e base do deploy da beta.
- `npm run release:status` — relatório legível do estado atual.
- `npm run release:check` — falha enquanto os requisitos mínimos não forem atingidos.
- `npm run predeploy` — gate do go-live comercial completo; não é requisito da beta.

### Preparação de staging (arte)

- `docs/STAGING_REHEARSAL.md` — ensaio manual e não destrutivo antes do staging real.
- `.github/workflows/staging-rehearsal.yml` — workflow `workflow_dispatch` sem segredos.
- `npm run check:staging` — impede que o rehearsal aplique migrations ou altere gates.
- `npm run staging:evidence` — gera relatório local classificado como simulação.

Um rehearsal verde comprova somente preparação técnica em CI. Ele não equivale a `staging_validated` e não altera `ops/release-evidence.json`.

### Banco e migrations (arte)

1. `docs/supabase-migrations.json` — ordem canônica.
2. `docs/TRANSACTIONS_RLS_RBAC.md` — modelo transacional, RLS, RBAC e auditoria.
3. `docs/MIGRATION_RELEASE_RUNBOOK.md` — preflight, dry-run, aplicação, probes e canário.
4. `docs/rollback/supabase-transactions-rbac-audit.rollback.sql` — rollback da camada transacional.
5. `docs/INCIDENT_BACKUP_OBSERVABILITY_RUNBOOK.md` — backup, restore, incidente e observabilidade.

Nunca aplique migration real sem backup referenciado e ambiente explicitamente identificado.

### Administração e segurança (arte)

- `docs/ADMIN_AUTH_MFA.md` — provisionamento, papéis, MFA e revogação.
- `docs/ADMIN_OPERACAO_ARANDU.md` — operação diária dos painéis.
- `docs/OPERATIONAL_STATUS_FLOW.md` — máquina de estados operacional, permissões por transição e trilha de histórico.
- `docs/PERFIS_E_PORTAIS.md` — perfis do público, capacidades verificadas e portais de artista e empresa.
- `docs/ARTWORK_STATUS.md` — matriz operacional das obras.
- `SECURITY.md` — reporte privado de vulnerabilidades.
- `.github/CODEOWNERS` — responsáveis pelas superfícies críticas.

### Catálogo (arte)

- `docs/GUIA_CADASTRO_OBRAS_REAIS.md` — campos e preparação do acervo.
- `docs/CHECKLIST_PARCEIRA_ARTISTA.md` — autorizações e parceria.
- `data/catalog-intake-template.csv` — modelo de intake.
- `npm run catalog:intake:validate` — validação do CSV.
- `npm run check:catalog:release` — gate do catálogo real.

Fixtures e demonstrações não contam como catálogo publicado.

### Política comercial (arte)

- `docs/OPERACAO_COMERCIAL_INDEX.md` — índice comercial.
- `docs/FLUXO_COMPRA_RESERVA.md` — jornada de seleção e reserva.
- `data/commercial-policy.json` — configuração pública não sensível e estado da política.
- `npm run check:commercial:release` — validação de completude e aprovação.

Decisões de comissão, pagamento, frete, seguro, devolução e modelo fiscal exigem aprovação humana.

### Beta, piloto, domínio e go-live (arte)

- `docs/GO_LIVE_ARANDU.md` — sequência de promoção.
- `docs/DEPLOY_DOMINIO_VERCEL.md` — domínio e hospedagem.
- `docs/SEO_DOMINIO_CHECKLIST.md` — indexação e SEO final.
- `docs/PRIMEIROS_30_DIAS.md` — operação inicial.
- `npm run check:pilot:release` — gate do piloto.
- `npm run check:domain:release` — gate do domínio.

## Governança do repositório

- `CONTRIBUTING.md` — branches, checks e PRs; inclui a exceção docs-only de canonicality da v2.1.
- `CLAUDE.md` — regras obrigatórias para agentes; exige leitura da guideline mestra, addendum v2.1 e boundaries.
- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES_V2_1_ADDENDUM.md` — hardening enterprise normativo e regra de consolidação.
- `docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md` — direção estratégica base de produto e engenharia.
- `docs/FINANCIAL_REPO_GOVERNANCE.md` — proteção de `main` e `pilot` e checks obrigatórios (canônico).
- `docs/BRANCH_PROTECTION.md` — versão anterior das regras; vale o documento acima.
- `docs/REPOSITORY_HYGIENE.md` — limpeza de branches e documentos históricos.
- `docs/VERSIONING.md` — estratégia de versões.

## Documentos históricos

Documentos com datas antigas ou termos como “pronto para uso”, “implementação” e “auditoria” podem registrar o estado de uma rodada anterior. Eles servem como histórico, não como autorização de lançamento.

Antes de seguir qualquer instrução histórica, confirme:

1. se ela aparece neste índice;
2. se o comando ainda existe em `package.json`;
3. se o gate correspondente possui evidência atual;
4. se a migration citada ainda está na ordem canônica.

- [Pilot Passport: backup, restore e rollout hospedado](FINANCIAL_PILOT_PASSPORT_ROLLOUT.md) — gates de recuperação e procedimento sem secrets.
