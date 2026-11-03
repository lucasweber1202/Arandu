# Quadro de respostas da negociação

Estado: **M1 + testes com API simulada** (Node e Playwright Chromium desktop/mobile). Não validado contra Supabase real nem hospedado.

## O que resolve
Na solicitação, convite, proposta do portal e proposta externa ficavam em abas e seções separadas. Agora a visão geral mostra **uma linha por instituição** e a comparação abre com **"Antes de comparar"**.

| Pergunta | Fonte | Regra |
|---|---|---|
| Quem foi convidado / respondeu | `rfq.invites`, `rfq.proposals` (overview ou `rfq/:id`) | ordem do convite; sem ranking |
| Proposta fora do portal | `GET external-proposals?rfq_id=` (mesmo contrato da seção de propostas) | "Registrada pela empresa (fonte externa, não autenticada pela instituição)"; versões substituídas não entram |
| Entra na comparação? | estado da externa (`reviewed` + revisão atual) | `pending_review`/`preparing`/`withdrawn` ficam fora, com o motivo |
| De quem é a vez | convite vivo + coleta aberta + prazo; revisão desatualizada; conferência pendente; coleta encerrada | "Aguardando a instituição" / "Aguardando a empresa" / "Sem pendência nesta etapa" |
| O que falta | condições `comparable` do catálogo do produto em branco; validade vencida | só rótulos; sem chaves internas |

Navegação: "Ver proposta" abre a aba Propostas e foca o cartão (`#proposal-…`/`#external-…`); "Relacionamento" abre a instituição. Falha da lista externa vira aviso ("não significa que não existam"); 503 é "indisponível neste ambiente".

Lógica: `lib/finance/negotiation-board.mjs` (teste `scripts/test-finance-negotiation-board.mjs`). Tela: `finance/src/views/negotiation-board.js`, carregada sob demanda e fora do build de demonstração. Sem nova API, tabela ou migration.

## Handoff (backend)
1. **Lista de propostas externas por organização** — `GET external-proposals?organization_id=&state=pending_review&limit=&after=` (RLS do chamador, BUYER, paginação por `id`). Hoje exige `rfq_id`; sem isto a Central não mostra "conferências pendentes" sem fan-out por solicitação. Aceite: lista só da organização, 403 para PROVIDER, mesma forma de linha da listagem atual.
2. **Contagem de externas no resumo da RFQ** — `external_proposal_count` já é lido pela aba; incluir `external_pending_review_count` evitaria a segunda chamada do quadro.
