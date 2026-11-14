# Arandu 10 — contrato de integração v1.1

Base: `main@cd608cb4ce804b4ede88064230ef97948b7beb78` (revalidada).
As rotas abaixo estão **implementadas nesta branch**, com validação local em
andamento. Não representam migração ou disponibilidade em ambiente hospedado.
Prefixo `/api/finance/`. Usar o cliente autenticado atual, cookie/CSRF e JSON;
JWT do usuário em toda leitura/RPC. Respostas `Cache-Control: no-store`.

## Inventário e reutilização

`POST comparison`, `buildComparison` e `applyUserWeights` continuam sendo o único
motor. Cenários não persistem score/ranking nem executam decisão/aprovação.
`contract-renewal-rfq`, contratos, tarefas, eventos, Passport, RFQ Passport e
Relationship 360 continuam canônicos. Não existe segunda fila operacional.

## Decision Intelligence persistente

| Método / endpoint | Entrada | Saída |
|---|---|---|
| GET `decision-scenarios` | `rfq_id` obrigatório; `status=active|archived` (default active), `limit=1..100` (25), `cursor?` | `{ok,rows,page,consistency}` |
| GET `decision-scenarios/detail` | `id`; `limit=1..100` (25), `cursor?` para histórico | `{ok,scenario,history,coverage:{history:page},consistency}` |
| POST `decision-scenarios` | `{rfq_id,name,weights,request_key}` | 201 `{ok,scenario}` |
| PATCH `decision-scenarios` | `{id,expected_version,name,weights,refresh_context?}` | 200 `{ok,scenario}` |
| POST `decision-scenarios/archive` | `{id,expected_version}` | 200 `{ok,scenario}` |
| POST `decision-scenarios/duplicate` | `{id,name,request_key}` | 201 `{ok,scenario}` |
| POST `decision-scenarios/compare` | `{rfq_id,scenario_ids:[uuid,...]}` (1–3 distintos) | `{ok,classification,notice,context,comparison,scenarios:[{scenario,weighted}]}` |

`name`: texto sem HTML, 2–120 caracteres. `weights`: objeto não vazio de critérios
retornados por `comparison.criteria`, cada valor **numérico**, >0 e <=100, até 30.
`request_key`: 8–80 caracteres `[A-Za-z0-9._:-]`, reutilizar na recuperação de envio.
`expected_version`: inteiro >=1 obrigatório na edição/arquivamento.
`refresh_context`: boolean, default false. PATCH substitui nome e pesos completos.
Sem refresh, editar pesos preserva o contexto auditado. Duplicar preserva os pesos
e contexto da origem, inclusive obsolescência; nome novo não atualiza fontes.

Scenario DTO:
```js
{
 id, organization_id, rfq_id, name, weights, version, status,
 created_by, created_at, updated_by, updated_at,
 context: {rfq_revision,rfq_updated_at,rfq_status,sources:[
   {id,source_kind:'portal'|'external',current_version,status,
    document_available,rfq_revision_matches}
 ]},
 stale, stale_reasons:[], classification:'human_analysis'
}
```
Campos de recibo internos não são retornados pelo servidor. `stale_reasons`:
`context_unavailable`, `rfq_changed`, `process_changed`, `proposals_changed`.
Contexto inclui referências de versões/estado; nenhuma condição financeira ou
resultado derivado é gravado. Histórico em eventos imutáveis retorna
`{id,event_type,actor_id,happened_at,metadata:{version,name,weights,context,status,source_id}}`.
`source_id` identifica a origem de duplicação; demais comandos usam null.

Criação/duplicação são idempotentes por RFQ/usuário/chave; replay retorna a mesma
identidade, sem outro evento. Chave com payload diferente = 409 `scenario_conflict`.
Edição/arquivo usam trava da RFQ e versão otimista. Repetir arquivo com a versão
original retorna o registro arquivado. Cenário arquivado não admite edição.
Compare recalcula com o motor canônico; contexto salvo obsoleto ou mudança durante
leitura = 409 `scenario_stale`, sem resultado parcial. Refresh é explícito.
Limite de contexto: 500 propostas, incluindo fontes externas; excesso = 422.

