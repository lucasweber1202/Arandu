# Contratos de interoperabilidade — backend operacional v8

Checkpoint de 04/11/2026. Base auditada `9910408244bfb122e5d62a77c692928958ce77bd`
(#327 integrada, após #326). Este handoff distingue API existente de extensão
planejada. Não é alegação de implantação hospedada ou conclusão da missão.

Codex mantém domínios/API/SQL/seed/integração/operação e seus testes. Views,
componentes, CSS e E2E de produto permanecem com Claude Code. Nenhuma mensagem
para outra sessão é presumida. A PR consolidada deverá carregar este contrato.

## Consumível agora na main auditada

Prefixo `/api/finance/`. Sessão do usuário e RLS permanecem em toda leitura;
escopos de entidade vêm do banco. Nunca trocar o JWT por service role para
montar contexto. IDs são UUIDs; datas são `YYYY-MM-DD`; timestamps preservam
fuso. Referências mantêm IDs canônicos em todas as superfícies.

`EXISTING_VERIFIED` abaixo significa código/testes já presentes e CI da #327
verde; não significa M3. `EXISTING_NEEDS_EXTENSION` preserva os campos atuais
mas tem lacuna explícita. Estados e erros existentes não serão renomeados.

| Capacidade/classificação | Método e endpoint | Entrada atual | Saída atual / limites | Fonte, persistência e teste |
| --- | --- | --- | --- | --- |
| Contract 360 — `EXISTING_NEEDS_EXTENSION` | GET `contract-detail?id=UUID` | `id` obrigatório | `contract`, `source_rfq`, `effective`, `versions`, `amendments`, `milestones`, `renewal_milestones`, `children`; limites 100/100/200/20/50 | Contrato/versões/aditivos/marcos canônicos; `test-finance-contracts.mjs`, `financial-contracts-v2.sql`; faltam seções operacionais paginadas e cobertura explícita |
| Registro de contrato — `EXISTING_VERIFIED` | POST `contract-import` | obrigatórios `organization_id`, `provider_id`, `product`, `title`, `starts_on`, `ends_on`; opcionais `legal_entity_id`, `renewal_notice_days`, `auto_renew`, `currency`, `terms`, `parent_contract_id`, `request_key`, `owner_id` | `{ok,id,replayed,creation_version?,owner_id,current_version,status,next_task}`; 201 novo, 200 replay com intenção | `fin_import_contract_intent` com chave ou `fin_import_contract`; entidade e papel no SQL; `financial-contract-import-integrity.sql`, teste concorrente real |
| Recuperar escrita incerta — `EXISTING_VERIFIED` | GET `contract-import-result` | `organization_id`, `request_key`; `legal_entity_id` opcional | recibo da intenção autorizada | `fin_contract_import_result`; não repetir import sem consultar recibo; `test-contract-import-integrity.sh` |
| Termos — `EXISTING_VERIFIED` | POST `contract-terms` | `contract_id`, `expected_version`, `terms`; `effective_from`, `reason` opcionais | `{ok,version}`; catálogo por produto recusa campos desconhecidos | `fin_record_contract_terms`; histórico imutável e conflito de versão; `financial-contracts-v2.sql` |
| Responsável de contrato — `EXISTING_VERIFIED` | POST `contract-owner` | `contract_id`, `expected_owner_id`, `owner_id` | `{ok,changed}` | `fin_assign_contract_owner`; não herda responsável silenciosamente; testes de integridade de importação |
| Portfolio — `EXISTING_NEEDS_EXTENSION` | GET `portfolio` | `organization_id`; `horizon_months` em 3/6/12/18/24/36 | `facilities`, `guarantees`, `balances`, `views`, `boundary`; leitura limitada, sem paginação pública atual | `fin_facilities`, saldos, cronogramas, garantias; `test-finance-portfolio.mjs`, `financial-relationships-portfolio.sql`; faltam filtros antecipados/drilldown e cobertura completa |
| Obrigações — `EXISTING_NEEDS_EXTENSION` | GET `covenants` | `organization_id`; filtros opcionais `provider_id`, `legal_entity_id`, `obligation_id`, `contract_id`; `after` offset 0..5000 | DTO de apresentação, 25 períodos por página e `next`; não interpretar primeira página como total | `fin_obligation_monitor` sob RLS; `test-finance-covenants.mjs`, `financial-covenants.sql`; falta cursor estável e DTO operacional opt-in |
| Detalhe de período — `EXISTING_VERIFIED` | GET `covenants/detail?id=UUID` | ID do período | DTO com medições, evidências, revisões e waivers; histórico acima de 500 falha explicitamente | Tabelas canônicas de covenant/obrigação; revisão independente e evidência não equivalem a conformidade automática |
| Registrar/revisar obrigação — `EXISTING_VERIFIED` | POST `covenants/open`, `/data`, `/review`, `/waiver`, `/decide-waiver`, `/cancel` | ver schema abaixo; identidade do objeto e versão/revisão esperada conforme comando | `{ok,id}`; 201; conflitos e papéis validados no banco | RPCs `fin_open_obligation`, `fin_record_obligation_data`, `fin_review_obligation`, `fin_covenant_waiver`, `fin_cancel_obligation`; sem sistema paralelo |
| Documento privado — `EXISTING_NEEDS_EXTENSION` | GET `private-documents` | `organization_id`, `entity_type`, `entity_id`; tipo rfq/proposal/contract/profile | `rows` com versões e `limits`; até 100 documentos/500 versões na leitura atual | `fin_private_documents`, `fin_document_versions`, Storage privado; `test-document-resource-limits.mjs`, `financial-document-upload-authorization.sql`; faltam paginação e cobertura granular |
| Envio/conclusão/download — `EXISTING_VERIFIED` | POST `private-documents/upload`, `/complete`, `/download`, `/remove` | ver schema abaixo | URL curta somente após autorização; completar exige objeto real com tipo/tamanho corretos | RPCs autorizam antes da assinatura/inspeção; corrida de revogação testada em `document-upload-authorization-race.mjs`; nenhuma URL privada é persistida no read model |
| Renovação — `EXISTING_VERIFIED` | POST `renewals`, `contract-renewal-rfq` | `organization_id`; apenas `contract-renewal-rfq` recebe também `contract_id` | `renewals`: `{ok,tasks_created}`; `contract-renewal-rfq`: `{ok,id}` da RFQ; recuperar vínculo antes de repetir | `financial-renewals.sql`, `financial-renewal-cycles.sql`, sondas concorrentes da integração; não inventar nova máquina de estados |
| Histórico de negociação — `EXISTING_NEEDS_EXTENSION` | GET `contract-negotiations` | `contract_id`; `after` UUID e `rfq_id` opcionais | `contract`, `versions`, `amendments`, `tasks`, `opportunities`, `processes`, `absence`, `next`, `consistency` | Eventos reais `rfq_created_from_contract`; leituras vivas, não snapshot transacional; demais coleções têm limites próprios |
| Relationship 360 — `EXISTING_NEEDS_EXTENSION` | GET `provider-relationship` | `organization_id`, `provider_id`; `include_crm=true`; `section=contracts|tasks`, `limit` 1..200 e cursor para continuação | contexto com `pages`, `coverage`, métricas factuais; seção devolve `{ok,rows,page}` | Fontes canônicas/RLS; cursor vinculado a org/provedor/seção; `financial-relationship-continuity.sql`, testes de portfolio; faltam novas seções e filtro coerente por entidade |
| Trabalho — `EXISTING_NEEDS_EXTENSION` | GET `tasks` | `organization_id`; `status`, `assignee_id` ou `unassigned=true`, `contract_id`, `limit` 1..200, `cursor`; `task_id` é consulta isolada | `{ok,rows,page:{limit,has_more,next_cursor}}`; responsável projetado só após task RLS | `fin_tasks` e membros da mesma org; `financial-task-accountability.sql`, `test-contract-lifecycle-api.mjs`; ampliar composição sem criar outra inbox |

## Schemas de escrita existentes

Contrato existente com recuperação de intenção (exemplo estrutural; UUIDs do
escopo autorizado substituem os placeholders):

```json
{"organization_id":"UUID","legal_entity_id":"UUID","provider_id":"UUID","product":"credit","title":"Linha registrada pela empresa","starts_on":"2026-01-01","ends_on":"2027-01-01","renewal_notice_days":60,"currency":"BRL","terms":{},"request_key":"UUID","owner_id":"UUID"}
```

`owner_id` no import exige chave de intenção. A mesma chave com dados distintos
é conflito, não novo contrato. Sem resposta, consultar `contract-import-result`
no mesmo escopo. Autorização e integridade são repetidas no SQL.

Obrigações: `open` recebe `contract_id`, `title`, `kind`, `source_clause`,
`source_reference`, `owner_id`, `frequency`, `first_period_start`,
`first_period_end`, `first_due_on`, `grace_days`, `due_soon_days` e, conforme
modalidade, `metric`, `operator`, `threshold`, `unit`, `currency`. `data` recebe
`period_id`, `measured_value`, `measured_on`, `source_reference`, `provenance`,
`document_id?`. `review` recebe `period_id`, `expected_review_id?`, `status`,
`reason`, `measurement_id?`, `evidence_id?`. Waiver registra motivo, controles e
validade; sua decisão usa `waiver_id` e `expected_version`. Cancelamento usa
`obligation_id`, `expected_version`, `reason`. RPCs definem obrigatoriedade e
segregação de funções; não aceitar revisão independente no cliente como prova.

Upload recebe `organization_id`, `entity_type`, `entity_id`, `title`,
`visibility`, `mime_type`, `size`, `sha256?`, `document_id?` para nova versão.
Resposta: `{ok,document_id,version,upload_url,expires_in,complete_within}`.
Enviar os bytes à URL antes de `complete` com `{document_id,version}`.
Download recebe `{document_id,version?}` e devolve `{ok,url,version,expires_in}`.
URLs expiradas exigem nova autorização; não manter URL assinada no estado salvo.

## Permissões, proveniência e falhas

Os comandos permanecem sujeitos a membership, entidade, papel, offboarding e
revisão independente em suas RPCs. Leitura autorizada não implica permissão de
escrita. O contrato de cada ação deverá expor permissão factual ou indicar que
a autorização será confirmada pelo comando; não adivinhar papel na interface.

Manter distinção entre declaração do comprador, comunicação enviada, resposta
de instituição, evidência documental, evento de auditoria e decisão humana.
Ausência de evidência é ausência, não conformidade, saldo zero ou participação
institucional confirmada. Não somar moedas nem projetar conversão fictícia.

Falhas: 400 entrada/cursor inválido; 401 sessão inválida; 403 papel/organização;
404 objeto indisponível sob RLS; 409 conflito/versão/cobertura; 413 arquivo grande;
429 com Retry-After; 5xx fonte/Storage indisponível. Códigos concretos atuais
incluem `contract_not_found`, `invalid_relationship_page`, `invalid_task_cursor`,
`obligation_not_found`, `obligation_coverage_limit`, `upload_not_pending`,
`upload_missing`, `upload_mismatch`, `storage_unavailable`. Não converter falha
em `rows:[]`. Uma leitura composta não é snapshot atômico entre requisições.

## Extensões propostas — ainda não consumíveis

Ordem: (1) seções operacionais paginadas de contrato e sinais determinísticos;
(2) Portfolio filtrado com base consultável e cobertura; (3) obrigações em DTO
operacional/cursor, documentos com paginação; (4) Relationship/Work reutilizando
os mesmos objetos, permissões e cursores. Classificação inicial:
`EXISTING_NEEDS_EXTENSION`; endpoints novos, se necessários, serão marcados
`NEW_IMPLEMENTATION_REQUIRED` até implementação e testes reais.

Não reservar nomes de campos propostos como contrato implementado. Cada seção
entregue atualizará este handoff com request/response, filtros, cursores,
negativos, evidência SQL e maturidade no SHA candidato. A composição visual e
o retorno ao contexto são `FRONTEND_ONLY`. Cutover e comprovação hospedada são
`BLOCKED_EXTERNAL` enquanto faltarem preservação, restore e autorização.

O seed paralelo em desenvolvimento preserva cinco histórias/API, identidades,
quotas e esperas; sincroniza reset e crons globais. Testes locais de coordenação
não provam ganho real nem equivalência hospedada. A integração do candidato
deverá provar todos os 41 checks em cada um dos cinco seeds, recuperação,
jornadas reais, quatro workspaces, teardown e os quatro contextos obrigatórios.
