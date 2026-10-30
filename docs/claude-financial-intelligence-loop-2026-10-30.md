# Financial Intelligence Loop — reconciliação e primeira entrega (Claude, 30/10/2026)

Baseline: `main@5fa86b5`. Escopo de edição: `finance/src/**` e testes E2E. Nenhum arquivo de `lib/api/**`, `lib/finance/**`, SQL ou infraestrutura foi alterado.

## Matriz curta (baseada no código)

| Capacidade | Estado | Evidência no código |
|---|---|---|
| 1. Relationship Intelligence | Existe, fragmentada → fila agora une contratos, negociações, tarefas e sinais | `views/relationship-center.js`, `views/relationship-context.js`, `views/provider-relationship.js` |
| 2. Radar | Existia em página isolada (`/finance/opportunities.html`); **agora entra na fila da Central** | `views/opportunities.js` + `lib/api/domains/finance-opportunities.mjs` |
| 3. Negotiation Studio | Existe parcialmente (RFQ, propostas externas, comparação, aprovação em telas separadas) | `views/rfq.js`, `views/external-proposals.js`, `views/contract-work.js` |
| 4. Contract Intelligence | Existe (versões, obrigações, extrações com revisão humana) | `views/contract-center.js`, `views/extractions.js`, `views/covenants.js` |
| 5. Financial Economics | Existe (Fee Intelligence, Value Realization) em páginas ledger | `views/fees.js`, `views/value.js` |
| 6. Copilot | Não existe; sem contrato de backend para respostas fundamentadas | — (adiado; não introduzir provedor de IA) |
| 7. Portal institucional | Existe | `views/provider.js` |
| 8. Importações progressivas | Existe parcialmente (registro de contrato existente, extrações) | `views/contract-registration.js`, `views/intake.js` |

## Entregue nesta rodada — Radar acionável na Central de Relacionamentos

- **Problema:** sinais do Opportunity Engine (diferença de tarifa, covenant, renovação, etc.) só apareciam em `Oportunidades`, fora da fila onde o gestor decide o próximo trabalho.
- **Antes:** a fila da Central derivava apenas de contratos, solicitações e tarefas.
- **Agora:** a fila busca sinais vivos (`open`, `acknowledged`, `under_review`) via `GET opportunities` existente e os mostra com situação própria (vencido / em revisão / sinal), motivo vindo do servidor, estado, origem ("regra configurada pela sua empresa"), ação possível e link persistido ao detalhe (`/finance/opportunities.html?id=…`), onde as transições reais acontecem. Ao filtrar por instituição, os sinais são reconsultados com `provider_id`. Falha na API não esconde a fila e é declarada. Perfis sem gestão veem quem revisa, sem chamada.
- **Sem:** ranking, recomendação, recálculo no navegador ou persistência local.
- **Acesso:** Instituições (`/finance/providers.html`) → "O que pede ação nos relacionamentos".
- **Testes:** `tests/e2e/finance-relationship-center.spec.js` (2 novos: sinal por estado/instituição com destino; erro de API). Rodado em chromium-desktop e mobile-chrome: 38 passaram. Testes com API mockada (não é E2E contra backend real).

## Contrato do Radar (entregue em `codex/financial-intelligence-engine-20261030`)

`GET /api/finance/opportunities` devolve linhas apresentadas (`{ id, cells[] }`). Para o Radar mostrar a instituição e a entidade de cada sinal sem filtro, e ordenar por prazo real:

- **Entrada:** inalterada.
- **Saída proposta, aditiva por linha:** `provider_id`, `provider_name`, `legal_entity_id`, `status`, `deadline` (ISO), `source_object_type`, `source_href` (já calculado por `sourceHref`).
- **Implementado:** cada linha de `GET opportunities` traz agora `context` = `{ status, deadline, overdue, provider_id, legal_entity_id, source_object_type, source_href, linked_rfq_id }`, copiado da linha canônica `fin_opportunities` (sem join, sem migration). `null` = não vinculado na fonte. `provider_name` não foi incluído: a tela usa as instituições já carregadas. A Central usa esses campos para instituição, entidade, ordenação por prazo e link 'Origem do sinal'.
- **Motivo funcional:** hoje o sinal sem filtro aparece como "Instituição no detalhe do sinal" e é ordenado só pela situação; com esses campos ele vai direto ao objeto de origem e entra no filtro por entidade.

## Ainda não feito (próximo maior impacto)

1. Negotiation Studio: iniciar renegociação a partir do contrato preservando contrato/condições de origem até a decisão (PR B).
2. Ligação tarifa ↔ contrato ↔ registro de valor com distinção explícita diferença calculada × revisada × economia realizada.
3. Análise competitiva com fontes públicas (não executada nesta rodada).
