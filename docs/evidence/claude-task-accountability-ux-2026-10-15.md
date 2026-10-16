# Evidência — responsabilidade de tarefas na experiência (Claude), 15–16/10/2026

HEAD inicial: `main` @ `911ddd14760d5df11c7e4e60208dfaaecf4b028f` (#200–#204 integradas). Branch: a
branch gerenciada da sessão (`claude/wonderful-shannon-is91mw`), reiniciada dessa `main`. Nenhum
arquivo de `api/**`, `lib/api/**`, SQL, rollback, manifesto, `tests/database/**`, workflows ou matriz
foi alterado. Maturidade: M1 + LOCAL_VALIDATED (Demo canônica local com backend real); nada aqui é M3.

## Contrato usado (lido em `lib/api/domains/finance.mjs` e `docs/supabase-financial-task-accountability.sql`)

- `GET tasks` / `overview.tasks`: `assignee_id`, `assignee_name` (nulo se não resolvido), até 200 linhas, sem filtro por responsável.
- `POST tasks`: `assignee_id` opcional (presença = atribuição manual, exige admin/gestor financeiro); `idempotency_key` com hash do conteúdo (mesma chave + mesmo conteúdo → mesma tarefa; conteúdo diferente → 409 `idempotency_key_reused`).
- `PATCH tasks`: `status` e/ou `assignee_id` (`null` desatribui; ausente preserva).
- Banco: só **admin, gestor financeiro e analista** podem ser responsáveis, com escopo de entidade; leitor (viewer) não. O mesmo 403 `task_assignment_forbidden` cobre quem atribui e quem recebe.

## Antes / depois

| Jornada | Antes (main) | Depois |
| --- | --- | --- |
| Criar com responsável | impossível na interface (só título e prazo) | gestor escolhe responsável entre admins, gestores e analistas da empresa; quem não gerencia cria sem responsável e lê por quê |
| Reatribuir / desatribuir | só por API manual | seletor por tarefa (gestor); valor só muda depois da confirmação do servidor e da releitura da lista; "Sem responsável" envia `null` |
| Recusa (403) | — | valor persistido restaurado, mensagem neutra ("permissão ou escopo da pessoa escolhida. Nada mudou."), sem repetição automática |
| Criação com rede instável | cada clique criava uma tarefa nova; falha de rede = toast genérico e possível duplicata | uma chave por intenção: repetir com os mesmos dados reaproveita a chave (sem duplicar); dados alterados pedem descarte explícito e recarregam a lista; duplo clique envia uma vez; campos preservados até a confirmação |
| Ver quem responde | nome solto, ausência invisível | "Sem responsável", "(você)", "Responsável indisponível" (sem nome nem identificador) |
| Visão de trabalho | toggle abertas/concluídas | filtro Abertas / Atribuídas a mim / Sem responsável / Concluídas, persistido na URL, com "N de M tarefas carregadas" (recorte, não visão exaustiva) |
| Painel | tarefa sem responsável aparecia em "Precisa de você" como se fosse de quem lê | "Com você · …" ou "Sem responsável · …"; tarefas de outra pessoa seguem em "Outras tarefas" com o nome |
| Demo canônica | 0 tarefas com responsável | 3 com responsável (uma reatribuída pela API real), demais sem; checagem nova "Tarefas com e sem responsável" (38/38) |

Defeitos encontrados durante a rodada e corrigidos antes do push: candidatos incluíam leitores (o
banco recusaria — achado pelo seed real, 403); `form.append(null)` escreveria "null" na tela (achado por
`check:design`); nome acessível "Responsável da nova tarefa" colidia com "Nova tarefa" (achado pela
suíte de apresentação; ambíguo também para leitor de tela).

## Arquivos

`finance/src/views/company.js` (Tarefas), `finance/src/views/dashboard.js` (Painel), `finance/style.css`
(5 regras), `scripts/demo/dataset.mjs` e `scripts/demo/seed.mjs` (responsáveis sintéticos + checagem),
`tests/e2e/finance-contracts.spec.js` (7 regressões), `tests/e2e/demo-baseline.spec.js` (jornada no backend real).

## Validação

| Verificação | Resultado |
| --- | --- |
| `check:all`, `build`, `check:design`, `check:demo-parity`, `git diff --check` | PASS |
| `test:e2e:list` | PASS (855 casos) |
| `test:e2e` — Chromium desktop + Pixel 7 | PASS: 345 passed, 7 skipped por desenho |
| 7 regressões novas contra o código da base | 7/7 FAIL, como esperado |
| `test:e2e:presentation` — Chromium desktop + Pixel 7 | PASS: 125 passed, 19 skipped |
| Demo canônica local (`demo:local:reset`) | 38/38 checagens |
| `test:e2e:demo` desktop e celular, backend real (Auth/API/PostgREST/Postgres) | PASS: 6 + 1 skip em cada (skip = pool de visitantes, por desenho) |
| Capturas 1440/390 px (Tarefas) antes/depois | `docs/evidence/claude-task-accountability-ux-2026-10-15/`; overflow 0; sem UUID/ISO/null |
| Firefox, WebKit, iPhone | **NOT RUN** localmente (só Chromium 1194); CI `presentation` cobre |
| `test:database` | **NOT RUN** — sem SQL |

Cobertura da jornada no backend real (`demo-baseline`): responsável semeado pela API; reatribuição,
desatribuição e reatribuição com releitura após recarregar; criação idempotente (mesma chave → mesma
tarefa; conteúdo diferente → 409) e cancelamento da tarefa de ensaio; leitor sem controle e com 403 do
servidor; instituição financeira (outra organização) recusada ao ler tarefas da empresa. Observação
ambiental: varreduras seguidas atingem o limite legítimo de requisições do app local ("Muitas
tentativas"); a tela mostrou estado de erro com "Tentar novamente", sem falso sucesso.

## Riscos residuais e handoffs ao Codex

| Item | Esperado | Atual | Sev. |
| --- | --- | --- | --- |
| Código do 403 | distinguir "quem atribui não pode" de "pessoa escolhida não é elegível" (ex.: `task_assignee_ineligible`) | um único `task_assignment_forbidden`; a interface usa mensagem neutra | P3 |
| Candidatos com escopo de entidade | `legal_entity_id` na leitura de tarefas, ou candidatos elegíveis por tarefa | a interface filtra por papel; membro com escopo restrito ainda pode ser recusado pelo servidor (mensagem clara) | P3 |
| Filtro por responsável e paginação | filtro `assignee_id`/`unassigned` no servidor | só os 200 itens mais próximos do prazo; "Atribuídas a mim" é filtro de apresentação e diz "N de M carregadas" | P3 |
| `PATCH tasks` em tarefa invisível/inexistente | 404 sem revelar existência | pela leitura do código, responde 200 sem verificar linhas afetadas (não reproduzido em navegador) | P3 |

PR, SHA e CI: na descrição da PR.
