# Negotiation Studio 1.0 — continuidade contrato → renegociação (Claude, 30/10/2026)

Base: `main@53e02da` (#284 e #285 integradas, confirmadas por ancestralidade). Escopo: `finance/src/**`, `finance/style.css` e E2E. Backend não alterado.

## O que já existia (reaproveitado, não reimplementado)
- `POST contract-renewal-rfq` → `fin_start_contract_rfq`: cria (ou devolve, se já houver uma em andamento) o rascunho de renegociação ligado ao contrato, com a demanda do contrato, e grava `rfq_created_from_contract` / `renewal_rfq_started`. Só para crédito e adquirência.
- RFQ: convites, propostas pelo portal, propostas externas registradas pela empresa, comparação, aprovação, decisão e registro do contrato resultante.
- Contrato resultante → "Ver processo e decisão de origem" (via `decision_id`).

## Lacuna resolvida
A solicitação de renegociação não mostrava de qual contrato veio. Não havia caminho de volta ao contrato nem ao relacionamento. A Central também não permitia iniciar a renegociação a partir da fila.

## Mudança
1. **Solicitação (`rfq.html`)**: novo cartão "Renegociação de contrato existente" (`views/negotiation-origin.js`).
   - A origem vem do evento canônico, lido por `GET events?entity_type=rfq&entity_id=…`.
   - O cartão mostra instituição, condição, estado, vigência, aviso prévio registrado, versão dos termos, custo e condições registradas. Campo ausente aparece como "Não informado".
   - Jornada de 7 etapas com estado comprovado por registro: contrato de origem → solicitação → propostas (portal × canal externo) → comparação → decisão → contrato resultante → acompanhamento.
   - Links para contrato de origem, relacionamento, contrato resultante e retorno à Central.
   - Solicitação sem origem não ganha o cartão. Falha na consulta é declarada.
2. **Central de Relacionamentos**: "Iniciar renegociação" / "Retomar renegociação" em itens de contrato de crédito ou adquirência que estão vencidos, em janela, com aviso prévio passado ou em renovação. Há confirmação explícita e nenhuma instituição é convidada. Um erro mantém o item e informa que repetir não duplica (o endpoint é idempotente). Leitores não veem a ação.

3. **Contrato (detalhe, "Trabalho deste contrato")**: nova seção "Renegociações deste contrato", lida do evento `renewal_rfq_started`. Cada renegociação aparece com link, data de início e estado; o estado aparece como "fora das solicitações carregadas" quando não foi carregado. O loop fecha nos dois sentidos: da renegociação ao contrato e do contrato às renegociações.

## Jornada para testar
Instituições → "O que pede ação" → item em janela → **Iniciar renegociação** → rascunho com cartão de origem → convidar instituição ou registrar proposta externa → encerrar coleta → comparar → decisão → registrar contrato → **Contrato resultante** → marcos e tarefas.

## Testes
- E2E (API simulada por mocks; não é backend real): `finance-relationship-center` (+4 testes), `finance-contracts` (+2 testes, 154 passaram após a seção nova), `finance-procurement`, `finance-external-proposals` e `finance-contracts`, em chromium-desktop e mobile-chrome: 357 passaram.
- `npm run check:all`, `npm run check:design` e `npm run build`: passaram.
- Não executados: capturas antes/depois (`design:capture` exige a Demo local), Firefox/WebKit e testes contra o backend real.

## Dependências (Codex)
- **Economia de adquirência (Pacote C):** não há API de cenário (volume, mix, MDR por modalidade, antecipação). Contrato proposto: `GET acquiring-scenario?rfq_id=` → `{ reference: {cost, currency, period, assumptions[]}, alternatives: [{proposal_id, origin: 'portal'|'external', cost|null, missing[], comparable, reasons[]}], unmodeled[] }`. Sem essa API, a tela não calcula nada.
- **Origem na listagem:** `GET rfq/:id` e o resumo poderiam devolver `origin_contract_id` (hoje lido de eventos, limitado a 50 eventos por objeto).
- **Recusa de convite pela instituição:** ainda sem API própria.
