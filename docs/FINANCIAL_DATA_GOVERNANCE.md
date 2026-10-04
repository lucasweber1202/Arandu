# Governança de dados — Financial Procurement (P0.11)

> **LEGAL_REVIEW_REQUIRED.** Este documento descreve o que o software faz. Não é
> parecer jurídico, não afirma conformidade com a LGPD nem com contrato de
> tratamento (DPA) e não define prazo legal ou fiscal de retenção. O que existe é
> uma **fundação de prontidão** (export, retenção, semântica de exclusão,
> minimização, trilha) para a revisão jurídica externa usar.

Objetivo: saber quais dados existem, por que existem, quem os acessa, quanto
tempo ficam, como são exportados e como saem — sem `delete cascade`, sem prazo
inventado e sem apagar evidência por rotina.

## Onde vive

| Peça | Arquivo |
| --- | --- |
| Registro canônico (classificação, system of record, retenção, exclusão, export, hold, dono) | `lib/finance/data-governance.mjs` |
| Banco: políticas, hold, export, offboarding, trilha, executor | `docs/supabase-financial-data-governance.sql` (marker `financial-data-governance-1`) |
| Rollback (só sem uso) | `docs/rollback/supabase-financial-data-governance.rollback.sql` |
| API (admin da compradora) | `lib/api/domains/finance-governance.mjs` → `/api/finance/governance/*` |
| Job | `/api/jobs/governance` (`lib/api/domains/finance-jobs.mjs`, cron diário em `vercel.json`) |
| Interface | Configurações → Governança de dados (`finance/src/views/governance.js`) e card no console operacional |
| Testes | `scripts/test-finance-data-governance.mjs`, `tests/database/financial-data-governance.sql`, `tests/database/governance-concurrency.sh`, `tests/e2e/finance-governance.spec.js` |

`scripts/test-finance-data-governance.mjs` falha se uma tabela `fin_*` criada por
migration não estiver no registro, se o registro citar tabela inexistente, se os
conjuntos do export, o catálogo de retenção ou os estados do offboarding
divergirem entre JS e SQL. Toda tabela nova nasce classificada — inclusive as de
P1 (Savings, Fees, Opportunity, Document Intelligence).

## Classificação

Taxonomia única (substitui baixa/média/alta de `FINANCIAL_DATA_CLASSIFICATION.md`):

| Classe | Uso |
| --- | --- |
| `PUBLIC` | publicável |
| `INTERNAL` | operação do produto, sem dado sensível do cliente |
| `CONFIDENTIAL` | dado corporativo do cliente |
| `FINANCIAL_SENSITIVE` | condições, valores, contratos, dívida, decisões |
| `PERSONAL_DATA` | nome/e-mail/telefone corporativos, identificador de pessoa |
| `SECURITY_SENSITIVE` | trilha/configuração de segurança |
| `CREDENTIAL_MATERIAL` | hash de token, segredo cifrado, lease — nunca exportado, nunca logado |
| `AUDIT_EVIDENCE` | registro imutável de quem fez o quê |

O detalhe por tabela está no registro (fonte única; não duplicar aqui).

## Source of truth

| Capacidade | System of record |
| --- | --- |
| Financial Passport | `fin_company_profiles` (+ histórico; a RFQ congela em `fin_rfq_profile_snapshots`) |
| Demanda da RFQ | `fin_rfqs.demand` por revisão em `fin_rfq_revisions` |
| Proposta | `fin_proposal_versions` |
| Decisão | `fin_decisions.snapshot` |
| Termos de contrato | `fin_contract_versions` (+ aditivos) |
| Saldo de facility | `fin_facility_balances` |
| Policy de aprovação | `fin_policy_versions` |
| Execução de aprovação | `fin_approval_requests.policy_snapshot` + etapas/passos |
| Relacionamento com provedor | `fin_provider_relationships/contacts/issues/reviews` |
| Credenciais de API | `fin_service_accounts` + `fin_api_credentials` (só hash) |
| SSO | `fin_sso_connections` + `fin_sso_domains` |
| Trilha | `fin_events` |

Financial Graph, busca e painéis são **derivados**: nunca fonte, nunca exportados
como verdade própria.

Fatos de tarifa (P1.2) — `fin_fee_schedules`, `fin_fee_schedule_versions`, `fin_fee_observations`, `fin_fee_variances`, `fin_fee_reviews` — são system of record próprios, imutáveis, exportados como `fee_*`, contados na prévia de exclusão e protegidos por legal hold (`docs/FINANCIAL_FEE_INTELLIGENCE.md`).

## Semântica de exclusão

