# Arandu 9.1 — contrato de integração v1.3

Base comum: `4f9e01b27ec33359cfe2a7b07e26af926c4fe6aa`. Coordenação: issue #334.
Proprietário: Codex. Frontend: Claude em `claude/sweet-gates-epqu3i`.
Este contrato documenta interfaces existentes; não declara operação comprovada.
Mudanças incompatíveis exigem nova versão e comentário na issue antes do consumo.

## Transporte e autorização

Prefixo `/api/finance/`. JSON UTF-8. Respostas de sucesso têm `ok: true`;
erros têm `ok: false`, `code`, `error`. Usar `code`, nunca interpretar a mensagem.
Sessão pelo cookie assinado `arandu_session` obtido no login existente; escritas
exigem Origin permitido (usar o cliente existente). Não enviar service role ao browser.
Metadados `GET products` são públicos; demais operações exigem sessão válida.
Consultas/RPCs usam JWT do usuário e RLS; `organization_id` não concede acesso.
Papéis/escopo de entidade são conferidos no banco. Comprador não se passa por
instituição; instituição só vê RFQs aceitas e suas propostas, nunca concorrentes.
401: autenticar novamente; 403: sem papel/escopo; 404: ausente ou invisível;
409: estado/versão conflitante, recarregar antes de decidir; 429: respeitar retry;
503: serviço indisponível, preservar entrada. Não repetir mutações cegamente.

## Jornada canônica

| Método e recurso | Entrada | Saída útil / persistência |
| --- | --- | --- |
| GET products | — | `products[]` com `demand_fields`, `proposal_fields`, `comparable_fields`; `states`, `notice` |
| POST rfqs | `organization_id, product, title, demand`; opcionais `description, response_deadline, legal_entity_id, passport_fields, request_key` (UUID) | 201 `{id,warnings}`; replay 200 `{id,replayed:true,warnings:[]}`. RFQ draft + revisão/snapshot e evento |
| GET rfqs | `organization_id`, opcional `legal_entity_id` (UUID ou `group`) | `{rows,next_states}`. Legado limitado a 100; **não é carteira completa** |
| GET rfq/:id | UUID na URL | `{rfq,invites,proposals,next_states,notice}`. Convites incluem `provider_name`; propostas incluem termos/histórico autorizados; excesso de cobertura recusa explicitamente |
| PATCH rfqs | `rfq_id,expected_revision,title,description,demand,response_deadline` | `{revision,warnings}`; revisão antiga recusada |
| GET rfq-revisions | `organization_id,rfq_id`; opcionais **ambos** `from_revision,to_revision` | `{rows:[{revision,snapshot,changed_by,published_at}]}`; sem par retorna últimas 20 |
| POST transition | `kind,id,from,status` | transição validada pelo servidor e banco; usar apenas `next_states` disponibilizados |
| POST invites/send | `rfq_id,provider_id` | 201 `{invitationToken,recipient_mode}` (`exact_email` ou `organization_open`). Token é segredo: não registrar em logs/issue |
| POST invites/accept | `token,provider_organization_id` | `{inviteId}`; vínculo à organização provedora autenticada, expiração/uso controlados no banco; recusa genérica `invite_invalid` |
| GET invites | `organization_id` | `{rows}` (máximo legado 100), IDs e estado, sem token |
| GET proposals | `organization_id`, opcional `rfq_id` | `{rows}`; sem RFQ é portal da instituição (máximo 100 propostas, 500 versões na leitura legada) |
| POST proposals | `proposal_id,terms,note?` | 201 `{version}`; produto vem da proposta persistida; snapshot versionado + evento |
| DELETE proposals | `proposal_id` | `{ok:true}`; retirada sob autorização |
| POST comparison | `rfq_id,weights?` | `{comparison,weighted,criteria}`; sem pesos explícitos não há ranking; ausente não equivale a zero |
| POST approvals/request | `rfq_id,proposal_id,rationale`; `assignments` (policy) **ou** `approver_ids` (1–5) | 201 `{id,engine}` (`policy`/`manual`); política/segregação avaliadas no banco |
| POST approvals/act | `request_id,action,comment?,reason_code?` | `{status}`; action `approved`, `rejected`, `changes_requested`; somente etapa ativa ou delegação vigente; `not_your_step` em recusa |
| GET approvals | `organization_id` e filtros existentes da tela | `{rows}` com etapas, plano e contexto da proposta; consultar policy antes de decidir |
| POST decisions | `rfq_id,proposal_id,expected_version,rationale,criteria?` | 201 `{id}`; fotografia da proposta/versionamento e decisão humana; versão ausente recusa `expected_version_required` |
| GET decisions | `organization_id,rfq_id?` | `{rows}`; com RFQ inclui `selected_proposal` (`version,terms,...`) e `contract`; contexto duplicado recusa 409 |
| POST contracts | `decision_id,starts_on,ends_on`; opcionais `renewal_notice_days` (0–3650, padrão 60), `cost_summary,main_conditions,document_reference` (https) | 201 `{id}`; contrato canônico vinculado à decisão/proposta/instituição, sem assinatura automática |
| GET contracts | `organization_id,paged=1,limit?,after?` e filtros `provider_id,legal_entity_id,product,status,owner,q` | `{rows,next,limit}`; percorrer `next` até null, enviando `after=next` (limite 1–100). Sem `paged=1` é legado limitado a 100 |
| GET contract-detail | `id`; `section?` | contexto do contrato canônico, versões, termos efetivos, marcos, origem, responsável e cobertura; seções independentes usam o mesmo JWT |
| GET provider-relationship | `organization_id,provider_id` | relacionamento, contratos/atividades da mesma instituição; não duplicar contratos no cliente |
| GET portfolio/context | filtros de contexto da carteira | carteira canônica com cobertura, filtros e escopo; preferir ao agregado legado `portfolio` para a jornada completa |
| GET tasks | `organization_id`; opcionais `contract_id,status,assignee_id,unassigned=true,limit,cursor` | lista paginada; limite 1–200, cursor vinculado ao escopo/filtros; `task_id` consulta isolada e incompatível com filtros da lista |

