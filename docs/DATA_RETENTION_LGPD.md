# Retenção, anonimização e legal hold

O Arandu não define no código um prazo jurídico ou fiscal por conta própria. A migration `docs/supabase-retention-controls.sql` cria apenas os controles necessários para que uma decisão humana posterior seja aplicada de forma auditável.

## Princípio

Toda classe de dado começa com retenção automática desativada. Para habilitar uma política são obrigatórios:

- prazo em dias;
- destino após o prazo (`review`, `anonymize` ou `delete`);
- referência da decisão;
- referência do aprovador;
- data de aprovação.

Valores como `ok`, `sim`, `pronto` ou uma flag booleana isolada não substituem decisão jurídica/fiscal.

## Legal hold

`data_legal_holds` permite suspender qualquer descarte de uma entidade específica quando existir motivo jurídico, fiscal, disputa, incidente ou outra obrigação formal.

O hold registra somente:

- classe do dado;
- identificador técnico da entidade;
- referência do motivo;
- referência do ator;
- datas e referência de liberação.

Não grave no campo de referência narrativa com PII, documentos pessoais ou conteúdo jurídico sensível. Use protocolo/ticket/documento externo controlado.

## Pedidos e registros comerciais

Pedidos, pagamentos, propostas, reservas e registros financeiros podem estar sujeitos a obrigações legais de retenção diferentes das demais informações de conta. O código deliberadamente não escolhe esses prazos.

Antes de habilitar qualquer política para essas classes, é necessário `DECISION_REQUIRED` com validação jurídica/fiscal.

## Solicitação de exclusão

Uma solicitação LGPD não deve causar remoção cega de registros sujeitos a retenção obrigatória ou legal hold. O fluxo operacional deve classificar cada conjunto de dados em uma das ações possíveis:

1. exclusão permitida;
2. anonimização/pseudonimização;
3. retenção mínima obrigatória;
4. legal hold ativo;
5. revisão humana necessária.

## Outbox e dados transitórios

A outbox de e-mail possui minimização independente: o endereço do destinatário é removido assim que o evento chega a `delivered` ou `dead`. Isso não substitui a política de retenção dos registros comerciais relacionados.

## Release

A existência desses controles não promove nenhum gate de lançamento. Contato LGPD válido, política publicada e decisão de retenção continuam dependendo de evidência externa real.
