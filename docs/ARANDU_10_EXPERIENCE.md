# Arandu 10 — Experiência empresarial (frontend)

Coordenação: issue #345. PR única do frontend: #346 (branch `claude/great-goldberg-e66w6c`).
Contrato de backend: `docs/integration/ARANDU_10_CONTRACT.md` v1.2, implementado pelo
Codex (#347) e mesclado na `main`, depois nesta branch. O primeiro lote usou só
endpoints pré-existentes; o segundo integra `decision-scenarios*`, `renewal-operations`
e os campos v1.2 de `approvals`. Nada exibe persistência sem resposta do servidor.

Maturidade: M1 (código) com E2E local sobre **API simulada**. Não é validação
hospedada, de release ou de produção.

## Capacidades entregues

| Frente | O que mudou | Endpoints usados (existentes) |
|---|---|---|
| C — Renewal Workbench (v1.2) | Contrato "Renovação iniciada" mostra a concorrência vinculada (evento canônico) com link e estado; "negociação em andamento" para coleta/avaliação; RFQ aberta nunca aparece como contrato renovado; leitura parcial ou falha do vínculo é declarada. | `renewal-operations?urgency=renewing` |
| C — Renewal Workbench | Filtros por estado do ciclo (vigente / renovação iniciada), entidade jurídica e busca, somados ao filtro de responsável; rótulo de estado e entidade por contrato; aviso fixo de que abrir concorrência não renova o contrato; atalhos por grupo de urgência; busca pré-preenchida por `?plano_busca=` vinda do Relationship 360. | `overview`, `contracts` (paginado), `tasks`, `contract-renewal-rfq`, `entities` |
| D — Executive Action Center | Cada pendência explica por que está na posição (estado e prazo já usados na ordenação; não é nota); filtro por tipo (aprovações e decisões, prazos, contratos e renovações, tarefas), combinável com o filtro por origem; "Assumir" tarefa sem responsável, confirmado por releitura do servidor; mensagem própria para combinação de filtros vazia. Sem nova caixa de entrada. | `tasks` (GET/PATCH), `approvals`, `overview` |
| E — Enterprise Intake | Pendências obrigatórias ao vivo no resumo do assistente, em qualquer etapa, cada uma com atalho que leva e foca o campo; contagem de sugestões do Passport mantidas ou alteradas (continuam sugestões); no celular, o título do resumo recolhível mostra quantos obrigatórios faltam. Rascunho segue pelo `rfq-editor` já existente. | `rfq-editor`, `passport`, `rfqs` |
| B — Approval Workspace (v1.2) | Exibe todos os `stale_reasons` (inclui `process_ineligible`), `freshness: unknown` e `context_coverage: incomplete` como bloqueio explícito, e a referência gravada x atual (`context_reference`). Resumo movido para módulo da rota Aprovações para não pesar no Painel. | `approvals` |
| B — Approval Workspace | Resumo "Antes de decidir" no contexto do pedido: proposta e versão submetida x versão atual, quem já participou, o que falta, situação (pode decidir, aguardando outra etapa, expirado, desatualizado); termos da proposta antes da demanda; motivos de desatualização legíveis a partir do `stale_reason` que o servidor já devolve (`rfq_changed`, `proposal_changed`, `source_ineligible`, `context_unavailable`); quando `stale_reasons` existir, cada item é exibido; etapa atual visível na caixa; busca local. Ações continuam no servidor e só aparecem com `viewer_can_act`/vez do aprovador e contexto atual. | `approvals`, `approvals/act` |
| F — Relationship 360 | Seção "Cobertura e origem dos dados" por fonte (contratos, tarefas, solicitações, facilities, saldos, questões, histórico): quantidade carregada, natureza (registro no Arandu, declarado pela empresa, fotografia histórica) e estado (consulta concluída, há mais, recorte inicial, nada registrado ≠ inexistência); atalho para o plano de renovações já filtrado pela instituição quando há contratos na janela de aviso. | `provider-relationship` |
| A — Decision Studio | Duplicar qualquer cenário da aba; "Recalcular N cenário(s) sem resultado atual" explícito. **Cenários salvos na empresa** (módulo sob demanda `scenario-library`): salvar com `request_key` reutilizada após falha incerta; lista ativa/arquivada paginada com versão, autoria, data e pesos; desatualização com motivos (`stale_reasons`); "Atualizar contexto" explícito (PATCH `refresh_context:true` com `expected_version`); duplicar e arquivar no servidor com confirmação; histórico imutável com autoria; comparar até 3 salvos recalculados no servidor — 409 `scenario_stale` não mostra resultado parcial; "Usar na análise" leva pesos à aba. Leitor só consulta. | `comparison`, `decision-scenarios`, `/detail`, `/duplicate`, `/archive`, `/compare` |

## Limitações e dependências restantes

- `work-intelligence` e `demand-readiness` estão disponíveis, mas não foram adotados
  neste lote: o Painel continua sobre a visão geral (até 100 tarefas, com aviso de
  leitura parcial) e o assistente usa as regras canônicas do catálogo no cliente.
  Adotar `work-intelligence` exige redesenhar a fila sem somar páginas (contrato:
  contagens são só da página).
- Estado "novo contrato registrado" na renovação não é inferido: o plano mostra o
  contrato vigente e a concorrência vinculada; o novo contrato aparece no cadastro.
- Plano de renovações consulta só a primeira página (50) de `renewal-operations`
  para vínculos; além disso declara "fora da página consultada".
- E2E com API simulada no formato do contrato; não substitui a jornada HTTP/RLS
  real do backend (`scripts/pilot-local/arandu-10-journey.sh`), nem Demo hospedada.

## Testes

E2E com API simulada (Playwright), Chromium desktop e mobile-chrome, incluindo 320 px
no plano de renovações: `tests/e2e/finance-central.spec.js`,
`finance-passport.spec.js`, `finance-procurement.spec.js`,
`finance-relationship-center.spec.js`. Bundle e jornadas: ver
`docs/perf/bundle-growth-log.json` (entradas de 2026-11-14).

## Evidências visuais

Capturas em `docs/experience/arandu-10/` (desktop 1440 px e 320 px), geradas com
**API simulada e dados sintéticos**, não com a Demo canônica: Action Center e plano
de renovações. A captura de 320 px revelou texto cortado nas linhas do plano
(base flex de 280 px); corrigido neste lote.
