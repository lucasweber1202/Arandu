# Value Intelligence executivo (fatia de P1.6)

Status: implementado em branch `feature/value-intelligence-executive`; CI e rollout hospedado conforme `IMPLEMENTATION_MATRIX.md`. Não é o P1.7 (Spend Analytics) completo nem um novo system of record: é a leitura executiva, no Painel, dos resumos que P1.1 (valor), P1.2 (tarifas) e P1.3 (oportunidades) já mantêm.

## O que mostra

Seção **Inteligência de valor** em `/finance/dashboard.html`, com filtros de período (início/fim, até cinco anos) e entidade (ou o escopo da pessoa):

| Cartão | Conteúdo | Cobertura | Ação |
| --- | --- | --- | --- |
| Valor de procurement | por moeda: economia negociada, economia realizada e custo evitado, cada um com `n/m com cálculo` | registros ativos com cálculo defensável / total; realizações verificadas | registros de valor; negociado a realizar |
| Tarifas bancárias | por moeda: acima/abaixo da referência contratada (com a diferença), não comparáveis, sem referência; revisão necessária, em revisão, resolvidas ou descartadas | tarifas contratadas com observação comparável / contratadas; % de observações verificadas | diferenças aguardando revisão; tarifas |
| Oportunidades (agora) | ativas (aberta, ciente, em revisão), com prazo em 30 dias, com prazo vencido; com ação registrada por pessoa | — (estado atual, não período) | worklist; prazo em 30 dias |

## Invariantes

- **Nunca soma moedas.** Cada linha é de uma moeda.
- **Nunca soma tipos de valor.** Negociado, realizado e custo evitado ficam lado a lado; custo evitado é rotulado como não caixa. Teste em `scripts/test-finance-executive.mjs` falha se qualquer soma entre tipos aparecer.
- **Diferença de tarifa não é economia nem acusação**: linguagem segura de P1.2, sem contagem em valor.
- **Sem dado não é zero**: período sem registros mostra "Sem registros"/"Sem cobranças observadas", não `R$ 0,00`; valor sem cálculo defensável aparece como tal.
- Sem ranking, score ou recomendação.

## Implementação

- `GET /api/finance/executive?organization_id&start&end&legal_entity_id` (`lib/api/domains/finance-executive.mjs`): só JWT de quem chama; chama `fin_value_totals`, `fin_fee_summary` e `fin_opportunity_summary` (security invoker, RLS e escopo de entidade de cada SoR). Nenhuma tabela, migration ou RPC nova; nenhum dado novo para registry/export.
- Texto composto no servidor (`lib/finance/executive-presenter.mjs`); o navegador só desenha (`finance/src/views/executive.js`, carregado por `import()` só fora da demo, para não pesar o Painel).
- Falha da seção mostra recuperação local sem derrubar o Painel.
- Orçamento de JS: inalterado. Preview 798.135/800.000 (abaixo da baseline anterior a P1.2, 798.701, apesar de P1.2, P1.3 e esta seção); a margem é curta e nova interface exige reduzir bundle antes.

## Verificação

`scripts/test-finance-executive.mjs` (separação por moeda/tipo, cobertura, linguagem, links com escopo, seção lazy, API só JWT com filtros validados antes de qualquer RPC) e `tests/e2e/finance-executive.spec.js` (cartões, links, filtros enviados ao servidor, indisponibilidade sem número inventado, sem overflow).
