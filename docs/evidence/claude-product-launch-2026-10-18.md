# Evidência — product excellence e Demo de 29/10 (Claude), 18/10/2026

Base: `main` @ `c359cb9` (#220 integrada). Branch: a branch gerenciada da sessão, reiniciada dessa `main`.
Área exclusiva: `finance/src/**`, `finance/style.css`, `tests/e2e/**`, `docs/demo/PRESENTATION_2026-10-29.md` e este
documento. **Nenhum** arquivo de `api/**`, `lib/**`, SQL/migrations/RLS/Auth/Storage, scripts de recovery/deploy,
workflows, `package.json`/lock, `AGENTS.md`/`CLAUDE.md`/guidelines, `docs/IMPLEMENTATION_MATRIX.md` ou evidências do Codex.
Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local, backend real em Docker). **Demo hospedada não validada.**

## Estado por categoria

| Categoria | O quê |
| --- | --- |
| IMPLEMENTED | 11 correções abaixo (C1–C11) e roteiro de 29/10 atualizado |
| LOCAL_VALIDATED | regressões novas: **8 FAIL na `main`, PASS aqui**; `check:all`, `check:design`, `build`, `git diff --check`; `test:e2e` 442 passed + 10 skipped e `test:e2e:presentation` 125 passed + 19 skipped (Chromium desktop + Pixel 7); `test:e2e:demo` (backend real) desktop e celular 6 passed + 1 skipped cada; `design:capture` antes/depois |
| CI_VALIDATED | quatro gates no HEAD da PR — ver PR |
| HOSTED_VALIDATED | **nenhum** |
| NOT_RUN | Firefox, WebKit e iPhone localmente (navegadores não instalados neste executor; o CI roda os cinco motores); `test:database` (sem SQL) |

## Método

1. Demo canônica local (`npm run demo:setup`, seed 39/39, `https://localhost:4443`), personas fictícias.
2. Auditoria exploratória **só de leitura** com Playwright (script local fora do repositório): 1440 px e 390 px, compradora
   (Juliana, Rafael, Helena) e instituição (Patrícia/Meridian), 22 telas + detalhes de RFQ, contrato e proposta. Checagens
   automáticas por tela: UUID/ISO/enum na tela, overflow horizontal, mais de um botão primário, campo sem rótulo, controle sem
   nome acessível, alvo de toque < 24 px, salto de heading, texto cortado, erros de console. Cada achado automático foi
   conferido na captura; falsos positivos estão no fim.
3. `npm run design:capture -- --label=before` (46 capturas, `c359cb9`, 0 overflow, 0 erros) antes de qualquer build desta branch.
4. Correção → regressão E2E → prova contra `main` (worktree limpa com os testes novos) → `design:capture --label=after`.

## Ferramentas do toolkit (`docs/FRONTEND_AGENT_TOOLKIT.md`)

| Ferramenta | Estado | Uso |
| --- | --- | --- |
| Taste Skill (`Leonxlnx/taste-skill`, MIT, commit `f624f37`) | **lida, não instalada** (clone de leitura fora do repositório; nada em `~/.claude/skills`) | Consultiva. As "house rules" são para sites de marketing (sem bordas, sem números de etapa, sem cards); a Design Constitution prevalece. Usada só para o critério "uma ação primária por tela" e "título inteiro antes de cortar". |
| Web Design Guidelines (`vercel-labs/agent-skills`, skill `web-design-guidelines`, commit `063bee9`; regras em `web-interface-guidelines/command.md`) | **lida, não instalada** | Checklist aplicado pelo script de auditoria e na revisão manual: rótulos, nome acessível, alvos de toque, semântica de headings, overflow, contagem com numeral e plural correto, mensagens com próximo passo. |
| Awesome Design MD (`VoltAgent/awesome-design-md`, MIT, commit `3b60532`) | **lida, não usada** | Nenhum padrão importado; nenhum token novo. |
| Image to Code | **não usada** | Não havia screenshot autorizado de terceiro que justificasse. |
| Playwright CLI (`microsoft/playwright-cli` 0.1.22, Apache-2.0) | **não instalada** | Depende de `playwright@1.64.0-alpha`; instalar trocaria o motor do executor. A exploração usou o `@playwright/test` já instalado, sem alterar `package.json`. |

## Defeitos reproduzidos e corrigidos

