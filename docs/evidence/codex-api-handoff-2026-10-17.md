# Handoff de API — limites de documentos (17/10/2026)

Base: `0fb48d3e202cb71942a608fb427b0e7e2bec44e9`. Nenhuma alteração de frontend,
seed, E2E, schema, migration, grant ou configuração hospedada.

## Contrato preservado

`POST /api/finance/extractions/start` continua recebendo:

```json
{"organization_id":"00000000-0000-4000-8000-000000000001","document":"00000000-0000-4000-8000-000000000002|1","schema_key":"credit_proposal","provider":"deterministic_v1"}
```

Exige sessão e autorização atual em `fin_document_extraction_begin`, executada
com JWT do chamador. A service role continua restrita à leitura server-side do
objeto autorizado. Nenhuma permissão de leitura é ampliada.

Sucesso conserva HTTP 201 e `{ok:true,id,facts,warnings,flags}`. Excesso de
10 MiB continua HTTP 422, `{ok:false,id,code:"too_large",error:...}`. ZIP com
tamanho falso, CRC divergente, entrada duplicada ou estrutura truncada falha
fechado como `parse_error` (HTTP 422). O parser não recupera silenciosamente
termos financeiros de um arquivo inconsistente. Ausência de autorização não
chega ao Storage; indisponibilidade continua 503 `storage_unavailable`.

Não há retry automático da leitura ou das RPCs. Uma falha de extração não
registra fatos nem confirma conclusão. Não repetir uma escrita cuja resposta
se perdeu como se fosse uma nova intenção; reconciliar pelo identificador
persistido. Esta rodada não acrescenta chave de idempotência ao endpoint.

`private-documents/upload|complete|download`, propostas, decisões, tarefas e
os filtros `contract_id` da #211 permanecem compatíveis. Claude não precisa
alterar a interface. Exibir a falha existente e permitir revisão manual ou
novo arquivo íntegro; não apresentar conteúdo parcialmente extraído como sucesso.

Testes: `scripts/test-document-resource-limits.mjs`, integrado a
`scripts/test-document-intelligence.mjs` e portanto a `check:finance/check:all`.
Cobrem limite exato, header ausente/falso, cancelamento do stream, caminho
inválido, orçamento inválido, ZIP adulterado e API sem registro de fatos após
overflow; preservam autorização por JWT e os evals positivos existentes.

## Operação

`finance:env:check` passa a mostrar presença/formato das URLs, sem seu valor.
`ARANDU_SITE_URL` com usuário/senha, query ou fragmento é recusada. Usar a URL
pública limpa do ambiente, mantendo credenciais nas variáveis server-only.
Nenhuma atribuição Supabase foi liberada. Rollback: revert da PR; sem rollback
SQL ou reescrita de dados. Reverter reabre os defeitos de limites e logging.
