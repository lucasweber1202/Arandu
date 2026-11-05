# Contratos de interoperabilidade — backend operacional v8

Checkpoint atualizado em 05/11/2026. Base inicialmente auditada
`9910408244bfb122e5d62a77c692928958ce77bd`; #328 reconciliada em
`8837d8fb3d34f789a6a8a3134496097939eda3db`. Este handoff distingue a API
da main das extensões implementadas na branch candidata v8. Não é alegação
de implantação hospedada ou conclusão da missão.

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

## Extensões implementadas na candidata v8 — M1, não publicadas na main

Classificação da lacuna na base: `EXISTING_NEEDS_EXTENSION`, ou
`NEW_IMPLEMENTATION_REQUIRED` para `portfolio/context`. Os contratos abaixo
agora têm implementação e testes locais; a classificação não é uma promoção
para M2. Integração HTTP/Auth/Storage efêmera e CI do SHA candidato permanecem
pendentes. O consumidor só deve usar estas extensões após integrar a candidata.

Todas são GET no prefixo `/api/finance/`, com sessão/JWT do usuário. Leitura de
BUYER exige membership; o banco aplica entidade/objeto a cada consulta. Um
cursor nunca autoriza acesso. As novas páginas usam `limit` 1..50 (padrão 25),
`page:{limit,has_more,next_cursor}` e
`consistency:"live_reads_not_transaction_snapshot"`. Continuar com todos os
mesmos filtros e `cursor=next_cursor`; mudanças de escopo/usuário são 400.
`coverage.complete` em páginas só é verdadeiro quando a primeira página contém
toda a coleção. Não somar páginas como snapshot nem tratar uma página como total.

| Método/endpoint candidato | Entrada | DTO e fonte canônica | Limites e testes |
| --- | --- | --- | --- |
| GET `contract-detail` com `section` | `id`; `section=documents\|obligations\|tasks\|milestones\|renewals`; tarefas aceitam `status=open\|done\|cancelled\|all` (padrão open), marcos scheduled/done/cancelled/all | `{ok,contract,section,rows,page,coverage,consistency}`; pai autorizado antes dos filhos. Documentos diretos e da proposta adjudicada, obrigações/facts do monitor, tarefas e marcos existentes; renovação usa eventos reais e RFQ autorizada | 50/página. `test-financial-operating-api.mjs`; `financial-operating-context.sql` |
| GET `contract-detail` sem section | `id`, API anterior preservada | Acrescenta `coverage`, `owner_context`, `information_quality`, `next_actions`; qualidade determinística, responsável avaliado apenas em membership/papel/entidade; comando revalida elegibilidade completa | Sentinelas explicitam truncamento; consulta separada preserva termos vigentes mesmo com 100 versões futuras. Sem inferência de conformidade ou risco jurídico |
| GET `portfolio/context` | `organization_id`; filtros `provider_id`, `legal_entity_id`, `contract_id`, `facility_id`, `product`, `facility_kind`, `currency`, `status`, `guarantee_status`, `maturity_from/to`, `horizon_months` (3/6/12/18/24/36) | `{ok,scope,views,drilldowns,coverage,consistency,boundary}`; cálculos canônicos, moedas separadas, último saldo autorizado e cronograma vigente. Filtros aplicados antes da leitura | Agregado até 2.000 facilities/garantias e 20.000 parcelas; exceder falha 422 `portfolio_context_coverage_limit` antes de devolver totais |
| GET `portfolio/context` com section | mesmos filtros; `section=facilities\|guarantees` | `{ok,scope,section,rows,page,coverage,provenance,consistency}`; facility inclui `latest_balance` e `balance_state` | Até 50/página, sem limite de 2.000 para percorrer páginas; data nula ordenada por último e UUID desempata |
| GET `covenants?format=records` | `organization_id`; `contract_id`, `provider_id`, `legal_entity_id`, `obligation_id`, `owner_id`, `status`, `due_from/to` opcionais | `{ok,rows,page,scope,work_items,coverage,provenance,consistency}`; período mantém ID, obrigação/contrato/entidade/provedor, fonte/versão, prazo/responsável/task e `facts` calculados no banco | Cursor due_on/id; `after` legado recusado neste formato. Revisão humana continua obrigatória |
| GET `covenants/detail?format=records` | `id` do período | Registro canônico com medições/evidências/revisões/waivers existentes; não exige listas de apresentação | Acima de 500 por coleção falha explicitamente; formato antigo preservado |
| GET `private-documents/versions` | `organization_id`, `document_id` | `{ok,document,rows,page,coverage,consistency}`; metadados de versões reais pending/available/failed, autor/data/tamanho/tipo/hash declarado | Até 50/página, version desc. Não expõe bucket/path/URL. Download continua pelo comando autorizado |
| GET `provider-relationship` com novas sections | `organization_id`, `provider_id`, `section=facilities\|obligations\|documents`; `legal_entity_id` opcional | Facilities/obrigações delegam os mesmos leitores acima, sem CRM descartado. Documento mantém ID canônico e `reference:{type:"document_contract_link",document_id,contract_id}` | Cobertura documental conta associações documento–contrato, não documentos únicos; cursor composto evita perder associações |
| GET `provider-relationship` sections anteriores | `section=contracts\|tasks` | Acrescenta filtro `legal_entity_id` vinculado ao cursor; contrato anterior preservado sem filtro | `legal_entity_id` sem section é 400 `relationship_entity_requires_section`, nunca ignorado |
| GET `tasks` | filtros existentes | Sem nova inbox; cursor de lista não contratual agora vinculado a organização/status/responsável/unassigned | Reutilizar cursor com filtro distinto é 400; listas contratuais preservadas |