| # | Prior. | Onde / persona | Antes (`main`) | Depois | Regressão |
| --- | --- | --- | --- | --- | --- |
| C1 | **P1** | Contratos — gestora | O cartão procurava `contract.rfq_id`, que a API **não devolve** (o contrato guarda `decision_id`). Resultado: "Ver processo e decisão de origem" **nunca aparecia** — e o roteiro de 29/10 (passo 8) prometia o link. Nenhum contrato mostrava de qual solicitação veio | Origem resolvida pela decisão registrada da solicitação (`rfq.decision_id`); título da solicitação no topo do cartão e link ao lado de "Abrir contrato". Carteira existente continua sem origem (nada inventado) | `finance-procurement`: "contrato nascido de decisão…" |
| C2 | P2 | Implantação → "Abrir contrato de origem" | Link com `?id=` caía na lista sem destacar o contrato | `?id=` destaca e foca o cartão, como `#contract-…` | idem |
| C3 | **P1** | Celular — Implantação, Covenants, Tarifas, Spend, Valor, Performance, Oportunidades, Qualificação, Documentos (tabelas compostas no servidor) | No celular o cabeçalho é ocultado, mas as células não tinham `data-label`: a linha virava valores soltos ("Aguardando dados · 03 de out · Ausentes · Juliana Ramos") sem dizer o que cada um é | Cada valor com o rótulo da coluna; título como linha principal; "Detalhe" alinhado | `finance-implementations`: "no celular, cada valor aparece com o seu rótulo" |
| C4 | P2 | Painel — celular | "Inteligência de valor" (~1.800 px) ficava no meio da coluna principal: renovações e "Outras tarefas" iam para o **fim** da página | Trabalho primeiro (§35.8): processos, atividade, renovações e tarefas; a inteligência de valor vem depois, em largura total (no desktop ocupa a largura inteira, menos altura) | `finance-procurement`: "painel: renovações e tarefas vêm antes…" |
| C5 | P2 | Tarefas — gestora | Lista plana de 19 tarefas: o que venceu e o que vence em 610 dias com o mesmo peso | Abertas agrupadas: **Vencidas · Próximos 7 dias · Mais adiante · Sem prazo**, com contagem; ordem do servidor mantida; contagem do filtro continua sendo a do carregado | `finance-contracts`: "tarefas abertas agrupadas por urgência…" |
| C6 | P2 | Portal da instituição — celular | Cabeçalho sem o nome do comprador e resumo "O que a empresa pediu": no celular a instituição não via **quem** pediu | "Solicitado por Vitta Foods" no topo (desktop e celular) e "O que Vitta Foods pediu"; sem `buyer_name`, nada é inventado | `finance-provider-draft`: "proposta: quem pediu aparece…" |
| C7 | P2 | Portal da instituição — celular | Barra fixa de envio com 3 linhas de status e botões quebrados: com cabeçalho e menu inferior, cobria metade do formulário (~150 px) | Status em 2 linhas compactas, botões lado a lado com 44 px de alvo; em 320 px sem ícone para o rótulo caber | idem (altura ≤ 1/5 da tela em 320 px) |
| C8 | P2 | Instituições — 1440 px | Tabela 71 px mais larga que o cartão: coluna "Verificação" cortada atrás de rolagem horizontal | Cabeçalhos honestos ("carregados") quebram linha; tabela cabe | `finance-procurement`: "instituições: a coluna de verificação cabe…" |
| C9 | P2 | Detalhe da RFQ, conversa do processo, Configurações | 2–3 botões primários na mesma tela ("Acompanhar aprovação" + "Convidar" + "Publicar comentário") | Uma ação primária por tela; "Convidar" e "Publicar comentário" secundários | auditoria (contagem de primários) |
| C10 | P3 | RFQ, Painel, Contratos, Portfólio | "3 convidado(s) · 2 responderam", "proposta(s)", "facility(ies)", "tarefa(s)" | Singular/plural corretos (`plural()` em `core.js`); "1 respondeu" | `finance-procurement` + `demo-baseline` (texto atualizado) |
| C11 | P3 | Nova solicitação, Painel | Etapa com número duplicado ("1 1. Produto"); título de tarefa cortado com reticências na lateral do Painel | Número uma vez (no círculo); título da tarefa em até duas linhas | `finance-procurement` (assistente) |

**Prova de regressão:** worktree limpa de `origin/main` (`c359cb9`) com os testes novos: 8 testes FAIL (Chromium desktop e
Pixel 7; o de instituições só roda no desktop). Nesta branch: PASS.

## Auditado sem defeito novo demonstrável

Comparação (unidades, a.m./a.a., indexador e spread separados, "não informado", versões e "alterado na v2 · antes", pesos do
cliente, sem ranking); aprovações (etapa, quem aprovou, quem falta, proposta e versão); decisão bloqueada por aprovação
pendente ("Sua empresa exige aprovação antes da decisão"); registro de contrato existente (erros específicos por campo, foco no
primeiro); cadastro de instituição; contexto de convite e isolamento ("Você não vê propostas de outros provedores…");
site público (capturas reais rotuladas como demonstração, "O que existe hoje, sem exagero"). Correções de #216/#218/#220 não
foram repetidas.

