# Platform Intelligence — contratos de backend, novembro/2026

Base reconciliada: `main@3a7d129581337930d6ffd84152ee15b410e54caa`, PRs
#293–#297 ancestrais; nenhuma PR aberta no início da execução (01/11).
Este documento descreve código da branch, não certifica deploy, execução de LLM
ou ERP externos, nem altera a aprovação normativa pendente do §45.

Ownership desta entrega: Codex em `lib/api/**`, `lib/finance/**`, SQL, testes e
neste contrato. Codex assume também `package.json`/lock e `.env.example` para
fixar AI SDK 7.0.159 e ligar as novas suites aos gates. Nenhum arquivo
`finance/src/**`, navegação ou configuração visual foi editado. Handoff para
Claude pela PR e este arquivo; não se presume que a integração visual ocorreu.

## Transporte, autorização e estados

Prefixo `/api/finance/`, sessão obrigatória, CSRF/escritas e rate limits já
vigentes. Leituras e RPCs usam exclusivamente o JWT da pessoa. Os novos
endpoints são BUYER, salvo as operações CRM anteriores que preservam suporte
PROVIDER. O CRM privado da instituição continua nos endpoints da #297; a nova
projeção da instituição é da carteira autorizada da compradora.

- 200: consulta/replay; 201: atividade criada.
- 400: entrada/filtro/cursor/versão ou cenário inválido.
- 401/403: sessão, organização, papel ou entidade não autorizados.
- 404: fonte/raiz ausente **ou oculta**, mesma resposta.
- 409: versão ou intenção idempotente conflitante.
- 429: limite de requisições, sem nova ação.
- 503: schema incompatível, LLM não configurado/indisponível, timeout,
  resposta não validada ou limite do Copilot.

Lista vazia é `rows:[]`; nunca interpretar erro como ausência. Após resposta de
escrita incerta, conservar intenção e `request_key`, consultar e repetir a mesma
intenção. Listas são vivas, sem isolamento de snapshot entre páginas.

## CRM: agenda, pipeline e contexto institucional

Comandos, permissões, eventos, versões e exemplos da #297 permanecem em
[FINANCIAL_CRM_V1.md](FINANCIAL_CRM_V1.md). Nenhum cadastro paralelo.

`GET crm-activities` e `GET crm-processes` acrescentam:

| Parâmetro | Contrato |
|---|---|
| `due_after`, `due_before` | datas ISO válidas, inclusivas, intervalo coerente |
| `sort` | `id.asc` (anterior) ou `due_on.asc.nullslast,id.asc` |
| `related_type` | provider, rfq, contract, opportunity, proposal, task |
| `process_id` | somente atividades, UUID canônico |
| `next_step=missing\|present` | somente processos; ausência/presença de **prazo** do próximo passo, não inferência sobre o texto |

Exemplo de agenda:
`GET crm-activities?organization_id=UUID&owner_id=UUID&status=planned&due_after=2026-11-01&due_before=2026-11-30&sort=due_on.asc.nullslast,id.asc&limit=25`.
A conclusão de atividade registrada continua sendo `status=recorded` com
`occurred_at`; cancelamento é `cancelled`, sem nova máquina financeira.
Cursor `after` vincula recurso/filtros/ordenação. Prazo nulo vem por último;
empates usam ID. Resposta anterior `{ok,api_version,rows,next,sort,notice}`.

`GET crm-institution-records?organization_id=UUID&provider_id=UUID` retorna
atividade e processo associados explicitamente à instituição, por vínculo direto,
contato, contrato ou processo relacionado. Não infere que todo convidado de uma
RFQ participa de uma atividade. A view `fin_crm_institution_records` usa
`security_invoker=true` e todas as fontes mantêm RLS. Nenhuma persistência nova.

Filtros: `legal_entity_id`, `owner_id`, `record_type=activity|process`,
`status` (exige tipo), `kind` (atividade), `stage` (processo), `due_after`,
`due_before`, `limit=1..100` (25), `after`. Campos repetidos/desconhecidos recusados.
Ordem `record_type.asc,id.asc`; cada cursor está vinculado aos filtros.

Resposta: `{ok:true,api_version:"financial-crm-institution-v1",rows,next,sort,
coverage:"explicit_institution_associations",notice}`. Cada linha inclui `id`,
`record_type`, `title`, `kind|stage`, `status`, `owner_id`, `due_on`, `next_action`,
`version`, `source_reference`, entidade e `provider_ids` derivados. A resposta não
é uma contagem global. Continuar até `next=null` para consumir o recorte inteiro.

