# Opportunity Engine v1 (P1.3)

Status: implementado em branch `feature/opportunity-engine`; CI e rollout hospedado conforme `IMPLEMENTATION_MATRIX.md`. O motor transforma fatos estruturados do Arandu em trabalho financeiro explicável. Uma oportunidade é **fato + regra versionada da empresa + fonte + data + ação possível + pessoa revisora**. Não é recomendação, ranking nem decisão: o Arandu nunca seleciona provedor, aprova crédito, aceita proposta, movimenta recursos, paga, contrata hedge, investe ou assina.

## Modelo

| Tabela | Papel |
| --- | --- |
| `fin_opportunity_rules` | Regras da empresa, versionadas e imutáveis (`rule_key`, `version`, `parameters`, `enabled`, `effective_at`, `created_by`, justificativa). Mudança = nova versão. Só `admin` altera. |
| `fin_opportunities` | Item de trabalho: organização, entidade, provedor, tipo, estado, regra e versão aplicadas (`rule_snapshot`), `facts_snapshot` (por que disparou, nunca reescrito exceto em reabertura registrada), `current_facts`, fonte (`source_object_type/id`), `fingerprint`, `opened_at`, `last_seen_at`, prazo, revisor, ação possível, `cooldown_until`, resolução, motivo de descarte, motivo de expiração, RFQ de rascunho vinculado. |
| `fin_opportunity_events` | Histórico imutável: aberta, reaberta (com fatos e motivo), expirada, ciente, revisão iniciada, ação registrada, descartada, rascunho de RFQ criado. |
| `fin_opportunity_scans` | Cursor operacional do job (organização menos recentemente avaliada primeiro). |

Catálogo, rótulos e textos: `fin_opportunity_rule_catalog()` (banco) e `lib/finance/opportunity-presenter.mjs` (interface composta no servidor, desenhada pelo renderer genérico `finance/src/views/ledger.js`).

## Regras v1 (só com dado confiável no schema)

| Regra | Fato | Parâmetros |
| --- | --- | --- |
| `contract_renewal` | contrato ativo/renovando dentro de `lead_days` antes da data de aviso (`ends_on − renewal_notice_days`, ambos do contrato) | `lead_days` (padrão operacional 30) |
| `repricing_window` | marco `repricing` agendado dentro do `lead_days` **do próprio marco** | — |
| `facility_maturity` | facility ativa vence em até `lead_days` | `lead_days` (120) |
| `guarantee_review` | garantia ativa termina em até `lead_days` | `lead_days` (60) |
| `passport_stale` | campos do Passport com `valid_until` em até `lead_days`, por escopo (grupo/entidade) | `lead_days` (30) |
| `facility_data_stale` | facility sem verificação há mais que o `review_after_days` **da própria facility** | — |
| `fee_variance_review` | diferença de tarifa em `new` há ao menos `min_age_days` (também por evento) | `min_age_days` (0) |
| `fee_resolution_value_review` | diferença confirmada por pessoa, acima da referência, resolvida → avaliar registro de valor | — |
| `value_realization_review` | economia negociada comparável, período encerrado há `grace_days`, sem realização | `grace_days` (30) |
| `proposal_count_below` | RFQ coletando/comparando com menos propostas que a política | `min_proposals` (**obrigatório, sem padrão**) |
| `provider_concentration` | participação do provedor nos limites aprovados de facilities ativas, por moeda, acima da política | `max_share_pct` (**obrigatório**) |
| `facility_utilization` | último saldo usado / limite aprovado acima da política | `max_utilization_pct` (**obrigatório**) |
| `approval_exception_frequency` | exceções de política (pedidas/aprovadas) na janela ≥ limite | `window_days`, `min_count` (**obrigatórios**) |
| `contract_without_sourcing` | contrato ativo há `lookback_months` sem RFQ do mesmo produto no período | `lookback_months` (**obrigatório**) |

Todas aceitam `cooldown_days` (30). **Nenhum threshold financeiro escondido**: limiares de concentração, utilização, propostas, exceções e sourcing não têm valor padrão — a regra só existe quando a empresa a configura. Janelas de data têm padrão operacional editável, mostrado no formulário e gravado explicitamente na versão; o motor só usa parâmetros gravados. Sem regra ativa, nada dispara.

## Determinismo, dedupe, cooldown e expiração

