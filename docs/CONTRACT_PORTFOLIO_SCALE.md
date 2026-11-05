# Carteira e obrigações em escala (Arandu 8.0)

Estado: **M1 + testes** — consultas PostgREST verificadas em Node (HTTP simulado), schema/RLS na suíte `test:database` em PostgreSQL 16 local descartável, jornadas em Playwright com API simulada. Sem validação hospedada.

## Problema
- A Control Tower (#328) usava `overview.contracts`, limitado a **200** linhas: carteiras maiores pareciam completas sem ser.
- A Caixa de Trabalho lia a **primeira página** (25) de `covenants`, incluindo períodos já encerrados.

## Contratos de API
### `GET covenants` (aditivo; sem parâmetro, comportamento anterior)
| Parâmetro | Valores | Efeito (PostgREST sobre `fin_obligation_monitor`) |
|---|---|---|
| `status` | `open` ou lista de estados conhecidos | `facts->>status=not.in.(compliant,waived,not_applicable)` / `in.(…)` |
| `due_after`, `due_before` | `AAAA-MM-DD` válido; after ≤ before | `due_on=gte/lte` |
| `no_due` | `true` | `due_on=is.null` |
| `owner_id` | uuid ou `none` | `owner_id=eq/is.null` |
Valor fora do domínio → **400** (`invalid_query`), nunca filtro ignorado. Paginação (`after` = offset, 25 por página) inalterada.

### `GET contracts?paged=1` (novo modo; sem `paged`, o modo legado de 100 linhas fica idêntico)
Filtros `provider_id`, `legal_entity_id`, `product`, `status` (`live|active|renewing|ended`), `owner` (uuid|`none`), `q` (título, `ilike`, só letras/números/espaço/`.-/`), `limit` (1–100), `after` (cursor = último `id`). Ordem `id.asc` (keyset estável com inserções concorrentes). Chave desconhecida → 400. Organização vem do servidor; JWT e RLS do chamador.

## Interface
- **Carteira**: abaixo de 200 contratos usa a visão geral; no limite lê todas as páginas (até 50 × 100). Estados: completa (sem aviso), `capped` (> 5.000, recorte informado) e `failed` (falha da leitura completa: mostra as 200 e diz que as contagens valem só para elas).
- **Caixa de Trabalho**: `status=open&due_before=hoje+90`, até 8 páginas, mais `status=open&no_due=true` para períodos sem prazo; se restar página, aviso "cobertura parcial".

## Testes
`scripts/test-finance-portfolio-scale.mjs` (filtros, 400 em valores inválidos, keyset, modo legado intacto, JWT do chamador) e `tests/e2e/finance-contract-os.spec.js` (26 casos com os novos: obrigações abertas/sem prazo/parcial; carteira de 250 contratos lida em 3 páginas; falha da leitura completa).

## Limites e handoff
- Contagem total exata (`Prefer: count=exact`) não é exposta: a cobertura é dita por estado (completa/limitada/falha), não por número estimado.
- Pendências baseadas em data (aviso vencido, janela) seguem calculadas na interface sobre a carteira lida; filtrá-las no servidor exigiria coluna/visão derivada (migration) — não feito.
- **Medição (PostgreSQL 16 local, schema real instalado pela `test:database`, tabela temporária `LIKE fin_contracts INCLUDING INDEXES` com 10.000 contratos sintéticos, 2 organizações)**: primeira página (101) 0,28 ms e página tardia por keyset 0,26 ms, ambas via índice existente `(organization_id, id)`; busca por título (`ilike '%…%'`) 10,4 ms em varredura sequencial. Nenhum índice novo: o ganho não justifica o custo de escrita nesta escala; reavaliar (trigram) acima de ~100 mil contratos por organização.
- Obrigações abertas na janela usam o índice existente `fin_obligation_due (organization_id, due_on)`; o estado (`fin_obligation_facts`) é avaliado só nas linhas já recortadas.
- `fin_contracts.owner_id` é `NOT NULL` no schema: a pendência "Sem responsável" e o filtro `owner=none` da carteira nunca casam com contratos reais (inofensivos; mantidos porque a visão geral também alimenta linhas sem responsável em fixtures/sandbox). Não há contrato sem responsável a resolver.