`GET provider-relationship?...&include_crm=true` e
`GET graph/provider?...&include_crm=true` compõem essa projeção. Coleções possuem
`rows`, `has_more`, `limit`, `coverage` e `continuation:{resource,filters,sort}`.
Para continuar, consultar o recurso indicado desde a primeira página e usar seus
cursors; o resumo não promete um cursor inicial. Atividades mantêm `subject`
compatível, além de `title`. Contatos usam a lista canônica.

## Product Intelligence: termos especializados no contrato canônico

`GET product-registry` acrescenta `specialized_schema` (ou null): versão, modalidade,
categoria, família, campos, rótulos, tipos, obrigatoriedade, unidade, limites,
precisão, convenções, fonte, metodologia e limitações. Fonte JS única:
`lib/finance/product-terms.mjs`; SQL é gerado por
`node scripts/platform-intelligence/generate-product-terms-sql.mjs` e o CI exige
`--check`. Não duplicar validação econômica no frontend.

Modalidades: `bank_guarantee`, `fx_spot`, `fx_forward`, `ndf`, `swap`. Categoria
canônica `guarantee` para fiança, `fx` para as demais (preserva a taxonomia vigente).
O catálogo genérico de campos usado pelo editor antigo não recebe o novo tipo
objeto. A metadata especializada é separada; até o renderer de Claude estar
integrado, esse editor não apresenta os campos especializados. Após registrar
esses termos via API, qualquer nova versão deve preservá-los explicitamente;
o banco recusa omissão com 409 `specialized_contract_terms_required`, evitando
perda silenciosa por cliente antigo. Nenhuma foi habilitada para RFQ. Não há curva, preço justo ou marcação a mercado.

Nos comandos **existentes** de importação/versão/aditivo de contrato, enviar:

```json
{"currency":"BRL","product_terms":{
 "schema_version":"financial-product-terms-1","modality":"bank_guarantee",
 "values":{"source_reference":"Cláusula da comissão","beneficiary":"Beneficiário informado",
 "currency":"BRL","guaranteed_amount":1000000,"valid_from":"2026-01-01",
 "valid_until":"2027-01-01","commission_pct_year":2,"day_count":"ACT/365F",
 "upfront_fee":100,"other_expenses":50}}}
```

Este objeto é `terms`, não um corpo de criação completo. Usar a API canônica de
contratos para a identidade, entidade, instituição, versão esperada e autoria.
Valores vêm de fonte declarada, não de extração automaticamente confirmada.
Campo desconhecido, obrigatório ausente, tipo incorreto, data impossível, par de
moedas iguais, fixação após liquidação, modalidade incompatível e moeda
contraditória são recusados. Dinheiro tem duas casas, taxas até oito. O banco
repete a validação em trigger sobre `fin_contract_versions`, inclusive RPC direta.
Versões anteriores permanecem imutáveis; aplica-se a concorrência canônica.

## Economics: fiança bancária

`POST guarantee-economics`:

```json
{"organization_id":"00000000-0000-4000-8000-000000000001",
 "sources":[{"contract_id":"00000000-0000-4000-8000-000000000002","version":1}],
 "scenarios":[{"label":"Base","period_start":"2026-01-01","period_end":"2027-01-01",
 "currency":"BRL","guaranteed_amount":1000000,"source_reference":"Cenário informado"}]}
```

Até dez fontes e dez cenários; fontes persistidas na mesma organização e mesma
entidade (grupo null distinto de entidade). Sem termos financeiros arbitrários no
request. Resultado `analysis` tem metodologia `bank-guarantee-explicit-cost-v1`,
fontes navegáveis/versionadas, cenários declarados, componentes, entradas,
fórmula, convenções, limites e incomparabilidade com `total:null`.

Comissão = base constante × taxa anual/100 × dias reais/base (360 ou 365).
Período semiaberto `[início,fim)`, datas UTC. Despesas iniciais somente quando o
cenário começa em `valid_from`. Componentes arredondados a centavos; comissão
calculada com inteiros/racionais. Exemplo acima: 20.000 + 100 + 50 = 20.150 BRL.
Não há normalização cambial; moeda divergente, janela fora da validade, valor
acima da garantia ou precisão insuficiente impedem total. Comparação é de
**versões declaradas em cenário**, não atestado de condição atual ou proposta
institucional. Não gera ranking, decisão, contrato ou ledger de economia.

## Copilot generativo

`POST copilot/ask` recebe somente `{organization_id,question}`. Até 3.000
caracteres. Sem histórico persistido: não aceitar histórico do navegador como
fonte financeira autorizada. Uma próxima pergunta consulta novamente as fontes.
Sem vetores e sem cópia de documentos.

