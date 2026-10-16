# Evidência — lifecycle e jornadas operacionais (Claude), 16/10/2026

Baseline: `main` @ `8d1a18d` (#205 integrada), conferida com `git fetch origin main` no início da rodada.
Branch: a branch gerenciada da sessão (`claude/gracious-mendel-2l3lsh`), reiniciada dessa `main`.
Nenhum arquivo de `api/**`, `lib/api/**`, `lib/finance/**`, SQL, rollback, manifesto de migrations,
`tests/database/**`, workflows, `docs/IMPLEMENTATION_MATRIX.md` ou `docs/evidence/codex-*` foi alterado.
Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local, backend real). Nada aqui é M3.

## Objetivos da rodada

Selecionados pela ordem de impacto da missão (integridade → tarefa impedida → contexto → permissão → mobile):

| # | Problema | Impacto | Jornada |
| --- | --- | --- | --- |
| D1 | Leitor marca "concluir" numa tarefa; a API responde **200 sem gravar** (RLS `fin_task_edit` ignora a linha) e a tela anuncia **"Tarefa concluída."** | integridade do dado apresentado | Tarefas e Painel |
| D2 | Leitor recebe formulário "Nova tarefa" e caixas de conclusão que o banco recusa/ignora | permissão apresentada incorretamente | Tarefas e Painel |
| D3 | Falha ao concluir/reabrir mostrava a mensagem crua do servidor; 404/409/rede não explicados | recuperação após erro | Tarefas |
| D4 | Do contrato à Implantação/Covenants: a página de destino não dizia de qual contrato a pessoa veio, que o recorte é por **instituição/entidade e não por contrato**, nem oferecia volta ao contrato | perda de contexto; risco de parecer que a lista é "do contrato" | Contrato → obrigações |
| D5 | "Primeiros passos" oferecia a quem só lê quatro ações de gestão (cadastrar, registrar contrato, nova solicitação) que o servidor recusaria | permissão / primeiro valor | Painel (empresa sem solicitações) |

## Reproduções (antes)

- **D1 no backend real**: Carlos Tavares (Controller, `viewer`) em `/finance/tasks.html`, clique na caixa da
  primeira tarefa aberta → `PATCH /api/finance/tasks` **200** → toast **"Tarefa concluída."** → recarregar → a
  tarefa "Obrigação: Dívida líquida / EBITDA" continua aberta. Registrado em `manifest.json`
  (`repro: viewer-complete`) e na captura `tasks-viewer-click-desktop-before.webp`.
- **D2**: mesma tela antes da ação (`tasks-viewer-*-before.webp`): formulário de criação e caixas visíveis ao leitor;
  Painel com caixas em "Outras tarefas" (`dashboard-viewer-*-before.webp`).
- **D4**: Juliana em Contratos → "Implantação com Lumina Pay" chegava a `implementations.html?provider_id=…`
  sem origem, sem explicação do recorte e sem caminho de volta (`implementations-from-contract-*-before.webp`).
- **D3/D5**: reproduzidos com o servidor simulado fiel ao contrato (E2E abaixo); a Demo não tem empresa vazia nem
  provoca 404/409 em tarefa sem alterar dados.

## Causas

- D1: a interface tratava `2xx` do PATCH como prova de gravação. A API faz `PATCH fin_tasks?id=eq…` e não confere
  linhas afetadas; com RLS, linha fora do alcance de quem pede resulta em 0 linhas e 200 (handoff abaixo).
- D2/D5: os controles usavam só "é membro"; as políticas do banco restringem escrita a admin, gestor e analista.
- D4: o atalho da #203 levava só `provider_id`/`legal_entity_id`; a página genérica (`ledger.js`) não tinha noção de origem.

## Mudanças