**Falsos positivos da auditoria automática** (registrados para não virarem "bug" depois): botão "Anexar documento" sem nome
(está dentro de `<details>` fechado); rádios de 16 px (o alvo é a linha inteira do `<label>`); "Pular para o conteúdo" pequeno
(só aparece no foco); datas `mm/dd/yyyy` nos campos de data (formato nativo do Chromium sem locale do sistema; o valor
enviado é ISO).

**Não alterado de propósito:** formato `dd/mm/aaaa` nas tabelas compostas no servidor (presenters de `lib/finance`, do Codex;
testes de tarifas e oportunidades o fixam) — ver handoff H-7.

## Capturas

`design:capture` (Demo canônica local, 1440 e 390 px, 23 superfícies × 2): `before` em `c359cb9`, antes de qualquer build desta
branch, e `after` em `68045a8` — ambas **46/46, 0 overflow, 0 erro de página** (manifestos em `reports/design/*`, não
versionados). A primeira tentativa do `after` teve 5 telas com "Muitas requisições" (cota legítima da API logo após
`test:e2e:demo`); repetida depois da janela de 10 min, sem erro.

Pares focados em `claude-product-launch-2026-10-18/` (mesma Demo, mesmo seed):

| Par | Mostra | Origem |
| --- | --- | --- |
| `contracts-desktop-{before,after}` | C1: título da solicitação de origem e "Ver processo e decisão de origem" nos dois contratos de concorrência; fiança sem origem | `design:capture` |
| `implementations-mobile-{before,after}`, `covenants-mobile-{before,after}` | C3: valores soltos → "Estado · Bloqueada", "Go-live previsto · …" | página inteira, 390 px; antes = auditoria exploratória antes do C3 |
| `dashboard-mobile-{before,after}` | C4: renovações e tarefas antes da inteligência de valor | página inteira, 390 px (antes: Juliana na `main`; depois: Rafael, para poupar a cota da Juliana — mesma organização, mesmos dados) |
| `tasks-desktop-{before,after}` | C5: Vencidas · 1, Próximos 7 dias · 7, Mais adiante · 11 | `design:capture` |
| `provider-proposal-mobile-{before,after}` | C6/C7: "Solicitado por Vitta Foods", "O que Vitta Foods pediu", barra compacta | 390 px, Patrícia (Meridian) |
| `providers-desktop-{before,after}` | C8: coluna Verificação visível em 1440 px | `design:capture` |

## Validação

| Verificação | Resultado |
| --- | --- |
| Node 24.22.0, `npm ci --include=optional`, `check:all`, `check:design`, `build`, `git diff --check` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | 442 passed, 10 skipped (skips por projeto: testes só de celular ou só de desktop) |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | 125 passed, 19 skipped |
| `test:e2e:demo` (backend real) | `demo-desktop` 6 passed + 1 skipped; `demo-mobile` 6 passed + 1 skipped (a primeira execução no celular teve 3 falhas por "Muitas requisições" — cota legítima após a captura; repetida depois da janela, PASS) |
| Regressões novas contra `main` | 8 FAIL |
| Firefox, WebKit, iPhone | **NOT_RUN** localmente (`npm run test:e2e` sem filtro: 678 falhas de "navegador não instalado" nesses três projetos, nenhuma de asserção); o gate `presentation` do CI cobre os cinco motores |
| `test:database` | NOT_RUN — sem SQL |

## Handoffs ao Codex

| ID | Prior. | Operação | Atual | Problema na interface | Desejado | Teste |
| --- | --- | --- | --- | --- | --- | --- |
| H-7 | P3 | presenters de `lib/finance/*-presenter.mjs` (implantação, covenants, tarifas, oportunidades) | datas `dd/mm/aaaa` | o resto do produto usa "7 de nov de 2026"; numérico é ambíguo para leitores fora do Brasil | formato único (sugestão: o de `formatDate`), atualizando os testes que fixam o atual | `finance-fees`, `finance-opportunities` |
| H-8 | P3 | `GET contracts` | só `decision_id` | a interface acha a origem pela lista de solicitações carregada (até 200) | (opcional) `rfq_id`/`rfq_title` derivados da decisão, para contratos fora do recorte | `finance-procurement`: "contrato nascido de decisão…" |
| H-4/H-5/H-6 | P2/P3 | 429, registros sem chave idempotente, voto incerto | inalterados (ver #216/#218) | — | — | — |

## Riscos e limites

- Demo hospedada não validada; nada aqui prova Preview/Production.
- C1 depende da solicitação de origem estar no recorte carregado (até 200 solicitações); fora dele, o link não aparece (nunca
  aponta para lugar errado) — H-8.
- C5 agrupa só as tarefas **carregadas** (paginação existente); "Carregar mais" acrescenta aos grupos.

## Rollback

Reverter a PR (interface, testes e roteiro). Nenhum contrato de API, dado ou migration.