Provedor inicial: Vercel AI Gateway via `ai@7.0.159`, atrás de `copilotProvider`;
orquestração por `ToolLoopAgent`, independente da interface. Configuração somente
no servidor: `ARANDU_COPILOT_PROVIDER=vercel_gateway`,
`ARANDU_COPILOT_MODEL=provider/model`, `ARANDU_COPILOT_DATA_AGREEMENT=signed`,
`AI_GATEWAY_API_KEY`. Modelo deve suportar ferramentas e ser autorizado pelo
operador; não existe modelo padrão inventado. Demo bloqueia saída mesmo com
credencial. Sem configuração completa: 503 `copilot_not_configured`.

Ferramentas fechadas: `read_financial` (instituições por nome, contratos, CRM, RFQs, propostas,
oportunidades, tarefas), `contract_terms` (versão explícita), `financial_graph`,
`institution_crm` (contexto institucional autorizado), `contracts_expiring`
(janela relativa calculada pelo servidor em UTC), `compare_guarantees` (motor
determinístico acima; cenários preparados pelo Copilot identificados como tais) e `prepare_activity` (sem escrita).
Organização e JWT são capturados pelo servidor; o modelo não recebe SQL,
credencial, URL arbitrária ou ferramenta de execução. Paginação e truncamentos
continuam explícitos. Texto da pergunta e fontes é dado não confiável.

Até 6 ferramentas, 5 passos, 1.600 tokens de saída por passo, 48 KB de resultados,
25 s por geração, sem retry do modelo; orçamento de contexto é verificado antes
de cada passo. Rate limit adicional: 10 perguntas/pessoa e 20/organização por dez
minutos. Estes limites restringem custo por chamada; orçamento financeiro global
deve ser configurado no Gateway antes de operação. Métricas registram somente
resultado, duração, chamadas, bytes e uso de tokens; nenhum prompt, resposta,
nome, valor financeiro ou identificador de organização é logado.

Resposta: `{ok,api_version,state:"completed",answer,sources,prepared_actions,
provider,model,usage,limits,persistence:"not_persisted",notice}`. `sources` traz
identidade tipada, rótulo, versão/data quando disponível, informação utilizada e
link canônico. IDs citados precisam existir nos resultados de ferramenta; sem
fontes o backend devolve ausência de evidência, não fatos livres do modelo.
A validação de IDs **não é prova automática de verdade semântica** do resumo;
a UI deve exibir as fontes junto do texto gerado e renderizá-lo como texto seguro.
Falhas não são convertidas em resposta determinística apresentada como LLM.

`prepare_activity` devolve payload validado para revisão; `confirmation_required`
é true. O usuário envia **após revisão** `POST copilot/confirm` com o payload,
`legal_entity_id` quando aplicável, e `confirmation:true`. A RPC canônica
`fin_crm_command` valida novamente vínculo, fonte, owner, membership, entidade,
estado e intenção idempotente; replay devolve 200. O LLM não tem a ferramenta de
confirmação. Nenhum e-mail é enviado. Outros tipos de ação e histórico de
conversações continuam pendentes, sem claims de implementação.

## Rollout, rollback, testes e handoff

Migration aditiva `supabase-financial-platform-intelligence.sql` após CRM; marker
`financial-platform-intelligence-1`, manifest, doctor, probes e canário alinhados.
Sem novas tabelas. Classificação da view derivada registrada; termos e eventos
herdam retenção, export e hold dos objetos canônicos. Rollback remove a view e
retira escritas especializadas, preservando versões/histórico; publicar app
compatível antes. Não aplicar automaticamente em ambiente hospedado.

Suites: `test-financial-crm`, `test-financial-copilot`,
`test-platform-intelligence-api`, `test-product-intelligence` e geração `--check`
no `check:finance`. SQL: `financial-crm-institution.sql`,
`financial-product-terms.sql`, paridade de 118 casos; suites e concorrência CRM
anteriores preservadas. Runner completo cobre clean/upgrade/reapply/rollback.
Modelos e HTTP simulados são identificados nos logs; provas SQL são separadas.
Resultado final e SHAs ficam na PR/evidência, nunca inferidos pela presença do teste.

Claude: consumir `specialized_schema`, conservar contexto/versão/fonte; mostrar
limitações junto ao custo; manter confirmação humana e formulário após falha;
continuar listas por seus endpoints; preservar estado financeiro distinto do CRM.
Não há frontend novo nem validação visual destas capacidades nesta entrega.

Continuidade ainda em execução: ERP/ingestão com prévia e confirmação; jornadas
transversais ampliadas; testes Auth/PostgREST/Storage canônicos e chamada LLM real
somente com acesso legítimo. Esta entrega não declara Platform Intelligence 2.0
integralmente concluída.