Permissões: somente organização BUYER e entidade autorizada da RFQ. Membros podem
ler; admin/finance_manager/analyst podem escrever. Viewer somente leitura;
instituição convidada e outra organização não veem cenários ou histórico. RPCs
repetem as verificações; não há grant de escrita direta na tabela.

## Aprovações confiáveis

`GET approvals?organization_id=<uuid>&rfq_id?=&limit=1..100&cursor?=` mantém
`{ok,viewer_id,rows}` e adiciona `page`, `consistency`,
`coverage:{assignments:'complete'|'incomplete',counts:'page_only'}`.
Default 100; não inferir total da primeira página. Detalhes de etapas continuam
limitados (1000 steps/400 stages/400 exceptions/50 delegations); ao atingir limite,
`viewer_can_act=false` e cobertura de atribuições incompleta.

Preserva `stale`, `stale_reason`, `expired`, `freshness`, `viewer_can_act`.
Adiciona por linha:
```js
{
 stale_reasons:[], context_coverage:'complete'|'incomplete'|'historical',
 context_reference:{rfq_id,source_id,source_kind,
   recorded:{rfq_updated_at,proposal_version,rfq_revision},
   current:{rfq_updated_at,proposal_version,rfq_status,source_status}},
 action_conditions:{context_current,pending,unexpired,
   assignment:'checked_by_approval_endpoint',authorization:'rechecked_transactionally'}
}
```
Razões: `context_unavailable`, `rfq_changed`, `source_ineligible`,
`proposal_changed`, `process_ineligible`. Contexto ausente/inconclusivo tem
`stale=true`, `freshness='unknown'`, cobertura incomplete, ação bloqueada.
Histórico concluído é `freshness='historical'` e não habilita voto.
Precisão de timestamp preserva microssegundos. Fonte retirada, versão substituída,
documento externo indisponível, expiração e estado de processo bloqueiam ação.
A validade é reconferida no banco no voto, com travas; papéis, sequência, delegação
e segregação de funções atuais continuam obrigatórios. Visibilidade não é autorização.

## Renewal Operations e Caixa de Trabalho

`GET renewal-operations?organization_id=&limit=1..50&cursor?=&owner?=&legal_entity_id?=&due_from?=&due_to?=&urgency?=`

`owner` aceita UUID ou `none`. Datas ISO reais, intervalo inclusivo de aviso prévio.
`urgency=expired|notice_due|renewing|upcoming`. Ordenação estável por `notice_on,id`.
Retorna contratos active/renewing sob RLS, inclusive vencidos. Cada linha inclui
IDs canônicos, `notice_on`, `days_to_end`, `days_to_notice`, `unassigned`, `urgency`,
`tasks`, `milestones`, `renewal_rfqs`,
`history:{endpoint,parent_contract_id,source_rfq_id}` e
`actions:{can_start_renewal,endpoint,authorization,automatic_negotiation:false}`.
Tarefas, marcos e vínculos têm teto de 500 por página de contratos; os limites e
completude de cada fonte são explícitos em `coverage.enrichment`. RFQs invisíveis
não são expostas. Para todo histórico, usar Contract 360/seções existentes.

`GET work-intelligence?organization_id=&section=tasks|approvals|demands|contracts&limit=1..50&cursor?=`

Uma seção por chamada, cursor independente. Todas aceitam organização; tasks,
demands e contracts aceitam owner/legal_entity_id. tasks/contracts aceitam
`due_from/due_to`; contracts também urgency. Filtros incompatíveis = 400.
Tasks = abertas, com `overdue`, `unassigned`, `actions.can_edit`.
Demands = rascunhos, com `readiness` e `actions.can_edit`.
Contracts = os que exigem atenção (expired/notice_due/renewing), ou urgency explícita.
Approvals = pending, contexto factual; `viewer_can_act=false` nesta composição.
Carregar endpoint indicado em `action_conditions.endpoint` para etapas/autorização
completas; não habilitar voto a partir da simples presença na fila.

