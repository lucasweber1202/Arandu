# Ingestão financeira e Dynamics — contratos de novembro/2026

Entrega de backend, sem UI ou provedor externo comprovado. Reutiliza
`fin_fee_observations`, `fin_fee_variances`, revisão humana e `fin_events` para
histórico/recibos/configuração versionada. Não cria tabelas, razão geral, contas
bancárias paralelas ou duplicação de contratos. Complementa o contrato do pacote
Platform Intelligence; para integração, a migration de ingestão vem depois dele.

## Autorização e transporte

Prefixo `/api/finance/`; sessão/CSRF/rate limits vigentes, JWT da pessoa em todas
as leituras/RPCs. Somente organização BUYER. Escrita/importação:
admin/finance_manager no escopo do contrato; configuração ERP: admin. O banco
revalida membership, entidade, offboarding, contrato e intenção após locks.
Viewer/analyst podem consultar fontes autorizadas e a prévia de arquivo, mas não
confirmam importação; consulta externa exige admin/finance_manager.

Em `fee-imports/confirm`, após confirmar a organização e antes de processar o
arquivo/seleção, a API recusa papel sem escrita com **403 `forbidden`**, inclusive
seleção malformada. A prévia de arquivo permanece disponível para leitura.
`line` começa em 2 para o primeiro registro após o cabeçalho; testes de papel
devem selecionar uma linha confirmável da prévia, sem confundir 400 de entrada
com autorização. A RPC continua revalidando papel/entidade sob lock; revogação
entre prévia, preflight e gravação também retorna 403 sem persistência parcial.

400 entrada/mapeamento/confirmação inválidos; 403 papel/entidade; 404 fonte
oculta/ausente; 409 intenção, origem ou versão conflitante; 422 cobertura;
503 ERP sem configuração, indisponível, recusado ou excedendo limites. Falha não
vira lista vazia ou integração ativa. Confirmação incerta: consultar histórico e
repetir a mesma intenção/chave; nunca produzir outra chave só para repetir.

## CSV/XLSX: prévia e confirmação

`POST fee-imports/preview`:

```json
{"organization_id":"00000000-0000-4000-8000-000000000001",
 "contract_id":"00000000-0000-4000-8000-000000000002",
 "file":{"name":"Tarifas.csv","format":"csv","content_base64":"..."},
 "source_reference":"Extrato identificado",
 "delimiter":";",
 "mapping":{"source_object_id":"ID externo","service":"Serviço",
 "charging_unit":"Unidade","currency":"Moeda","period_start":"Início",
 "period_end":"Fim","observed_amount":"Valor","volume":"Quantidade"}}
```

Arquivo até 64 KiB, 100 registros, 40 colunas, UTF-8 estrito para CSV; delimitador
vírgula ou ponto e vírgula. Cabeçalho explícito e sem nomes repetidos. Mapeamento
canônico→coluna exata, sem adivinhação. Todos os campos do exemplo são
obrigatórios exceto `volume`; `base_amount` também é opcional. IDs externos
estáveis (até 80 caracteres alfanuméricos e `._:-`) são obrigatórios para dedupe.
Origem até 100 caracteres, letras/números e ` ._:/-`; não incluir segredos.

CSV aceita campos entre aspas, escape de aspas e quebras dentro do campo;
`line` é o número ordinal do registro, não a linha física em CSV multiline.
Valores decimais sem separador de milhar; vírgula ou ponto decimal, sem coerção
de texto desconhecido para zero. Moeda é código, período deve estar encerrado.
Colunas extras não mapeadas não são importadas. Linhas totalmente vazias são
ignoradas. Não reconhecer automaticamente datas seriais do Excel.

XLSX reutiliza o leitor ZIP/XML existente, com colunas esparsas preservadas,
limites de expansão e recusa de fórmulas/caches de fórmula. Primeira planilha na
ordem do leitor existente; `source_locator` identifica a planilha/linha efetiva.
Não há parsing novo de PDF; extração documental existente permanece separada.

Resposta `{ok:true,preview}`: `api_version=financial-fee-import-v1`,
`file_fingerprint` SHA-256 dos bytes, `fingerprint` vinculado também a organização,
contrato, nome, formato, mapeamento e origem; colunas, mapping, limites,
`confirmation_required:true`, estatísticas e linhas `{line,source_locator,state,
values,errors:[{column,code,suggestion}],existing_id?}`.

