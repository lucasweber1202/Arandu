# Arandu 10.1 — integração do frontend com as APIs do Arandu 10

Estado: **M1 (existe em código)** nesta branch. Não eleva maturidade de nenhuma
capability hospedada (M3+). Contrato consumido: `docs/integration/ARANDU_10_CONTRACT.md`.

## O que mudou para quem usa

| Frente | Antes | Agora |
|---|---|---|
| Decision Studio (`finance/src/views/rfq/decision-studio.js`, `scenario-library.js`) | Cenários só em `Map` da aba; perdidos ao recarregar | Lista de cenários salvos (ativos/arquivados) lida de `GET decision-scenarios`; rascunho salvo via `POST` (com `request_key`) ou `PATCH` (com `expected_version`); histórico com autor/versão/data (`/detail`, paginado); duplicar (`/duplicate`, idempotente); arquivar (`/archive`); atualizar contexto explicitamente (`refresh_context:true`); comparar 1–3 salvos pelo motor do servidor (`/compare`). O `Map` guarda apenas rascunho não salvo. |
| Executive Action Center (`finance/src/views/work-queue.js`, montado no Painel) | Fila composta só da visão geral | Caixa de trabalho com as quatro seções de `GET work-intelligence` (tarefas, aprovações, demandas, contratos), carregamento sob demanda por seção, cursor independente, filtro de responsável no servidor, contagem “N+” apenas da página, erro localizado por seção, “Assumir” tarefa pelo `PATCH tasks` canônico quando `actions.can_edit`. Aprovações abrem o pedido (sem voto na fila). |
| Renewal Workbench (`contract-center/renewal-workbench.js` → `renewalOperations`) | Cálculo local sobre os contratos já carregados | Com servidor real, `GET renewal-operations` com filtros de responsável (`none` inclui membro removido), urgência (`expired/notice_due/renewing/upcoming`), entidade e intervalo de aviso prévio; filtros na URL (`plano_*`); cursor; tarefas, marcos, RFQs de renovação, RFQ de origem e contrato anterior como links; cobertura de enriquecimento explícita; ação de renovação só com `actions.can_start_renewal`, pela rota idempotente `contract-renewal-rfq`, abrindo a RFQ com `&contrato=` para voltar. O cálculo local permanece apenas no sandbox legado. |
| Approval Workspace (`shared/approvals.js`, `company/approvals.js`, `app.js`) | `stale_reasons` lido; cobertura ignorada | `contextBlocked()` bloqueia voto quando `context_coverage≠complete`, `freshness unknown/historical` ou `action_conditions` negativas, mesmo com `viewer_can_act=true`; brief mostra evidência factual (`context_reference` registrada × atual); `process_ineligible` traduzido; paginação de `approvals` com “Carregar mais pedidos” e aviso de que contagens das abas são da leitura; aviso de atribuições incompletas. |
| Enterprise Intake (`rfq/demand-readiness.js`, aba Visão geral de RFQ em rascunho) | Sem leitura de prontidão do servidor | Painel `#prontidao` com `GET demand-readiness`: itens ausentes/ inválidos, atalho “Preencher” que abre o editor com foco no campo, cobertura, proveniência (dados declarados, revisão), aviso de que sugestões Passport não são aplicadas e anexos não provam autenticidade; falha = “Prontidão não confirmada”. |
| Relationship 360 / navegação | Links para RFQ sem atalho à análise | Link “comparação e cenários” (`#comparacao`) para RFQs em avaliação/decididas; plano de renovações aceita `plano_busca` vindo do relacionamento; RFQ aberta a partir de contrato mostra breadcrumb de volta ao contrato. |