As chaves de paginação/filtros e DTOs extensos são definidos nos helpers executáveis
`lib/api/domains/finance-contract-sections.mjs`, `finance-portfolio-context.mjs`,
`finance-tasks.mjs`, `finance.mjs` e nos consumidores existentes. Não inventar
campos a partir deste resumo: estender esta v1 se uma lacuna impedir o consumo.

## Documentos privados

Usar `private-documents`, nunca transformar URL temporária em referência permanente.
GET com `organization_id,entity_type,entity_id` lista documentos e versões autorizadas.
POST `private-documents/upload`: `organization_id,entity_type,entity_id,title,
visibility,mime_type,size,sha256?,document_id?` → 201 `{document_id,version,
upload_url,expires_in,complete_within}`. PUT dos bytes na URL assinada; POST
`private-documents/complete` com `document_id,version` → `{status:'available',...}`.
POST `private-documents/download` com `document_id,version?` → `{url,version,expires_in}`.
POST `private-documents/remove` com `document_id` → `{ok:true}`. Nova versão usa
`document_id` no upload. Completar sem objeto, reserva vencida, MIME/tamanho divergente
ou acesso indevido deve falhar. Storage privado e metadados são autoridades distintas.

## Estados, concorrência e repetição

RFQ: draft → open/cancelled; open → collecting/cancelled;
collecting → comparing/cancelled; comparing → decided/collecting/cancelled;
decided → contracted/closed; contracted → closed. closed/cancelled são terminais.
`decided` e `contracted` dependem das operações canônicas, não de atalhos visuais.
Proposta: draft → submitted/withdrawn; submitted → revised/withdrawn;
revised → revised/withdrawn; withdrawn terminal.
Contrato: active → renewing/expired/terminated; renewing → active/expired/terminated.
Fonte executável: `lib/finance/workflow.mjs`; banco reafirma regras e pré-condições.

RFQ usa `request_key` por intenção e recibo persistido; revisão usa expected_revision;
decisão usa expected_version, snapshot e locks. Repetir criação de RFQ pode retornar
ID existente. Não presumir replay seguro de **todas** as demais operações: submissão
pode gerar nova versão; convite pode rotacionar token. Após resposta perdida, consultar
estado persistido antes de repetir. O ensaio real desta missão comprova replay de sessão revogada, paginação e cron concorrente; concorrência e replay de decisão/contrato também têm cobertura SQL existente, registrada separadamente da API.

## Exemplo sintético mínimo