Estados: `valid`, `invalid`, `incomplete`, `duplicate`, `conflicting`; ERP também
pode ter `pending_review`. Conteúdo diferente com o mesmo ID de origem conflita;
registro idêntico é duplicado. A prévia consulta observações autorizadas e não
escreve. A mesma referência de origem deve identificar o mesmo conjunto externo,
sem usar um nome aleatório de arquivo a cada tentativa.

`POST fee-imports/confirm` repete o corpo original, acrescentando
`confirmation:true`, `preview_fingerprint`, `selected_lines:[2,4]` e
`request_key:UUID`. O backend relê os bytes, refaz mapeamento/validação/reconciliação
e confere fingerprint/contexto; somente válidas ou duplicadas podem ser
selecionadas. Mudar contrato, arquivo, nome ou mapeamento exige nova revisão.

A RPC `fin_import_fee_batch` executa o lote selecionado atomicamente. Cada
observação usa o núcleo canônico compartilhado por `fin_record_fee_observation`
e pelo batch; canal imutável `structured_file` ou `erp_adapter`, sem relabeling de
observações anteriores e sem acesso direto ao helper privado. Falha em
qualquer linha desfaz observações, diferenças e recibo. Sem verificação automática
ou decisão financeira. Recibo retorna `rows:[{line,id,state:imported|ignored}]`,
`imported`, `ignored`, `fingerprint`, `replayed`. Repetir a mesma chave/ator/intenção
retorna o recibo original; outra chave com o mesmo fato conserva a observação.
Mudança financeira sob a mesma origem é 409, não sobrescrita.

Origem persistida: `source_type=other_import`, referência fornecida + ID externo,
`source_object_id`, `evidence_reference=file:sha256:...`; contrato deriva organização,
entidade e instituição; moeda, unidade, período e valores são do arquivo. Evento
`fee_import_completed` guarda arquivo, fingerprint, autor, IDs/estados e intenção;
não guarda os bytes. Eventos e observações seguem export/retention/hold canônicos.

`GET fee-imports/history?organization_id=UUID&contract_id=UUID&limit=25&after=UUID`
retorna recibos autorizados por `id.asc`, `rows` e `next`. Limite 1–100. Cursor é ID
naquele recorte; raiz/escopo são conferidos a cada página. Não informa linhas
financeiras fora do escopo.

## ERP: configuração autorizada, suspensão e revogação

`POST erp-fees/configure`:

```json
{"organization_id":"00000000-0000-4000-8000-000000000001",
 "integration_id":"00000000-0000-4000-8000-000000000003",
 "contract_id":"00000000-0000-4000-8000-000000000002",
 "expected_version":0,"request_key":"00000000-0000-4000-8000-000000000004",
 "status":"configured","settings":{
 "tenant_id":"00000000-0000-4000-8000-000000000005","environment":"sandbox",
 "company_id":"00000000-0000-4000-8000-000000000006",
 "account_id":"00000000-0000-4000-8000-000000000007",
 "currency":"BRL","service":"Tarifa bancária declarada","charging_unit":"one_off"}}
```

IDs de integração e intenção são gerados pelo cliente uma vez. Primeira versão
esperada é zero; retorno contém versão 1. Mudanças enviam a versão vista e nova
chave. `configured`, `suspended`, `revoked`; revogação é terminal. Contrato/escopo
não mudam depois do cadastro. Configuração é snapshot em evento imutável
`fee_integration_configured`, com fonte/ator/versão/recibo; sem tabela duplicada.
Nenhum segredo é aceito em settings. `connection_state:not_tested` é deliberado.

`POST erp-fees/configuration {organization_id,integration_id}` lê a versão atual.
`GET erp-fees?organization_id=UUID&limit=25&after=UUID` lista a última versão por
integração autorizada, em ordem de ID, com continuidade. Configurado não é
sinônimo de ativo ou conexão externa comprovada.

## Adapter concreto: Microsoft Dynamics 365 Business Central API v2.0

Escolha inicial: API oficial documentada, Bearer Microsoft Entra compatível,
IDs/lastModifiedDateTime e OData, recorte reproduzível de despesas. Relevância
comercial é hipótese, não pesquisa com clientes. **Business Central não é
Dynamics 365 Finance & Operations**; SAP, Oracle, TOTVS, Senior e Sankhya não são
anunciados como conectados.