| Arquivo | O quê |
| --- | --- |
| `finance/src/views/company.js` | Tarefas: sucesso (concluir, reabrir, reatribuir) só após **reler a lista persistida** e encontrar o estado pedido; senão "O servidor não registrou a alteração" ou "Não foi possível confirmar"; linha ocupada ("Salvando…", `aria-busy`) até a confirmação; leitor vê "Aberta/Concluída" em texto e um aviso no lugar do formulário. Atalhos do contrato levam `contrato=<id>` (só para a página de destino; não vai à API). |
| `finance/src/views/shared.js` | `TASK_EDITORS` (espelho das políticas `fin_task_write/edit`) e `taskChangeError` (403/404/409/rede em linguagem de gente, sem código). |
| `finance/src/views/dashboard.js` | Conclusão rápida relê a tarefa antes de dizer "concluída"; leitor não recebe caixa; "Primeiros passos" para quem só lê explica quem faz e leva às listas legíveis. |
| `finance/src/views/ledger.js`, `implementations.js`, `covenants.js` | Bloco "Vindo do contrato": categoria, instituição, entidade e vencimento; **filtro efetivamente aplicado** ("pode incluir outros contratos com a mesma instituição; o Arandu ainda não filtra por contrato individual"), atualizado a cada aplicação de filtro ("Sem filtro: … todo o seu escopo"); "Voltar ao contrato" (foco no cartão). Id malformado é ignorado; contrato fora da lista carregada não expõe identificador. |
| `finance/style.css` | 5 regras (estado em texto, linha ocupada, bloco de origem). Sem token novo. |

Nenhum componente, modal, animação ou endpoint novo. Seed **não** alterado: os cenários já existem na Demo
(Carlos leitor; implantação da Lumina; covenants do Atlas).

## Regressões automatizadas

`tests/e2e/finance-contracts.spec.js` (servidor simulado fiel ao contrato; `ignoreStatusPatch` reproduz o 200 sem gravação):

1. `tarefas: PATCH 200 sem gravação não vira "Tarefa concluída"…`
2. `tarefas: recusa e falha de rede ao concluir explicam sem mensagem técnica…` (404 com texto técnico do servidor e rede caída)
3. `tarefas: leitor acompanha sem caixa de conclusão nem formulário…`
4. `painel: conclusão rápida só diz "concluída" depois de reler a tarefa…`
5. `painel: leitor vê as tarefas sem caixa de conclusão`
6. `primeiros passos: leitor não recebe ações de gestão…`
7. `primeiros passos: gestor de empresa com contrato existente vê o passo cumprido e o próximo` (guarda)
8. `contrato → implantação: a página diz de qual contrato a pessoa veio, o recorte real e devolve ao contrato`
9. `covenants: origem desconhecida ou malformada não expõe identificador nem inventa contrato`
10. `contrato leva à implantação…` (href atualizado com a origem)

Contra o código da `main`: **9 de 10 FAIL** (a guarda 7 passa por desenho). Com a correção: PASS.

`tests/e2e/demo-baseline.spec.js` (backend real): contrato → implantação com origem, recorte e volta ao cartão;
leitor sem caixa/formulário; PATCH de status do leitor não altera a tarefa (aceita 200/403/404 — hoje 200).

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm ci --include=optional` (Node 24.22.0) | PASS |
| `npm run check:all` | PASS |
| `npm run build` | PASS |
| `npm run check:design` / `check:demo-parity` / `git diff --check` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | PASS: 363 passed, 7 skipped por desenho |
| `finance-contracts.spec.js` após o ajuste final de mobile | PASS: 76 |
| Demo canônica local (`demo:setup`, Supabase local em Docker) | 38/38 checagens |
| `test:e2e:demo` desktop e celular, backend real (Auth/API/PostgREST/Postgres) | PASS: 6 + 1 skip em cada (skip = pool de visitantes, por desenho); `pós-contrato` e `responsáveis de tarefa` repetidos após a janela do limite de requisições |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | PASS: 125 passed, 19 skipped |
| `test:e2e:list` | PASS (900 casos em 20 arquivos) |
| Capturas 1440/390 px antes/depois (backend real) | `docs/evidence/claude-lifecycle-ux-2026-10-16/`; overflow 0 em todas; sem UUID/ISO/null/undefined em `#view` |
| Firefox, WebKit, iPhone (Safari) | **NOT_RUN** localmente (só Chromium 1194 disponível; build 1248 esperado pelo Playwright 1.64 não instalado, `playwright install` vedado). CI `presentation` cobre |
| `test:database` | **NOT_RUN** — sem SQL |