- Fingerprint = md5(organização | entidade | tipo | tipo da fonte | id da fonte | discriminador (moeda) | versão da regra). Execução repetida atualiza `last_seen_at` e `current_facts`; não duplica.
- Ação registrada ou descarte → `cooldown_until = agora + cooldown_days`. Reabre só se o cooldown expirou **ou** os fatos materiais mudaram (hash de fatos materiais, sem campos voláteis como "dias restantes"). A reabertura grava evento com os fatos novos e o motivo; o evento de abertura original permanece.
- Item ativo que deixa de ser produzido expira com motivo: `deadline_passed`, `condition_cleared`, `rule_disabled` ou `rule_superseded`. Nova versão de regra → nova oportunidade; a antiga expira como substituída; o snapshot histórico nunca muda.
- Estados humanos: `open → acknowledged | under_review | dismissed`; `acknowledged → under_review | acted | dismissed`; `under_review → acted | dismissed`. Estado esperado obrigatório; revisor precisa ser `admin`/`finance_manager` com acesso à entidade; em revisão, só o revisor ou um admin conclui; descarte exige motivo; "ação registrada" exige descrição do que uma pessoa fez.

## Execução

- **Job** (P0.10): `fin_run_opportunity_engine(dia, limite)` só pelo service role, chamado pela cron diária de `/api/jobs/renewals` como job `opportunities` com lease, fencing e `fin_job_runs`. Lote limitado de organizações, menos recentemente avaliadas primeiro; falha não perde trabalho commitado e o próximo run retoma. Organização em offboarding não é avaliada.
- **Evento**: inserir ou revisar uma diferença de tarifa reavalia só as regras de tarifa daquela organização, na mesma transação.
- Nenhum request de usuário faz varredura: a interface só lê.

## Oportunidade → RFQ

Para oportunidades com fonte em contrato ou marco contratual, uma pessoa pode pedir "Criar rascunho de RFQ" com confirmação explícita. O banco cria só um rascunho com a demanda do contrato (`fin_start_contract_rfq`); nenhum convite é enviado, nada é aberto ao mercado. O vínculo e o evento ficam na oportunidade; marcar "ação registrada" continua humano.

## Savings e tarifas

`fee_variance_review` pede revisão humana de uma diferença; nunca rotula cobrança como indevida. `fee_resolution_value_review` e `value_realization_review` só apontam trabalho; o ledger de valor (P1.1) mantém SoR, metodologia e validação próprios — nenhuma oportunidade cria registro de valor.

## Acesso, Graph e governança

RLS + FORCE RLS; leitura por `admin`/`finance_manager`/`analyst`/`viewer` no escopo da entidade (itens de grupo, como concentração, só para escopo de grupo); escrita só por RPC; motor e candidatos sem `EXECUTE` para usuários. Provedor, outro tenant e membro revogado não leem. Graph projeta `opportunity` ligado a contrato, provedor, entidade, facility e RFQ da fonte (derivado, sem duplicar SoR). Auditoria em `fin_events` (`opportunity_rule_versioned`, `opportunity_<estado>`) sem fatos, notas ou parâmetros. Registry: regras (`CONFIDENTIAL`, imutáveis), oportunidades (`FINANCIAL_SENSITIVE`), eventos (`AUDIT_EVIDENCE`), cursor (`INTERNAL`, operacional, sem export); export `opportunity_*`, prévia de exclusão e legal hold incluídos. API pública não expõe oportunidades (scope `opportunities:read` só com caso real).

## Migration, operação e rollback

`docs/supabase-financial-opportunity-engine.sql`, marker `financial-opportunity-engine-1`, após `financial-fee-intelligence-1`; inclui o job `opportunities` nas listas do P0.10. Rollback `docs/rollback/supabase-financial-opportunity-engine.rollback.sql` só sem nenhuma regra, oportunidade, evento ou execução do job; depois, forward-fix. Hosted: mesmo procedimento de backup/restore/bundle/doctor/canário; a cadência diária da cron continua o BLOCKER de P0.10 para quem precisar de minutos.

## Verificação

`tests/database/financial-opportunity-engine.sql` (clean, upgrade com rollback e reaplicação, fresh): dedupe, job repetido, cursor, cooldown, mudança material, regra versionada, regra desativada, prazo e condição, evento de tarifa, RFQ com confirmação e sem convite, revisor errado, transição inválida, isolamento de tenant/entidade/provedor, Graph, busca, auditoria, export, hold, freeze e membro revogado. `scripts/test-finance-opportunities.mjs`: catálogo sem limiar financeiro padrão, textos de "por que disparou" para todo tipo, linguagem sem recomendação, filtros, transições e API só com JWT. `tests/e2e/finance-opportunities.spec.js`: worklist, filtros no servidor, detalhe com regra/fonte/histórico, revisor, RFQ com confirmação, viewer sem ações, indisponibilidade, sem overflow.
