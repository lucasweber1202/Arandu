# Bank Fee Intelligence v1 (P1.2)

Status: implementado em branch `feature/bank-fee-intelligence`; CI e rollout hospedado conforme `IMPLEMENTATION_MATRIX.md`. O Arandu registra fatos de tarifa — o que foi contratado, o que foi cobrado, se é comparável e o que uma pessoa concluiu. Não é ledger contábil, conciliação bancária automática, ERP/TMS nem sistema de cobrança, e não acusa provedor.

O módulo responde, com fonte: quanto deveria custar (referência contratada vigente no período), quanto foi observado, se é economicamente comparável, se há diferença e se ela foi revisada.

## Modelo e system of record

| Tabela | Papel |
| --- | --- |
| `fin_fee_schedules` | Tarifa contratada por contrato × serviço × unidade de cobrança (categoria, dono, versão atual). |
| `fin_fee_schedule_versions` | Versões imutáveis: modelo de cobrança, moeda, taxa ou faixas, mínimo/máximo, vigência, **versão do contrato** vinculada, fonte e referência. Alteração contratual = nova versão; o histórico nunca é sobrescrito. |
| `fin_fee_observations` | Cobrança observada: período, volume/base, valor, origem (`source_type`), referência, identificador na fonte, evidência, dono, `ingested_at`, verificação humana única. |
| `fin_fee_variances` | Snapshot imutável da comparação de cada observação: referência aplicada, fórmula, entradas, contratado, observado, diferença, direção, motivos de não comparabilidade e estado de revisão. |
| `fin_fee_reviews` | Histórico imutável de revisão: de/para, motivo, notas, evidência, resolução, revisor, data. |

Fonte única de rótulos, catálogos e validação: `lib/finance/fee-intelligence.mjs`; o banco repete cada checagem e é quem calcula. A tela é composta no servidor (`lib/finance/fee-presenter.mjs`) e desenhada pelo renderer genérico `finance/src/views/ledger.js`.

## Modelos de cobrança suportados

Só onde a metodologia é inequívoca: valor fixo (`per_month`, `per_year`, `one_off`), por unidade (`per_transaction`, `per_item`), percentual e basis points (`percent_of_volume`, `percent_of_amount`), faixas graduadas por unidade (cada unidade paga a taxa da faixa em que cai; última faixa aberta) e mínimo/máximo **mensais**. Não existe pricing engine genérico, faixa por volume total, pró-rata por dias nem conversão de moeda.

## Comparabilidade

A versão aplicada é a vigente no **início** do período observado (maior `effective_from` ≤ início, desempate pela maior versão). Nunca se compara uma cobrança histórica com a versão atual do contrato. Há diferença calculada somente quando todos estes critérios se cumprem; senão `comparison_status = not_comparable` (ou `missing_reference`) e `contracted_amount`/`variance_amount` ficam `null`, com os motivos persistidos:

| Motivo | Regra |
| --- | --- |
| `missing_contracted_reference` | Nenhuma tarifa contratada para o serviço no contrato (status `missing_reference`). |
| `charging_unit_mismatch` | Mesmo serviço, unidade econômica diferente. |
| `no_reference_for_period` | Nenhuma versão vigente no início do período. |
| `reference_changed_in_period` | Outra versão entra em vigor dentro do período. |
| `currency_mismatch` | Moeda observada ≠ moeda contratada. |
| `missing_volume` / `missing_base_amount` | Volume (unidades) ou base monetária ausente quando a fórmula precisa. |
| `period_not_normalizable` | Valor fixo mensal/anual exige meses-calendário completos (anual: múltiplo de 12). |
| `minimum_maximum_requires_single_month` | Mínimo/máximo valem por mês; o período precisa ser um mês-calendário. |

Diferença = `observed_amount − contracted_reference`, arredondada a duas casas; referência = `rate × meses`, `rate × volume`, `rate/100 × base`, `rate/10000 × base` ou soma graduada, com piso/teto mensal. Fórmula, entradas e a versão aplicada ficam no snapshot (`methodology`, `reference_snapshot`), reproduzíveis sem recalcular contra dados mutáveis. Diferenças negativas permanecem negativas; acima e abaixo nunca são somadas entre si; moedas nunca se misturam.

## Origem e proveniência

Cada observação guarda `source_type`, `source_reference`, `source_object_id` (opcional), `ingested_at`, `owner_id`, `evidence_reference` e a verificação (`verification_status`, `verified_by`, `verified_at`, motivo). Origens aceitas hoje: declaração manual, extrato bancário, relatório de ERP, relatório de TMS, arquivo do banco e outra planilha — **todas registradas por uma pessoa** (`ingestion_channel = manual_entry`). `api` e `confirmed_document_extraction` existem no schema para o futuro, mas o banco recusa: não há integração automática nem extração de documento nesta versão.

Duplicidade: a chave `(origem, referência, contrato, serviço, unidade, período)` torna o registro idempotente. Reenvio do mesmo fato devolve o mesmo id sem nova comparação; outro valor sob a mesma chave é conflito (`409`).