Observação ambiental: o limite legítimo da API (120 requisições/10 min por pessoa) foi atingido pelas capturas
seguidas; a tela mostrou "Muitas tentativas… Tentar novamente", sem falso sucesso. As jornadas afetadas foram
repetidas após a janela.

## Portal do provedor (auditado, sem mudança)

Leitura de `finance/src/views/provider.js` e jornada `provedor` do `demo-baseline` (PASS): rascunho ≠ enviada
(estado e texto distintos), histórico só da própria instituição a partir do snapshot do servidor, conflito de
rascunho (409) bloqueia salvamento e pede recarga, processo encerrado desabilita formulário e upload, isolamento
declarado ("Você não vê propostas de outros provedores…"). Não encontrei defeito demonstrável que coubesse nesta
PR sem contrato novo; não houve alteração para não recriar o que a #200 já entregou.

## Não resolvido nesta rodada

- Detalhe da implantação ainda imprime UUID/ISO compostos no servidor (`lib/finance/implementation-presenter.mjs`) — handoff da rodada anterior, ainda aberto.
- Jornada B (decisão → contrato → implantação → obrigação → renovação) segue com o elo "decisão de origem" só pelo link do cartão; sem id da RFQ de renovação na leitura do contrato (handoff anterior).

## Integração com a `main` após o #206 (Codex)

Durante a rodada a `main` avançou para `ab3dda8` (#206). Ela já entrega o handoff P1 abaixo: `PATCH tasks`
sem linha afetada responde **404** `not_found`, e `GET tasks` ganhou `status`, `assignee_id`, `unassigned`,
`limit` e cursor. Branch atualizada por merge (sem conflito: o #206 não toca `finance/src/**` nem `tests/e2e/**`).
No HEAD integrado: `check:all` PASS, `finance-contracts.spec.js` 76 PASS (desktop + Pixel 7), `demo-baseline`
"responsáveis de tarefa" PASS no backend real com o app reiniciado, e sonda direta: Carlos (leitor)
`PATCH status=done` → **404 not_found**, tarefa continua aberta. A interface trata 404 ("Esta tarefa não está mais
disponível para você. Nada mudou.") e mantém a releitura como defesa. Os filtros server-side de tarefas **não**
são consumidos por esta PR (escopo): a tela continua declarando "N de M tarefas carregadas"; adotá-los é o
próximo passo de interface.

## Handoffs ao Codex

| Prioridade | Endpoint | Comportamento esperado | Problema que resolve | Autorização | Compatibilidade | Aceite |
| --- | --- | --- | --- | --- | --- | --- |
| ~~P1~~ **entregue no #206** | `PATCH /api/finance/tasks` | Conferir linhas afetadas (`Prefer: return=representation`); 0 linhas → **404** `task_not_found` (sem revelar existência) ou **403** quando a linha é visível mas o papel não pode editar | API responde 200 a uma alteração que o banco ignorou (D1, reproduzido no backend real) | mesma do RLS `fin_task_edit` | a interface já trata 403/404 e já relê a lista; mudança é aditiva | Carlos (viewer) `PATCH status=done` → 403/404 e a tarefa continua aberta; `demo-baseline` já aceita 403/404 |
| P3 | `GET implementations`, `GET covenants` | filtro opcional `contract_id` | hoje a página declara que o recorte é por instituição; com o filtro, o atalho poderia mostrar só o contrato | escopo de entidade atual | parâmetro opcional | lista do contrato da Lumina sem itens de outro contrato |
| ~~P3~~ **entregue no #206** (interface ainda não consome) | `GET tasks` | filtro `assignee_id`/`unassigned` e paginação | "Atribuídas a mim" é recorte dos 200 carregados | RLS atual | aditivo | contagem do servidor igual à exibida |

PR, SHA e CI: na descrição da PR.