| Semântica | Significado |
| --- | --- |
| `immutable` | não é apagado nem editado por ação cotidiana (decisões, versões de contrato, snapshots de aprovação, trilha) |
| `archive` | arquivamento lógico; a linha continua |
| `revoke` | revogação com data/ator; a linha continua |
| `anonymize` | campos pessoais substituídos; linha e trilha continuam |
| `retention_expiry` | apagado em lote pelo executor, após política ativa (ou prazo técnico de sistema) |
| `replace` | sobrescrito pelo próprio fluxo (rascunho/configuração) |
| `tenant_offboarding` | só sai pelo offboarding controlado |

Excluir na interface **não** é eliminação de todas as cópias: backups do
provedor de banco seguem a política dele e não são tocados pelo produto.

## Retenção

- Só classes técnicas são automatizáveis: `TEMPORARY_OPERATIONAL` (avisos),
  `WEBHOOK_DELIVERY` (entregas encerradas), `SECURITY_EVENT` (login SSO),
  `CONTACT_PII` (anonimiza e-mail de convites encerrados) — por organização;
  `PLATFORM_TELEMETRY` e `PLATFORM_SECURITY_TRAIL` — plataforma, só operador
  `finance_ops` com MFA.
- **Nenhuma classe tem prazo padrão.** Os limites (ex.: 30–3.650 dias; 365 para
  eventos de segurança) são pisos/tetos técnicos contra configuração insegura,
  não prazos jurídicos. A política nasce rascunho, com motivo e referência da
  decisão; ativar cria nova versão vigente e substitui a anterior.
- Registros de negócio, financeiros, de auditoria e documentos **não** são
  alcançados pelo executor.
- Sistema: cópias de export vencem em 7 dias; chaves de idempotência da API em
  24 h (já existentes).
- Executor `fin_governance_retention_run`: lote limitado (≤ 1.000 por classe e
  execução), `for update skip locked`, lock exclusivo (segunda execução real
  falha como `job busy`), rerun idempotente por data de corte, prévia (`dry_run`)
  com contagens e sem conteúdo. Admin só faz prévia da própria organização;
  apagar é exclusivo do job (service role).
- Evidência: `fin_governance_log` (classe, política, versão, contagem, request
  do job, horário) e `fin_events` `retention_purged`. Nunca o dado apagado.

## Legal hold

`fin_legal_holds`: escopo `organization`, `retention_class`, `legal_entity`,
`rfq`, `contract` ou `provider` (objeto validado no próprio tenant), motivo sem
dado pessoal, referência externa, criação/liberação com ator e data. Só admin da
compradora cria e libera; provedor, outro tenant e demais papéis não leem nem
operam (RLS + RPC). Liberação repetida devolve `false` sem alterar nada.

Efeito (conservador): qualquer hold ativo suspende toda a retenção configurável
da organização; hold de classe suspende só a classe; qualquer hold impede que o
offboarding avance para `scheduled_for_deletion` e o fechamento.

## Export portável

- Pedido por admin do grupo (escopo de entidade, viewer, analista, provedor e
  outro tenant recusados), idempotente (um pedido aberto por organização).
- Montado em segundo plano pelo job (`fin_governance_build_export`), numa
  subtransação: falha nunca deixa `ready` nem parte órfã; vira `failed` com
  código. Teto de 64 MB por conjunto (memória do job; acima disso o export
  falha com `export_too_large`), desde `financial-p0-closure-1` (antes, 4 MB).
- Formato: `manifest` (`format`, `format_version`, `schema_version`,
  `generated_at`, organização, finalidade, conjuntos com linhas, bytes e
  `sha256`, lista do que foi excluído) + `data/<conjunto>.json`. O checksum é
  sobre os bytes UTF-8 de cada parte; a parte individual
  (`GET /api/finance/governance/export-download?export_id=…&dataset=…`) é
  devolvida intacta para verificação. O pacote único é servido até 4 MB (corpo
  máximo da função). Acima disso: `&manifest=1` devolve só o manifesto e
  `&dataset=…&offset=N` devolve faixas de até 4 MB (`content`, `total_chars`,
  `next_offset`) via `fin_governance_export_part_range`, com as mesmas checagens
  (admin atual, pronto, não vencido); a interface remonta as faixas e só salva
  o arquivo se o sha256 do manifesto conferir.
- 50 conjuntos: organização, entidades, membros (sem e-mail), escopos, Passport
  e histórico, RFQs, revisões, snapshots, convites, propostas e versões,
  decisões, contratos/versões/aditivos/marcos, provedores e relacionamento,
  facilities/saldos/cronogramas/histórico, garantias, policies/versões/flags,
  aprovações/etapas/passos/exceções/delegações, tarefas, comentários, trilha,
  metadados de documentos, contas de serviço, webhooks, SSO, políticas e holds.
