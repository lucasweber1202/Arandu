# Renegociação e oportunidade: continuidade v2

Buyer/gestor precisa reconstruir a origem e encerrar trabalho com um resultado comprovável. Reutiliza contratos, versões, eventos de origem, oportunidades, RFQs, propostas, aprovações, decisões e contratos decorrentes. Sem tabela de jornadas, reconstrução do Graph ou duplicação do comando de RFQ.

## Contratos aditivos de API

Todas as operações exigem sessão, rate limit financeiro e JWT do usuário; leituras sob RLS, comprador autorizado à organização/entidade, sem service role e `no-store`. IDs são UUIDs. Dados ausentes permanecem ausentes. O provedor continua no seu portal, sem acessar esta consulta compradora.

`GET /api/finance/contract-negotiations?contract_id=UUID[&after=EVENT_UUID][&rfq_id=UUID]`: contrato de origem, versões/termos/fontes/autores, aditivos/documento, tarefas, oportunidades com regra e fatos, processos com origem versionada, propostas e suas versões, propostas externas separadas por autoria, aprovações/etapas, decisões/snapshots, contratos resultantes e histórico. `processes[].comparison` aponta ao `POST /api/finance/comparison` existente e declara que não há comparação persistida; a fotografia de decisão continua no SoR existente. `next_action` descreve próxima ação, sem executá-la. Contrato importado sem origem de negociação retorna `absence=no_recorded_renegotiation_origin`, nunca RFQ fabricada. Evento legado sem versão tem `contract_version:null,version_recorded:false`.

Resposta `200 {ok:true,contract,versions,amendments,tasks,opportunities,processes,absence,next,consistency}`. `processes[].missing` distingue decisão não registrada e contrato decorrente não registrado. Resultado externo mantém `origin=buyer_recorded_external`; autenticado tem `institution_authenticated`. Paginação de 20 eventos de origem por UUID, cursor `next`; cada coleção relacionada limitada a 500 com sentinela. Excesso responde 422 `negotiation_coverage_limit`, sem fingir completude. As leituras são vivas, não snapshot transacional (`consistency` explícita). 400 UUID, 401 sessão, 403 organização, 404 contrato ausente/invisível.

`GET /api/finance/opportunities/outcome?id=UUID`: `200 {ok:true,opportunity,processes,completion,absence}`. Tipos sem negociação retornam `absence=no_linked_negotiation`; nenhum tipo ganha RFQ artificial. `completion` vem dos eventos imutáveis da ação confirmada; decisão e contrato são recuperados pelos vínculos existentes. Todas as 14 regras existentes continuam operando sem mudanças; este comando fecha o recorte das oportunidades que já geram RFQ contratual (renovação/marco). Demais ações usam sua revisão existente.

`POST /api/finance/opportunities/complete-negotiation`:

```json
{"opportunity_id":"00000000-0000-4000-8000-000000000004","decision_id":"00000000-0000-4000-8000-000000000005","expected_status":"acknowledged","confirmed":true,"resolution":"Revisão humana concluída após decisão registrada"}
```

Obrigatórios todos; `expected_status=acknowledged|under_review`, descrição de 3–1000 caracteres sem HTML. Admin/finance_manager no escopo, freeze respeitado; revisor existente continua obrigatório ao concluir `under_review`. RPC `fin_complete_opportunity_negotiation` confirma decisão da mesma organização e da RFQ já vinculada, muda para `acted` pela máquina existente e registra evento `opportunity_negotiation_completed` com IDs de RFQ/decisão, ator e data. Tudo na mesma transação, lock da oportunidade e autorização com membership/grants travados. Nenhuma aprovação, decisão ou contratação é tomada por essa operação.

Retorno `200 {ok:true,status:"acted",decision_id:UUID,replayed:false}`; repetição confirmada da mesma conclusão devolve `replayed:true`, sem novo evento. 400 `invalid_opportunity_result`; 409 conflito de estado, confirmação ausente ou decisão não vinculada; 403 papel/entidade/revisor; 503 schema incompatível. A decisão pode existir sem contrato: o cliente registra contrato posteriormente pela operação já existente, e a consulta de resultado o recupera sem alterar o evento histórico.

## Persistência, rollout e recuperação

Migration `financial-negotiation-continuity-1`, depois de `financial-provider-intent-integrity-1`. Trigger enriquece o evento canônico `rfq_created_from_contract` com `contract_version` vigente na data da criação (data de efeito, desempate por versão; termos futuros não são tomados como vigentes), enquanto o comando original mantém lock do contrato. Só IDs/versão entram no audit, sem preços ou termos. Versão zero fica null. Não reescreve eventos históricos. Versões contratuais imutáveis mantêm os termos originários, mesmo após nova versão/aditivo.

Schema antes do app; APIs antigas compatíveis. Rollback remove RPC/trigger/índice e restaura marker anterior, preservando todos os eventos/dados. Código antigo ignora metadados aditivos. Em falha de resposta, consultar outcome antes de repetir; replay não cria duplicata. Não aplicado em hospedagem por esta missão. Export/hold/retention continuam nos eventos e oportunidades existentes; nenhuma tabela nova.

## Provas e handoff

`scripts/test-financial-negotiations.mjs`: contrato API com mocks, versões, snapshot, autoria, contrato decorrente, ausência, JWT e raiz negada. `tests/database/financial-negotiation-continuity.sql`: RPCs reais contrato → regra/oportunidade → confirmação → RFQ → convite → proposta → decisão humana → conclusão → contrato, versão de origem preservada, falta de confirmação/resultado, viewer, retry e nenhum savings automático. Instalação/upgrade/reapply/rollback no runner existente. Resultados efetivamente executados ficam no plano de release.

Claude: consumir `contract-negotiations` no Studio e `opportunities/outcome` no detalhe do Radar; confirmação de conclusão deve mostrar decisão e descrição antes do POST. Não marcar contratado antes de um contrato persistido; ausência de etapa é um estado funcional. `comparison` continua o endpoint existente. Não houve alteração de `finance/src/**`.
