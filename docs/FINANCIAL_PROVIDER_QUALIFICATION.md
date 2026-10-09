# Provider Qualification & Due Diligence

Guideline v3 §11. Matriz: `PQ-01` (nova linha, Stage 1 — Intelligence e
Enterprise Adoption, dependência direta de P0.5 Relationship).

**Tese.** Qualificação registra **exigências definidas pela empresa**,
evidências com origem e validade, exceções com segregação de funções e a
**decisão de uma pessoa**. O Arandu **não é** provedor de KYC/KYB/sanções:
resultado de serviço especializado entra como evidência de origem
`external_service`, com o nome do serviço — nunca como verificação do Arandu.
Consultar a qualificação informa a solicitação e a policy; não escolhe
vencedor e não decide sozinho.

## Modelo (`docs/supabase-financial-provider-qualification.sql`, marker `financial-provider-qualification-1`)

| Objeto | Papel |
| --- | --- |
| `fin_qualification_requirements` | exigência do cliente: área (cadastro, jurídico, financeiro, segurança, privacidade, compliance, continuidade, documentação, seguros, específica da categoria), categoria, entidade (vazio = grupo), validade em dias, criticidade; versões imutáveis (`requirement_key` + `version`), aposentar em vez de apagar |
| `fin_provider_qualifications` | uma por provedor × categoria × entidade; estado, responsável, revisar-até, válida-até, condições, decisão (quem, quando, por quê) |
| `fin_qualification_evidence` | evidência por exigência: origem (`provider`, `internal`, `external_service` + nome do serviço), referência, documento privado opcional, validade (padrão = validade da exigência), revisão humana |
| `fin_qualification_exceptions` | exceção temporária (≤ 366 dias) com motivo, controles compensatórios e decisão de **outra pessoa** (SoD no schema) |
| `fin_qualification_events` | trilha imutável |

Estados: `not_started → in_progress ⇄ pending_provider → pending_internal_review → qualified | qualified_with_conditions | rejected`;
`qualified* → suspended | expired | in_progress`; reabrir decisão exige
justificativa. Máquina de estados idêntica em SQL e JS (teste de paridade).

## Regras aplicadas no banco

- **Prontidão** (`fin_qualification_readiness`): cada exigência aplicável
  (ativa, da categoria ou de todas, do grupo ou da mesma entidade) precisa de
  evidência aceita e vigente **ou** exceção aprovada e vigente. Sem isso,
  `qualified`/`qualified_with_conditions` falham (`qualification requirements missing`).
- Com exceção aprovada só cabe `qualified_with_conditions`, com condições
  descritas.
- `valid_until` = a menor validade entre evidências e exceções (e a data
  informada, se menor).
- Quem registrou a evidência não a aceita; quem pediu a exceção não a decide.
- Decidir (`qualified*`, `rejected`, `suspended`) exige administração ou
  gestão financeira no escopo; analista registra evidência, pede exceção e
  movimenta o fluxo.
- Vencimento: `fin_run_qualification_expiry` (service role) vence evidências,
  exceções e qualificações e cria tarefa de revalidação 30 dias antes; o
  estado efetivo já aparece como vencido na leitura mesmo antes do job.

## Agendamento e operação

`GET /api/jobs/renewals`, protegido por CRON_SECRET, chama o vencimento de
qualificação depois dos marcos contratuais, dentro do lease existente de
`contract_milestones`. A data vem do servidor; nenhuma entrada do chamador
escolhe o período. Não há novo job, endpoint, secret ou cron configurado.

`qualification_expiry` publica somente contadores inteiros validados:
`qualifications_expired`, `evidence_expired`, `tasks_created`.
`milestone_tasks_created` conserva a contagem dos marcos; `processed` do job
inclui as ações de qualificação. Sem autorização, banco ou lease, nada roda.
Falha dos marcos impede o subpasso; RPC ausente, timeout, payload inválido ou
falha ao concluir o lease resultam em HTTP 502, sem sucesso fabricado. Os
outros jobs independentes continuam. Escritas já commitadas não são desfeitas;
o rerun usa a idempotência existente da RPC e não repete HTTP cegamente.

O schema hospedado precisa conter a migration de qualificação antes do
rollout; o doctor já exige a RPC. Não ativar esta alteração no schema antigo
como substituto de migration/recovery. Rollback é revert do handler; dados,
decisões humanas, tasks e audit events existentes permanecem preservados.

Evidência local de 08/10/2026: regressão reproduzida com RPC nunca chamada no
handler anterior; testes de jobs cobrem autenticação, lease ocupado/falho,
ordem, data, contadores, timeout, RPC indisponível, payload malformado e
redação. `check:finance` e build passaram. Integração do cron: M1/E1 até os
quatro gates no SHA exato e execução hospedada com schema correspondente.

## Consulta (RFQ/policy)

`GET /api/finance/qualifications/status?provider_id=&legal_entity_id=&category=`
→ `qualified | conditional | expired | rejected | suspended | in_progress | unknown`
(`fin_provider_qualification_status`), com aviso de que é informativo.

## Interface

`/finance/qualifications.html` (renderer compartilhado, só no build
financeiro): lista com estado efetivo e vencimentos, catálogo de exigências,
detalhe com checklist de prontidão, evidências, exceções, trilha e
formulários por estado (decisão de qualificar só aparece quando permitida).

## Lacunas conhecidas

- Portal do provedor ainda não envia evidência diretamente (a equipe registra
  com origem `provider`).
- Detector de "qualificação vencendo" no Opportunity Engine ainda pendente.
- Integração do vencimento na cron implementada em código; execução hospedada
  e cadência observada ainda pendentes.
- A policy de aprovação ainda não usa o estado de qualificação como fato.
- Hosted (M3) bloqueado pelo Stage 0.