Fontes oficiais consultadas em 01/11/2026:
[estrutura de endpoints](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/endpoints-apis-for-dynamics),
[generalLedgerEntry](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/resources/dynamics_generalledgerentry),
[filtros OData](https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-connect-apps-filtering).
O adapter só lê os campos necessários de uma conta de despesa explicitamente
mapeada; não importa nem reconstrói o razão geral.

Requisição real implementada: GET
`https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({company})/generalLedgerEntries`;
select de ID, data de lançamento, conta, débito, crédito e última alteração;
filtro de accountId e datas, watermark inclusivo opcional, ordem timestamp/ID.
Bearer, timeout total de 20 s, corpo até 256 KiB/página, até cinco páginas e 100
registros. Continuação só na mesma origem e caminho, sem redirects, usuário/senha
ou fragmentos; ciclos e cobertura excedida recusam a consulta inteira. Nunca
avançar watermark de resultado parcial.

`POST erp-fees/preview {organization_id,integration_id,period_start,period_end,
watermark?}`: configuração autorizada vigente, escopo contratual e papel; lê a API,
normaliza e reconcilia como a prévia de arquivo. Créditos/estornos e zeros ficam
`pending_review`, nunca são convertidos silenciosamente em despesas. Data de
lançamento é referência informacional; não é prova de liquidação. Moeda local é
**declaração do operador no mapeamento**, pois a entidade da API não a retorna.
Quantidade/base ausentes não são inventadas; comparação pode ser incomparável.

`POST erp-fees/confirm` repete período/watermark, inclui seleção, fingerprint,
`confirmation:true` e `request_key`. Refaz a leitura externa: alteração da fonte
exige nova prévia; suspensão, revogação ou versão alterada durante a leitura são
recusadas na RPC transacional antes de persistir. Referência estável por
provedor/tenant/company/ID externo; timestamp da fonte fica na evidência. Correção
externa não sobrescreve observação confirmada: gera conflito a revisar.
Histórico de importações continua no contrato, com integration ID/version/watermark
no recibo. Seleção parcial não autoriza avanço automático de cursor.

Saída externa somente com runtime permitido e **todos** os valores de servidor
aprovados: `ARANDU_DYNAMICS_ENABLED=true`, `ARANDU_DYNAMICS_ACCESS_TOKEN`,
`ARANDU_DYNAMICS_ORGANIZATION_ID`, `ARANDU_DYNAMICS_TENANT_ID`,
`ARANDU_DYNAMICS_COMPANY_ID`, `ARANDU_DYNAMICS_ENVIRONMENT`. O binding deve
coincidir exatamente com organização/tenant/company/ambiente do registro. Demo
bloqueia a saída. Token fora do banco, navegador, logs e recibos. Ausência ou
binding diferente: 503 `erp_not_configured`, sem chamada externa.

Limites: primeira implementação suporta um binding operacional por processo,
token Bearer previamente provisionado e renovado fora do Arandu. Não implementa
OAuth administrativo/refresh, scheduler autônomo, delete detection ou retries
invisíveis. Falhas de transporte são retornadas com código seguro; ainda não há
histórico persistente de tentativas malsucedidas. Não alegar sincronização contínua
ou integração ativa com fixtures. Conexão legítima externa permanece NOT RUN.

## Validação, rollout e handoff

Migration aditiva `supabase-financial-fee-ingestion.sql`, depois do pacote de
Platform Intelligence; marker `financial-fee-ingestion-1`. Rollback revoga comandos
e preserva observações, diferenças, configurações e recibos. Nenhuma aplicação
hospedada autorizada por estes arquivos.

Suites: `test-structured-ingestion` (CSV/XLSX/fixtures HTTP oficiais/ataques),
`test-fee-import-api` (handlers reais com transporte simulado),
`financial-fee-ingestion.sql` (banco real: atomicidade/replay/conflito/tenant/
entidade/viewer/lifecycle) e `fee-import-concurrency.mjs` (sessões independentes).
Runner completo: clean, upgrade, rollback e reapply. Gates/SHAs na PR; fixture não
é prova externa. Leitor documental anterior é revalidado pela mudança opt-in de
XLSX; não alterar sua semântica padrão.

Claude: mostrar prévia, erros e origem antes da seleção; manter arquivo/mapping e
request_key após falha; exigir confirmação; mostrar diferenças como revisão, sem
"economia realizada". UI de integração deve dizer configurada/suspensa/revogada e
separar comprovação externa. Nenhum arquivo de frontend foi editado nesta entrega.