- Fora do export: hashes de token, segredos de webhook, hash de verificação de
  domínio, caminhos internos de storage, leases, avisos e rascunhos, binários de
  documentos.
- Download: só admin atual, export `ready` e não vencido; cada download gera
  `export_downloaded`. Admin revogado e export vencido recebem recusa.

## Offboarding

Estados: `requested → export_pending → export_ready → access_revocation →
retention_window → scheduled_for_deletion → closed`, e `cancelled`.

| Transição | Quem |
| --- | --- |
| pedido (idempotente) | admin da compradora |
| `request_export` | admin (de `requested`, ou de `export_pending` com export falho/vencido) |
| `export_pending → export_ready` | job, quando o export fica pronto |
| `confirm_revocation` | admin, de `export_ready` (ou de `requested` com `export_waived`), com janela 0–3.650 dias e referência da decisão; confirmação explícita na interface |
| `access_revocation → retention_window` | mesma transação da revogação |
| `retention_window → scheduled_for_deletion` | job, vencida a janela e sem hold |
| `scheduled_for_deletion → closed` | operador `finance_ops` com MFA, com evidência, **só sem hold e sem nenhuma linha remanescente do tenant** |
| `cancel` | admin até `export_ready`; operador em `retention_window`/`scheduled_for_deletion` |

Revogação (`fin_governance_revoke_org_access`, idempotente, contagens acumuladas):
credenciais de API e contas de serviço revogadas; webhooks desativados
(`tenant_offboarding`) e entregas pendentes canceladas; conexões SSO
desativadas com `sessions_valid_after = now()`; convites de membro expirados;
convites de RFQ pendentes revogados; vínculos de membro arquivados em
`fin_offboarding_member_archive` (sem e-mail/nome) e removidos. A partir daí o
RLS nega tudo a quem era membro; novos vínculos são recusados e avisos novos
descartados para a organização. JWT emitido continua válido até expirar, mas não
alcança nada do tenant.

Nada de negócio é apagado no offboarding até aqui. A organização, a trilha e os
registros continuam durante a janela.

## Operação (runbook curto)

- Job: `GET /api/jobs/governance` com `Authorization: Bearer $CRON_SECRET`;
  roda `retention`, `data_exports` e `offboarding`, cada um com lease em
  `fin_job_runs`. 200 = tudo ok; 202 = ocupado; 502 = alguma etapa falhou (as
  demais já commitadas continuam válidas; rerun retoma).
- Console operacional: card "Governança de dados" com contagens por estado.
- Política de plataforma (operador, JWT `finance_ops` + AAL2):
  `select public.fin_governance_save_retention_policy(null,'PLATFORM_TELEMETRY',<dias>,'<motivo>','<ref>')`
  e `fin_governance_activate_retention_policy(<id>)`.
- Prévia de exclusão do tenant: `select public.fin_governance_deletion_preview('<org>')`
  (contagens por conjunto, sem conteúdo).
- Fechar offboarding: `fin_governance_offboarding_close('<request>','<evidência>')`
  só passa com zero linhas remanescentes.

## Rollback e recuperação

- **Código:** reverter o merge remove API/UI/job; o banco continua íntegro.
- **Schema:** o rollback só é aceito sem nenhum estado de governança (nenhuma
  política, hold, export, offboarding, trilha ou job de governança). Com estado,
  recusa com `governance state exists: use forward-fix`.
- **Dados:** retenção e revogação não são desfeitas por rollback. Dado apagado
  pela retenção só volta de backup verificado; acesso revogado por offboarding
  volta apenas pelo procedimento manual a partir de
  `fin_offboarding_member_archive` (forward-fix, com registro).

## Lacunas e blockers (honestos)

- **Exclusão física do tenant não está implementada.** `closed` exige zero linhas
  remanescentes; o executor de purge por tabela, em ordem de dependência e em
  lotes, depende de decisão jurídica sobre retenção pós-contrato. Até lá, o
  offboarding para em `scheduled_for_deletion` (dados preservados, acesso
  revogado).
- Conjunto acima de 64 MB falha (`export_too_large`); acima disso, entrega por
  Storage com URL assinada continua como evolução.
- Documentos privados: o export traz metadados; os binários continuam no bucket
  privado `fin-documents` e são baixados pela rota existente com URL assinada.
- Offboarding de organização **provedora** não está coberto (só compradora).
- Prazos legais, base legal, DPA, subprocessadores e residência: revisão
  jurídica externa (`FINANCIAL_LEGAL_REVIEW_REQUIRED.md`).
- Hospedado: nada aplicado. Migration, job e cron dependem do rollout do piloto
  (`docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md`); código pronto ≠ hospedado pronto.