Envelope operacional:
```js
{ok,rows,section,page,page_count,consistency,generated_at,
 coverage:{scope:'authorized_visible_records',total:null,complete,
   counts:'page_only',enrichment}}
```
`complete` só é true para consulta sem cursor que coube numa página. Nunca somar
primeiras páginas para anunciar total da carteira. Contagens são sempre desta página.
Permissões de ação são indicativas e reconferidas no comando canônico.
`POST contract-renewal-rfq {organization_id,contract_id}` permanece idempotente:
recupera RFQ ativa existente; não inicia negociação automaticamente.

## Financial Passport e Relationship 360

Inventário: `profile` CRUD/confirmação/histórico, `rfq-passport` snapshot de campos
utilizados, `passportEvidence`, Contract 360 e Relationship 360/seções já atendem
cadastro, proveniência, histórico e obrigações. Foram preservados, sem duplicação.

Extensão: `GET demand-readiness?rfq_id=` → `{ok,rfq_id,readiness}`.
`readiness={ready,missing_fields,validation_errors,coverage:{required,missing},
provenance:{kind:'rfq_declared_data',rfq_id,revision,updated_at},passport:{endpoint,
suggestions_applied_automatically:false},notice}`. Usa normalizeDemand canônico;
é prontidão dos campos da demanda, não aprovação/publicação nem aceite bancário.
Snapshot Passport e documentos continuam acessíveis pelas APIs canônicas. Ausências
ficam explícitas; vínculo documental não comprova autenticidade.

## Paginação, erros e integração

`page={limit,has_more,next_cursor}`. Repassar cursor opaco sem alteração, com mesmos
usuário/organização/filtros. `rows:[]`, has_more false e cursor null = vazio.
`consistency='live_reads_not_transaction_snapshot'`; não promete snapshot entre páginas.
Não deduzir sucesso após timeout; recuperar criação com a mesma chave e payload.

Envelope de erro atual `{ok:false,error,code}`: 400 entrada/cursor inválido;
401 sem sessão; 403 sem permissão; 404 objeto indisponível (não distingue outro tenant);
409 `scenario_conflict|scenario_stale|approval_stale` ou conflitos canônicos;
422 `scenario_coverage_limit|proposal_coverage_limit`; 503 schema incompatível.
Não repetir edição cegamente após 409; recarregar versão, histórico e contexto.

```js
const saved = await api('decision-scenarios', {method:'POST', body:{
 rfq_id:rfq.id,name:'Prazo prioritário',weights:{term_months:70},request_key:crypto.randomUUID()
}});
await api('decision-scenarios',{method:'PATCH',body:{id:saved.scenario.id,
 expected_version:saved.scenario.version,name:'Contexto revisto',weights:{term_months:60},
 refresh_context:true}});
```

## Validação e migração

- Contratos HTTP/erros/paginação/motor/concorrência de leitura: `scripts/test-arandu-10.mjs`.
- Aprovações/compatibilidade: `scripts/test-finance-api.mjs`.
- CRUD, RLS, tenants, instituições, viewer, histórico, refresh, aprovações:
  `tests/database/financial-arandu-10.sql`.
- Concorrência real/replay/revogação: `tests/database/arandu-10-concurrency.mjs`.
- Jornada HTTP/Auth/RLS real: `scripts/pilot-local/arandu-10-journey.sh` (stack local).
- Migration `docs/supabase-financial-arandu-10.sql`, nos dois fluxos do manifesto.
  Rollback retira acesso aos comandos/projeção e preserva registros, export e guardas
  de integridade. Reaplicar restaura acesso; não há perda de histórico.
- Governança/export portável e seed/reset Demo atualizados, sem execução hospedada.

Resultados e limitações finais serão registrados em `ARANDU_10_EVIDENCE.md`.
Nenhuma nova API proposta pendente é necessária para o frontend acima.
