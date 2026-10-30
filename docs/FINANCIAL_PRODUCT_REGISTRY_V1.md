# Financial Product Registry v1

Taxonomia extensível de modalidades financeiras (`lib/finance/product-registry.mjs`), ligada às capacidades implementadas. Não cria tabela nem migration, não altera códigos de produto existentes (`credit`, `acquiring`) nem categorias de contrato.

## Estados de suporte (derivados do código, nunca declarados à mão)
| Estado | Condição |
|---|---|
| `CATALOG_ONLY` | descrita na taxonomia |
| `STRUCTURED` | a categoria de contrato canônica tem termos tipados (`contractTermFields`) |
| `RFQ_ENABLED` | existe produto de RFQ com schema (`PRODUCTS` ∩ `SOURCING_CATEGORIES`) |
| `ECONOMICS_ENABLED` | RFQ habilitada e metodologia econômica existente (crédito: custo total declarado; adquirência: `acquiring-processing-cost-v2`) |
| `INTEGRATION_SUPPORTED` | nunca nesta versão (não há conector específico) |

Estado em v1: 30 modalidades e 10 famílias. 9 têm RFQ e economia (crédito e adquirência). As demais são `CATALOG_ONLY + STRUCTURED` em 5 categorias tipadas (credit, acquiring, guarantee, fx, cash_management) mais `other`.

## API
`GET /api/finance/product-registry`: pública como `GET products` (sem dado de organização), rate limit `finance-products`, `no-store`. Resposta `{ok, version, families:[{code, name, description, modalities:[code]}], modalities:[{code, name, family, contract_category, rfq_product|null, support[], term_fields[], economics:{method, note}|null}], notice}`. Sem paginação (catálogo pequeno e versionado).

## Handoff para a interface
`finance/src/views/product-catalog.js` mantém hoje uma taxonomia própria. Ela deve passar a só renderizar esta resposta: `support` define os selos, `rfq_product` habilita "Iniciar negociação" (`new-rfq.html?product=`) e `contract_category` orienta o registro de contrato. Sem cálculo no navegador.

## Limites
- Garantias, câmbio e hedge usam os termos genéricos da categoria. Schemas específicos (como prazo de validade da garantia, beneficiário, notional, curva) são o próximo incremento e exigem evolução de `contract-terms.mjs` com versões.
- Não há preço de mercado nem recomendação.

Teste: `node scripts/test-product-registry.mjs` (em `check:finance`).