Componentes compartilhados novos (`finance/src/views/shared/operational.js`):
guarda de sequência (descarta resposta fora de ordem), `requestKey`,
`outcomeUnknown`, mensagens dos códigos canônicos (`scenario_conflict`,
`scenario_stale`, `scenario_coverage_limit`, `proposal_coverage_limit`,
400/401/403/404/409/422/429/503), texto de cobertura sem total, rodapé
“Carregar mais” e erro localizado. Permissão de UI `edit_scenario`
(admin/finance_manager/analyst) espelha a RPC; o servidor continua decidindo.

## Invariantes preservados

- Nenhum score, ranking, economia, recomendação ou decisão é persistido pelo
  frontend; o POST/PATCH envia só `name`, `weights` e chaves de controle.
- 409 em edição nunca é repetido automaticamente: a tela oferece reler a
  versão atual ou salvar como novo cenário.
- `coverage.total = null` respeitado: nenhuma contagem global é anunciada.
- Sandbox legado (`/demo`) não ganhou capability: as novas APIs só são
  chamadas com servidor real.

## Evidência

- `tests/e2e/finance-arandu-10-1.spec.js` (9 testes, **API simulada com
  estado**): ciclo completo de cenário com reload, histórico, conflito de duas
  sessões, idempotência após 502, obsolescência e refresh, viewer somente
  leitura; quatro seções com cursor e erro 503; plano de renovações com
  paginação, responsável removido, filtros na URL e renovação idempotente;
  aprovação atual votável × inconclusiva bloqueada; prontidão com atalho e
  falha; 320 px sem rolagem horizontal. Não prova backend real.
- Backend real (stack local descartável, PostgreSQL/GoTrue/PostgREST/Storage,
  todas as migrations incluindo `supabase-financial-arandu-10.sql`):
  `bash scripts/pilot-local/arandu-10-journey.sh` → **54 checks PASS**
  (16/11/2026).
- **Navegador real sem mocks** contra a mesma stack:
  `bash scripts/pilot-local/arandu-10-1-browser.sh` (novo) → **21 checks PASS**:
  cenário salvo e conferido no PostgreSQL (só pesos), recuperado após reload,
  versão 2 no banco, 409 real de outra sessão sem sobrescrita e releitura da
  versão 3, histórico com 3 eventos, duplicação, comparação pelo motor real
  (2 propostas de instituições), arquivamento; prontidão de rascunho; quatro
  seções da caixa de trabalho; plano de renovações com urgência do servidor e
  renovação idempotente (1 evento `renewal_rfq_started`); viewer sem escrita;
  320 px sem rolagem horizontal. Achado do teste real: o motor recusa taxa sem
  indexador — a tela agora mostra o motivo do servidor em vez de texto genérico.
- Performance: sete jornadas `scripts/perf/measure-journeys.mjs --check` dentro
  da baseline (buyer inicial 158.278 B; `main` 159.124 B). Build total registrado
  em `docs/perf/bundle-growth-log.json` (896.872 B, módulos sob demanda); nenhum
  hard limit alterado.
- Navegadores: Chromium desktop e mobile-chrome (Pixel 7) neste executor.
  Firefox e WebKit não estão instalados aqui; ficam para a matriz do CI.

## Demo canônica — diagnóstico (16/11/2026)

Pronto no código: seed (`scripts/demo/seed.mjs`) já cria cenários pela API
real; telas 10.1 consomem as mesmas rotas. Bloqueado em hospedagem / dependente
de autorização: o projeto Demo `offgpyysgdhfemjlchod` (fotografia da auditoria)
não tem a migration `docs/supabase-financial-arandu-10.sql`, usuários nem dados;
o workflow `demo-hosted-seed.yml` só semeia, não aplica migration. Sequência
necessária, **fora desta PR e sob autorização separada**: aplicar as migrations
pendentes no Demo → `npm run demo:reset` pelo workflow com `confirm_ref` →
`npm run test:e2e:demo` contra a URL Demo. A produção (`igacnfjeuqhxcmfyepgj`)
continua bloqueada pelo gate `finance:env:check` até recovery/cutover.
