# Arandu 10 — contrato de integração v1 (checkpoint inicial)

Base verificada: main@cd608cb4ce804b4ede88064230ef97948b7beb78.
Este checkpoint distingue APIs existentes de extensões propostas. As propostas
abaixo serão atualizadas para implementadas após validação; não são disponibilidade
em Demo/produção. Prefixo `/api/finance/`, sessão/cookie atual e JWT do usuário;
nenhuma service role no caminho de usuário. Respostas `Cache-Control: no-store`.

## Inventário existente (implementado na base)

- `POST comparison {rfq_id, weights?}` → `{ok, comparison, weighted, criteria}`.
  Motor canônico `buildComparison/applyUserWeights`; análise humana.
- `GET approvals?organization_id=&rfq_id?` → `{ok, viewer_id, rows}`;
  `POST approvals/request|act|cancel|supersede`. SQL reconfere autorização e contexto.
- `GET contracts?organization_id=&paged=1&limit=&after=`; `GET contract-detail?id=`
  e seções `documents|obligations|tasks|milestones|renewals` paginadas.
- `POST contract-renewal-rfq {organization_id,contract_id}` recupera/cria RFQ
  canônica do ciclo; não inicia negociação automaticamente.
- `GET tasks` tem paginação, filtros e assignees canônicos; Passport tem CRUD,
  evidências e histórico; Relationship 360 já oferece seções paginadas.

## Cenários — proposto para implementação neste ciclo

`GET decision-scenarios?rfq_id=<uuid>&limit=25&cursor?=&status=active|archived`
→ `{ok, rows, page:{limit,has_more,next_cursor}, consistency}`.
`GET decision-scenarios/detail?id=<uuid>` → `{ok, scenario, history, coverage}`.
`POST decision-scenarios` com `{rfq_id,name,weights,request_key}`.
`PATCH decision-scenarios` com `{id,expected_version,name,weights,refresh_context?}`.
`POST decision-scenarios/archive` com `{id,expected_version}`.
`POST decision-scenarios/duplicate` com `{id,name,request_key}`.
`POST decision-scenarios/compare` com `{rfq_id,scenario_ids:[uuid,...]}` (1–3).

Scenario: `{id,organization_id,rfq_id,created_by,created_at,updated_by,updated_at,
name,weights,version,status,context,stale,stale_reasons}`. Context referencia revisão,
updated_at da RFQ e versões/estado das propostas (portal e externas); nenhum ranking
é persistido. History traz versões imutáveis, autoria e timestamps. Compare recalcula
com motor canônico, só quando contexto salvo corresponde ao atual; caso contrário 409
`scenario_stale`, exigindo PATCH explícito `refresh_context:true`. Duplicar preserva
contexto de origem, inclusive obsolescência. Criação idempotente por usuário/RFQ/chave;
mesma chave e payload diferente = 409. expected_version é inteiro >=1 obrigatório.

Permissões: BUYER com visibilidade da RFQ/entidade; leitura para membros autorizados;
escrita admin/finance_manager/analyst; nenhuma escrita para viewer, nenhuma leitura
para instituição convidada. SQL é autoridade, inclusive chamada RPC direta.

## Aprovações — extensão aditiva proposta

Preservar `stale`, `stale_reason`, `expired`, `freshness`, `viewer_can_act`.
Adicionar `stale_reasons: string[]`, `context_coverage: complete|incomplete|historical`,
`context_reference` com referência gravada/atual e `action_conditions`.
`context_unavailable` nunca significa current; `viewer_can_act` exige contexto atual.

## Operações — propostas, sem nova fila

`GET renewal-operations?organization_id=&limit=25&cursor?=&owner?=&legal_entity_id?=`
→ contratos priorizados pela data de aviso, marcos, RFQ e tarefas canônicos;
`GET work-intelligence?organization_id=&section=tasks|approvals|demands|contracts&limit=25&cursor?=`
→ uma seção paginada autorizada por chamada. Toda contagem é `page_count`, nunca total.
Escopo de cursor inclui usuário, organização e filtros; mudar escopo exige reiniciar.
Ausência de owner/contexto declarada; visibilidade não concede permissão de ação.
Links canônicos permitem carregar histórico completo via APIs existentes.

## Erros e estados

Envelope atual `{ok:false,error,code}`. 400 entrada/cursor inválido; 401 sem sessão;
403 sem permissão; 404 objeto indisponível; 409 conflito de versão/idempotência ou
contexto obsoleto; 422 cobertura excedida, sem resultado parcial disfarçado de completo.
Página vazia = rows [], has_more false, next_cursor null. Leituras paginadas são live,
não snapshot transacional de carteira. Nenhum dado faltante vira zero financeiro.

## Consumo previsto

```js
const saved = await api('decision-scenarios', {method:'POST', body:{
  rfq_id: rfq.id, name:'Prazo prioritário', weights:{term_months:70},
  request_key: crypto.randomUUID()
}});
await api('decision-scenarios', {method:'PATCH',body:{id:saved.scenario.id,
  expected_version:saved.scenario.version,name:'Revisado',weights:{term_months:60},
  refresh_context:true}});
```

## Evidências (pendentes neste checkpoint)

Testes previstos: `scripts/test-arandu-10.mjs`, `tests/database/financial-arandu-10.sql`,
concorrência SQL, instalação limpa/upgrade pelo manifesto, HTTP/Auth/RLS local.
Nenhum teste deste ciclo é declarado aprovado antes de executado.
