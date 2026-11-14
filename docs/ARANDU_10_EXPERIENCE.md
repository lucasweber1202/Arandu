# Arandu 10 — Experiência empresarial (frontend)

Coordenação: issue #345. PR única do frontend: #346 (branch `claude/great-goldberg-e66w6c`).
Contrato de backend consultado: `docs/integration/ARANDU_10_CONTRACT.md` em
`codex/arandu-10-engine@cdd12645` — checkpoint inicial em que **todas as extensões
(cenários, `stale_reasons`, `renewal-operations`, `work-intelligence`) estão
propostas, não implementadas**. Este lote usa apenas endpoints já existentes na
`main`; nada aqui depende de API não publicada nem simula persistência.

Maturidade: M1 (código) com E2E local sobre **API simulada**. Não é validação
hospedada, de release ou de produção.

## Capacidades entregues

| Frente | O que mudou | Endpoints usados (existentes) |
|---|---|---|
| C — Renewal Workbench | Filtros por estado do ciclo (vigente / renovação iniciada), entidade jurídica e busca, somados ao filtro de responsável; rótulo de estado e entidade por contrato; aviso fixo de que abrir concorrência não renova o contrato; atalhos por grupo de urgência; busca pré-preenchida por `?plano_busca=` vinda do Relationship 360. | `overview`, `contracts` (paginado), `tasks`, `contract-renewal-rfq`, `entities` |
| D — Executive Action Center | Cada pendência explica por que está na posição (estado e prazo já usados na ordenação; não é nota); filtro por tipo (aprovações e decisões, prazos, contratos e renovações, tarefas), combinável com o filtro por origem; "Assumir" tarefa sem responsável, confirmado por releitura do servidor; mensagem própria para combinação de filtros vazia. Sem nova caixa de entrada. | `tasks` (GET/PATCH), `approvals`, `overview` |
| E — Enterprise Intake | Pendências obrigatórias ao vivo no resumo do assistente, em qualquer etapa, cada uma com atalho que leva e foca o campo; contagem de sugestões do Passport mantidas ou alteradas (continuam sugestões); no celular, o título do resumo recolhível mostra quantos obrigatórios faltam. Rascunho segue pelo `rfq-editor` já existente. | `rfq-editor`, `passport`, `rfqs` |
| B — Approval Workspace | Resumo "Antes de decidir" no contexto do pedido: proposta e versão submetida x versão atual, quem já participou, o que falta, situação (pode decidir, aguardando outra etapa, expirado, desatualizado); termos da proposta antes da demanda; motivos de desatualização legíveis a partir do `stale_reason` que o servidor já devolve (`rfq_changed`, `proposal_changed`, `source_ineligible`, `context_unavailable`); quando `stale_reasons` existir, cada item é exibido; etapa atual visível na caixa; busca local. Ações continuam no servidor e só aparecem com `viewer_can_act`/vez do aprovador e contexto atual. | `approvals`, `approvals/act` |
| F — Relationship 360 | Seção "Cobertura e origem dos dados" por fonte (contratos, tarefas, solicitações, facilities, saldos, questões, histórico): quantidade carregada, natureza (registro no Arandu, declarado pela empresa, fotografia histórica) e estado (consulta concluída, há mais, recorte inicial, nada registrado ≠ inexistência); atalho para o plano de renovações já filtrado pela instituição quando há contratos na janela de aviso. | `provider-relationship` |
| A — Decision Studio | Duplicar qualquer cenário (pesos copiados, sem resultado); "Recalcular N cenário(s) sem resultado atual" explícito, sem cálculo automático. Motor continua só no servidor (`POST comparison`). | `comparison` |

## Dependências de backend (bloqueadas pelo contrato ainda proposto)

- **Decision Studio — persistência, histórico e autoria** (`decision-scenarios*`): o
  estúdio continua declarando que cenários vivem só na aba. Integração começa quando
  os endpoints estiverem implementados e testados (contrato marca 409
  `scenario_stale`, `expected_version`, `request_key`).
- **Aprovações — `stale_reasons`, `context_coverage`, `context_reference`,
  `action_conditions`**: a interface já aceita `stale_reasons` se vier; não inventa
  códigos nem cobertura.
- **Renewal Workbench — RFQ e decisão vinculadas por contrato e estado "novo contrato
  registrado"**: o contrato hoje não expõe vínculo canônico na listagem; o plano não
  mostra link para RFQ nem afirma renovação concluída. `renewal-operations` resolveria.
- **Action Center consolidado paginado** (`work-intelligence`): a fila continua a
  partir da visão geral (até 100 tarefas abertas, com aviso de leitura parcial).

## Testes

E2E com API simulada (Playwright), Chromium desktop e mobile-chrome, incluindo 320 px
no plano de renovações: `tests/e2e/finance-central.spec.js`,
`finance-passport.spec.js`, `finance-procurement.spec.js`,
`finance-relationship-center.spec.js`. Bundle e jornadas: ver
`docs/perf/bundle-growth-log.json` (entradas de 2026-11-14).