Exemplo de continuação, usando IDs e cursor retornados pela sessão autorizada:

```text
GET /api/finance/contract-detail?id=<contract-id>&section=documents&limit=25
GET /api/finance/contract-detail?id=<contract-id>&section=documents&limit=25&cursor=<next_cursor>
GET /api/finance/portfolio/context?organization_id=<org-id>&legal_entity_id=<entity-id>&currency=BRL
GET /api/finance/covenants?format=records&organization_id=<org-id>&contract_id=<contract-id>&status=awaiting_data
```

No novo agregado, `outstanding`, `used_limit`, `available_limit` e `committed`
são null quando falta cobertura dos valores correspondentes. Campos
`recorded_outstanding`, `recorded_used_limit`, `recorded_available_limit` e
`recorded_committed` são somas parciais dos registros conhecidos, não o total
financeiro da empresa. Não há conversão cambial. Garantias associadas não são
alocação financeira. Os drilldowns apontam registros ativos que contribuem para
os cálculos canônicos. APIs antigas mantêm seus contratos.

`source_relation`, IDs e versões preservam proveniência. Documento disponível
não é validação jurídica; SHA é declarado na API existente, sem promessa de
verificação server-side dos bytes. A jornada efêmera nova compara os bytes do
seu próprio upload com download real; execução ainda pendente. Nova versão
pending não oculta uma versão available anterior. Falha de fonte não vira vazio.

Persistência aditiva: cinco views security_invoker/security_barrier em
`supabase-financial-operating-context.sql`, marker `financial-operating-context-1`,
rollback registrado e índice de paginação `(organization_id,maturity_on,id)`;
nenhuma tabela ou máquina de estados paralela. Escritas
continuam nas RPCs existentes, incluindo segregação de funções e replay de
renovação. #328 foi preservada; sinais de janela reutilizam `renewalPosition`
e `CONTRACT_EXCEPTIONS`, sem editar views/CSS/E2E de Claude.

Na página de facilities com filtros nativos, a fonte canônica seleciona os IDs
e o cursor antes de enriquecer até 50 registros pela view com o mesmo JWT e
filtros. São duas leituras autorizadas, sem N+1. Revogação entre elas remove os
registros do resultado e marca `coverage.changed_during_read=true`, mantendo
a continuação da fonte e `complete=false`. Com filtro `product`, o filtro
relacional continua na view antes da página; esse caminho não herda a melhoria
medida para filtros nativos. Garantias também preservam seu caminho.

A composição visual e o retorno ao contexto são `FRONTEND_ONLY`. Cutover e
comprovação hospedada são `BLOCKED_EXTERNAL` enquanto faltarem preservação,
restore e autorização. Testes SQL locais e fixtures HTTP não substituem
Auth/Storage reais nem promovem M3.

O seed paralelo em desenvolvimento preserva cinco histórias/API, identidades,
quotas e esperas; sincroniza reset e crons globais. Testes locais de coordenação
não provam ganho real nem equivalência hospedada. A integração do candidato
deverá provar todos os 41 checks em cada um dos cinco seeds, recuperação,
jornadas reais, quatro workspaces, teardown e os quatro contextos obrigatórios.