1. Autenticar comprador e instituição usando login existente; obter organizações reais.
2. Consultar `products`; escolher modalidade e campos aceitos.
3. POST rfqs `{organization_id:'<buyer UUID>',product:'credit',title:'Capital sintético',demand:{},request_key:'<UUID da intenção>'}`. Ajustar produto/demanda pelo catálogo; placeholders não são dados válidos.
4. Abrir RFQ pelo fluxo de transição existente; enviar convite à instituição cadastrada.
5. Instituição autenticada aceita token, recupera proposal_id e submete termos do catálogo.
6. Comprador compara, solicita aprovação, aprovador distinto atua; comprador registra decisão com expected_version visto.
7. Registrar contrato com decisão e datas; recarregar Contract 360, Portfolio, Relationship e tarefas a partir dos IDs persistidos.

## Matriz inicial de evidência / lacunas

| Etapas | Classificação inicial | Evidência / próximo passo |
| --- | --- | --- |
| RFQ, convite, propostas, comparação, aprovação, decisão, contrato | NÃO VERIFICADA operacionalmente nesta missão | rotas/RPCs e `scripts/pilot-local/journey.mjs` preexistentes; executar stack real antes de classificar funcional |
| Documentos, histórico, tarefas, renovação | NÃO VERIFICADA operacionalmente nesta missão | ensaio real existente cobre Storage/cron/ataques; executar |
| Contract 360, Portfolio, Relationship, Caixa de Trabalho | IMPLEMENTADA, MAS NÃO INTEGRADA nesta entrega | contratos/contextos existentes; falta readback cruzado do mesmo contrato e frontend Claude |
| Paginação | PARCIAL | contratos/tarefas têm percurso paginado; RFQs/convites/propostas ainda expõem leituras legadas limitadas sem cobertura completa |
| Multi-tenant, instituições, revogação, concorrência | NÃO VERIFICADA nesta missão | testes existentes não substituem execução nesta base |
| Hospedados | NÃO VERIFICADA | sem mutações; preservar legado e bloqueio de cutover |

Extensão retrocompatível v1.1: `GET rfqs?organization_id=<UUID>&paged=1` aceita
`legal_entity_id` (UUID ou group), `status`, `product`, `limit` (1–100, padrão 25)
e `cursor`. Retorna `{ok,rows,next_states,page:{limit,has_more,next_cursor},consistency}`.
Usar `cursor=page.next_cursor` mantendo todos os filtros; cursor é vinculado a
usuário/organização/filtros. Ordem estável por id asc; leituras são vivas, sem
snapshot entre páginas. Não há total global inferido da página. Sem `paged=1`,
o contrato legado permanece. Convites/propostas legados ainda têm cobertura limitada.

Não há endpoint novo nesta versão. Claude deve registrar na issue #334
qualquer impedimento concreto de interface e publicar seu SHA/base antes da integração.

## Evidência do checkpoint v1.1

`docs/integration/evidence/ARANDU_9_1_REAL_JOURNEY.md`: 27 etapas e 64 ataques via API/Auth/RLS/Storage
reais, sem falhas. Inclui readback da carteira contratual (`contracts?paged=1`),
Contract 360, instituição, tarefa atribuída/concluída, documentos e renovação.
Portfolio de facilities é outra visão: só contém facilities registradas, não se
deve fabricar uma facility para fazer um contrato de serviço aparecer nela.
Frontend e quatro gates no SHA integrado continuam pendentes da entrega Claude.
A matriz inicial acima permanece como baseline anterior à execução, não como
classificação atual da evidência local.

## Extensão v1.2: listas institucionais e links

`GET invites` e `GET proposals` sem `rfq_id` aceitam `paged=1`, `limit`
(1–100, padrão 25), `cursor` e `status`. Convites: invited/accepted/declined/revoked/expired;
propostas: draft/submitted/revised/withdrawn. Rejeitam chaves desconhecidas/duplicadas.
Resposta `{rows,page:{limit,has_more,next_cursor},consistency}` com ordem id asc,
JWT/RLS em toda página e cursor vinculado a usuário, organização e status.
Convites preservam o OR comprador/provedor dentro de AND com a continuação.
Propostas exigem organização PROVIDER e retornam `current_snapshot` (null no
rascunho sem envio), mais `coverage.history=current_snapshot_only`; não retornam
histórico nem termos fabricados. O detalhe existente é `assignments?proposal_id=<id>`.
Versão atual ausente/conflitante recusa `409 proposal_snapshot_conflict`.
Sem `paged=1` contratos anteriores preservados. Leituras vivas, sem total global.

Migration adicional `supabase-financial-contract-email-links.sql` altera apenas a
função de enqueue e marker: novos avisos de contrato usam
`contracts.html?abrir=contrato#contract-<id>`. Payloads já enfileirados não são
reescritos; baseline histórico preservado; rollback restaura definição anterior.
Aplicação hospedada continua dependente de autorização específica.

