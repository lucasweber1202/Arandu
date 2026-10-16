# Evidência — ciclo de vida pós-contratação (Claude), 15/10/2026

Base: `main` @ `b84efd3e822a7aa4ef4c89647047f9b9692c7baa` (#200, #201, #202 integradas; a ponta da #200,
`2b1fc0a`, conferida em `origin/main` com `git merge-base --is-ancestor`). Branch: a branch gerenciada da
sessão (`claude/wonderful-shannon-is91mw`), reiniciada dessa `main`. Nenhum arquivo de `api/**`,
`lib/api/**`, outros `lib/finance/**`, SQL, workflows, `package.json` ou matriz foi alterado. Maturidade:
M1 + LOCAL_VALIDATED. E2E de persona não é validação com clientes.

## Jornadas avaliadas (leitura de código e API; Demo local da rodada anterior)

| Jornada | Achado | Dono | Decisão |
| --- | --- | --- | --- |
| A — contrato → implantação (passos 5 e 10) | O cartão do contrato não tinha caminho para o plano de implantação nem para as obrigações; a pessoa precisava ir ao menu, achar a página e filtrar pela instituição à mão (3 interações: menu, filtro, aplicar). | Interface | **Corrigido (LC-1)** |
| B — obrigações (passos 1–2) | Mesmo problema para "Covenants e obrigações". | Interface | **Corrigido (LC-1)** |
| A — detalhe da implantação | O painel de detalhe, composto no servidor, imprime `contrato <uuid> · decisão <uuid>`, `atualizado <timestamp ISO>` e, sem nome, o identificador do responsável (`lib/finance/implementation-presenter.mjs`). UUID/ISO na tela é bug (Constitution §1.5). | Codex (`lib/finance/**`) | Handoff — não mascarado na interface |
| D — renovação | "Abrir concorrência de renovação" já reabre a concorrência existente (API idempotente) e preserva o vínculo pelo evento `renewal_rfq_started`; o contrato não expõe o id da RFQ de renovação para link direto. | Codex | Handoff (P3) |
| C — tarefas | Responsável ainda não existe em `fin_tasks`; nenhuma interface fictícia criada (fase 2 aguarda o contrato do Codex). | Codex | Aguardando |

## Correção LC-1

Cartão de contrato vigente ou em renovação ganha "Implantação com <instituição>" e "Covenants e
obrigações com <instituição>", que abrem as páginas existentes já filtradas por `provider_id` (e
`legal_entity_id` quando o contrato tem entidade). O servidor aplica o filtro (a página lê o parâmetro e o
envia na consulta). O rótulo diz "com a instituição" porque a API não filtra por contrato — não promete um
recorte que não existe. Contrato encerrado não mostra os atalhos.

Atrito medido: do contrato ao plano de implantação filtrado — antes 3 interações (menu → escolher a
instituição no filtro → aplicar), depois 1 clique.

Regressões: `contrato leva à implantação e às obrigações…` (FAIL na base, PASS depois) e
`contrato encerrado não oferece atalhos…` (guarda).

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm run check:all` | PASS |
| `npm run build` | PASS |
| `test:e2e` — Chromium desktop + Pixel 7 | PASS: 331 passed, 7 skipped por desenho |
| Regressão nova contra a base | FAIL como esperado |
| `git diff --check` | PASS |
| Firefox/WebKit | **NOT RUN** localmente (só Chromium 1194); CI `presentation` cobre |
| `test:e2e:demo`, `design:capture` | **NOT RUN** nesta rodada (mudança de navegação sem alteração de layout além de uma linha de links) |
| `test:database` | **NOT RUN** — sem SQL |

## Handoffs ao Codex

| Origem | Esperado | Atual | Sev. |
| --- | --- | --- | --- |
| `lib/finance/implementation-presenter.mjs` (detalhe) | origem como texto (título do contrato, "decisão registrada em …"), data legível, responsável "Não informado" | `contrato ${p.contract_id} · decisão ${p.decision_id}`, `atualizado ${p.updated_at}` (ISO), fallback `${p.owner_id}` | P2 |
| idem, ação de aceite | rótulo sem "ID de Value Realization" digitado à mão | campo de texto pedindo identificador interno | P3 |
| `GET implementations`, `GET covenants` | filtro `contract_id` | só `provider_id`/`legal_entity_id` | P3 |
| contrato em renovação | id da RFQ de renovação na leitura do contrato, para link direto | só no evento `renewal_rfq_started` | P3 |
| `fin_tasks` | `assignee_id`/`assignee_name` | ausente (trabalho do Codex em andamento) | P3 |