## Linguagem segura e revisão humana

Automático e permitido: "acima/abaixo da referência contratada", "igual à referência", "revisão necessária", "não comparável", "sem referência contratada". Nunca automático: erro do banco, cobrança indevida, fraude, quebra contratual. A varredura de linguagem roda em `scripts/test-finance-fees.mjs` sobre a interface, o domínio, a API e a saída real do apresentador.

Estados: `not_required` (igual à referência), `new` (revisão necessária), `under_review`, `confirmed` (uma pessoa confirmou a diferença frente à referência — só para comparáveis), `explained`, `dismissed`, `resolved`. Transições: new → under_review | dismissed; under_review → confirmed | explained | dismissed; confirmed | explained → resolved. Toda transição exige o estado atual esperado (concorrência otimista), motivo do catálogo e notas; confirmar/explicar/resolver exigem evidência; resolver exige resolução. Apenas `admin`/`finance_manager` no escopo da entidade revisam ou verificam.

**Variância não é economia.** Nenhuma tarifa gera registro de valor (P1.1). Uma diferença resolvida só pode virar valor realizado por uma pessoa, no módulo de valor, com baseline, metodologia e comparabilidade próprios (testado: nenhuma linha em `fin_value_records`).

## Contratos, provedores e Graph

A versão da tarifa referencia `fin_contract_versions(contract_id, version)`; a entidade e o provedor vêm do contrato. O painel do provedor mostra contagens factuais por moeda (tarifas contratadas, observações, com diferença, em revisão, resolvidas/descartadas, cobertura), sem score. O Graph projeta `fee_schedule`, `fee_observation`, `fee_variance` e `fee_review` ligados a contrato, provedor, entidade e RFQ de origem, sob o RLS do chamador; continua camada de consulta, nunca fonte.

## Acesso e auditoria

RLS + FORCE RLS em todas as tabelas; `authenticated` só lê, escreve por RPC `security definer` que confere tenant comprador, papel, escopo de entidade do contrato (atual) e freeze de offboarding. Leitura exige escopo da entidade e o contrato legível agora. Viewer/analyst leem; provedor, outro tenant, membro revogado e escopo de outra entidade não leem nem escrevem. Eventos: `fee_schedule_created`, `fee_schedule_versioned`, `fee_observation_recorded`, `fee_variance_detected`, `fee_variance_reviewed`, `fee_variance_resolved`, `fee_observation_verified`, com ids, estados e versões — sem valores, notas, referências ou evidência.

## Governança

As cinco tabelas estão no registry (`lib/finance/data-governance.mjs`): `FINANCIAL_SENSITIVE`/`AUDIT_EVIDENCE`, dado financeiro, sem PII própria, retenção `FINANCIAL_RECORD`/`AUDIT_EVIDENCE` (sem purge cotidiano), exclusão `immutable` (sai só pelo offboarding do tenant), export `fee_*`, legal hold aplicável, dono `buyer_admin`. O export administrativo e a prévia de exclusão do tenant incluem as cinco; hold ativo bloqueia a exclusão. API pública (`/api/v1`) não expõe tarifas: sem caso de integração real ainda (scope `fees:read` fica para quando houver).

## Migration, operação e rollback

`docs/supabase-financial-fee-intelligence.sql`, marker `financial-fee-intelligence-1`, segue `financial-value-realization-1`. Aditiva e reaplicável; Graph e export são redefinidos inteiros a partir do estado P1.1. Doctor, canário, probes e preflight reconhecem o marker. Bundle de banco existente: `npm run migrations:bundle -- --flow=existingDatabase --after-schema=<marker observado>`; antes de aplicar no hosted, o procedimento de backup/restore/doctor/canário de `FINANCIAL_VALUE_REALIZATION.md`.

Rollback `docs/rollback/supabase-financial-fee-intelligence.rollback.sql` só sem nenhum fato de tarifa; restaura Graph/export de P1.1 e o marker. Depois do primeiro uso, forward-fix.

## Verificação

- `tests/database/financial-fee-intelligence.sql` (clean, upgrade com rollback + reaplicação dupla, fresh): versões histórica e nova, diferença negativa, período cruzando versões, moeda/unidade/serviço/período errados, volume e base ausentes, normalização mensal, percentual, faixas com mínimo, duplicidade e conflito, origens inexistentes recusadas, ciclo de revisão e transições inválidas, verificação única, imutabilidade, resumo por moeda sem netting, variância ≠ economia, Graph, viewer, outra entidade, outro tenant, provedor, export, auditoria sem valores, hold, freeze e membro revogado.
- `scripts/test-finance-fees.mjs`: validação, filtros, JWT-only, entrada inválida nunca chega à RPC, links seguros, apresentador e linguagem segura.
- `tests/e2e/finance-fees.spec.js`: cartões por moeda, filtros no servidor, detalhe rastreável, revisão com estado esperado, cobrança com origem explícita, viewer sem ações, indisponibilidade sem zero e sem overflow, nos cinco projetos.