### Consumo efetivo na interface

`organizations.capabilities.operational_pagination=true` anuncia a extensão.
A lista de RFQs evita `overview` e lê `rfqs?paged=1&context=1` por páginas de 25.
`context=1` acrescenta somente convites/propostas (IDs, estado, versão/revisão),
aprovação pendente e decisão da página; não transfere termos nem histórico.
A continuação é vinculada também à opção context; contexto fora do limite recusa
`422 rfq_context_coverage_limit`, snapshot ausente recusa 409. Mudar status, produto
ou entidade reinicia o cursor. Busca/owner/vez/ordenação são explicitamente locais
à página. Falha de continuação mostra erro e retry, nunca falso fim. Sessão expirada
e acesso recusado são estados distintos. Cursors emitidos antes desta extensão
podem exigir recarregar a primeira página após deploy (400 estruturado).

`assignments?paged=1` usa o mesmo escopo e controles das propostas, com DTO existente
de oportunidade e snapshot atual; proposta exata continua com histórico no contrato
legado. O portal institucional consome páginas de 25, com erros e continuidade.
O resumo inicial legado informa cobertura limitada e remete à lista paginada.
`overview.coverage` declara os limites de suas coleções; quando alcançados, a tela
mostra que contagens/indicadores consideram somente o recorte carregado.

### Reprodução local

Após preparar as dependências e a stack descartável pelos scripts existentes:

```sh
npm run pilot:local:up
PILOT_BROWSER_JOURNEY=1 npm run pilot:local:journey
```

O passo opcional de Chromium usa a API e o backend reais, sem interceptar rotas.
Cookies/senha sintéticos ficam em memória, sem traces ou arquivos de sessão.
Prepara 101 RFQs pela RPC SQL autorizada do comprador para escala, separadamente
das duas RFQs da jornada API. Confere IDs, continuidade, link da outbox renderizado,
Contract 360, tarefas, relacionamento, isolamento e logout/login. Não é alegação de
que todas as mutações da jornada API foram feitas por cliques no navegador.

`ARANDU_DATABASE_TEST_URL=<loopback> node scripts/benchmark-institutional-snapshots.mjs`
compara snapshots equivalentes com históricos de 10/100/1000 versões, planos e
buffers. Não mede HTTP/RLS/Auth/Storage nem capacidade hospedada.

## Extensão v1.3 — checkpoint Claude 2

`bf00b0b812da68565ab233c2d6787e66d20e0638` integrado com autoria preservada.
A renderização de RFQs do Claude é a base da resolução da sobreposição: carrega
mais de forma cumulativa, mantém linhas em erro de continuação e declara cobertura
incompleta. Troca de filtros descarta cursor/respostas antigas. Não depende de
overview para contexto quando `context=1` retorna convites/propostas da página.

RFQs aceitam `order=id_asc|created_desc|deadline_asc` (padrão id_asc para legado).
created_desc ordena created_at desc/id desc; deadline_asc ordena response_deadline
asc nullslast/id asc. Cursor vinculado à ordenação; datas ausentes ficam no fim.
`legal_entity_id=<UUID>&include_children=1` inclui a entidade e descendentes visíveis
via RLS (limite explícito de 500 entidades na resolução). Entidade invisível recusa
404; árvore maior recusa 422. Cursor também é vinculado ao conjunto de descendentes:
mudança de estrutura exige reiniciar a primeira página. group não aceita include_children.
Contexto acrescenta owner_name/invites_count e continua sem termos/histórico;
nomes ausentes são null. Filtros inválidos/duplicados e modo paged diferente de 1
são recusados. Interface usa deadline_asc/created_desc no servidor, inclusive na
continuação; ordenação por quantidade de respostas continua local às carregadas.

## Extensão v1.4 — atualidade de aprovações

`GET approvals` informa `stale`, `stale_reason`, `expired` e `freshness` a partir
da RFQ e da proposta atual visíveis ao usuário, usando seu JWT e precisão de
microssegundos para a data da RFQ. Contexto ausente ou inelegível fecha a leitura
como desatualizada; aprovações históricas mantêm seu registro. `viewer_can_act`
fica falso quando desatualizada ou expirada, assim como o indicador pendente nas
páginas de RFQ e no resumo. Esses indicadores são diagnósticos de leitura: as
travas e validações transacionais do banco continuam sendo a autoridade na escrita.
Snapshots institucionais são buscados em lotes de até 50 IDs.
