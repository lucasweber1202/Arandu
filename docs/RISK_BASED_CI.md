# CI proporcional ao risco — decisão do proprietário v6.2

v6.2 corrige a v6.1 depois do incidente da PR #314 (run 41709875756, ~55min41s,
11 jobs, ~26min29s de fila na Demo Integration): uma mudança de lógica pura de
negociação/sinais foi tratada como crítica porque `lib/finance/*.mjs` caía em C,
`scripts/test-finance-*.mjs` e `docs/FINANCIAL_NEGOTIATION_BOARD.md` caíam em D
(desconhecido), e C/D disparavam a mesma validação integral.

## Contextos obrigatórios

`database`, `deploy-boundaries`, `validate`, `presentation` continuam os quatro
contextos de `ci.yml`, vinculados ao GitHub Actions e ao SHA candidato. Nenhuma
mudança de ruleset é necessária ou foi feita. Cada contexto exige classificação
válida, SHA analisado = SHA do run, `success` em todo caminho exigido pela classe
e `skipped` explícito em todo caminho não aplicável (`scripts/ci/check-result.mjs`).
Falha, cancelamento, ausência ou caminho extra inesperado não passam.

Os quatro jobs finais fazem checkout esparso de `scripts/ci` e usam o Node do
runner: sem `setup-node`, `npm ci` ou restauração de cache (antes: checkout
completo + setup com cache npm em cada um).

## Classes e caminhos

| Classe | O que é | Jobs | Executa | Não executa |
|---|---|---|---|---|
| A | docs funcionais explicitamente listados, estilos/assets | `fast` | audit, `check:all`, build, budgets, assets, SEO, superfície/navegação, smoke Chromium + tour público | banco, Firefox/WebKit, integração |
| B | views/componentes, E2E, módulos puros **verificados**, testes puros **verificados** | `fast` | A + E2E Chromium desktop/mobile das jornadas alcançadas pelo grafo de imports | banco, Recovery, Firefox/WebKit, integração |
| C | API e domínio não crítico (`api/`, `lib/api`, demais `lib/finance`) | `fast` + `backend` (paralelos) | B com todas as suítes Chromium + PostgreSQL real (`test:database`: instalação limpa, upgrade, rollback, RLS, corridas transacionais) | Recovery real, Firefox/WebKit integrais, Demo Integration |
| D | Auth, sessão, permissões, RLS, Storage, Recovery/backup, migrations/SQL, economics/product-terms, deploy/release/Production, workflows/CI, governança, segurança, docs normativos, dependências, **qualquer caminho desconhecido** | `full` + `integration` | matriz integral (3 motores, 5 projetos), banco + export/restore real, deploy-boundaries, apresentação, Demo Integration efêmera | — |

A classe mais alta prevalece. Renomes avaliam origem e destino; remoções contam.
Termos críticos no caminho vencem qualquer allowlist. Labels, nomes de branch e
entradas do autor não reduzem risco.

### Lógica pura (B) é verificada, não presumida

`PURE_MODULES` (risk-policy.mjs) lista os módulos de apresentação/sinais
(`negotiation-next-step`, `negotiation-board`, `central-signals`, `format`,
`presentation`, `command-center`, `navigation`) e `*-presenter.mjs`. No
checkout candidato, o conteúdo precisa passar em `isPureModule`: só imports
relativos `./x.mjs` não críticos; nada de `fetch`, `process`, DOM/`window`,
storage do navegador, `supabase`, `.rpc/.insert/.upsert/.from('tabela')`,
`import()` dinâmico, `eval`. Módulo listado que viola o contrato vai para **D**.

Um `scripts/test-*.mjs` só é B se `isPureTest` aprovar: imports apenas de
`node:assert`, `node:test`, `node:fs` (somente `readFileSync`/`existsSync`) e
módulos não críticos de `lib/finance`; sem processos, rede, ambiente ou escrita.
Os demais testes (API, Auth, RLS, Recovery, CI, governança) continuam D.

Documentação: só `FUNCTIONAL_DOCS` (lista fechada de docs de produto),
`docs/guides|help/*.md` e notas `docs/claude-*-AAAA-MM-DD.md` são A.
Guidelines, CLAUDE/AGENTS/CONTRIBUTING, este documento, runbooks, release,
Recovery, Production, segurança e governança permanecem D.

## Seleção de testes

`scripts/ci/surfaces.mjs` lê o grafo real de imports de `finance/src` e
`lib/finance` no candidato e percorre "quem importa". Cada view alcançada soma
as suítes de `VIEW_SPECS`; arquivo de interface alcançado sem mapeamento
(core, ui, shell, shared, view nova) amplia para todas as suítes financeiras.
Jornadas: negociação → procurement, external-proposals, negotiation-board;
CRM → crm, relationship-center, central; Portal → provider-draft,
external-proposals, procurement; Tarifas → fees, ingestion, contracts.
`company.js` (hub de aprovações/propostas/contratos/provedores/tarefas/
configurações) mapeia para as suítes que visitam essas páginas. Testes puros
herdam as suítes do módulo testado. Remoção ou renome de interface, helper E2E
e classe C usam todas as suítes Chromium. Os testes puros rodam em `check:all`.

## Demo Integration

Antes: `concurrency: arandu-demo-integration` global e sem cancelamento — PRs
independentes esperavam em fila (26min29s na #314). Cada execução usa Docker,
portas e volumes do próprio runner efêmero, nenhum secret, nenhum Supabase
hospedado (refs bloqueados em `/etc/hosts`) e artifact nomeado por
`run_id`/tentativa; não há recurso compartilhado entre execuções. Agora o
grupo é por ref: refs diferentes rodam em paralelo; um push novo na mesma PR
cancela a anterior; main/manual nunca cancelam. E ela só é chamada para D.

## Evidência (local, 04/11/2026, container 4 vCPU — não é runner hospedado)

Reprodução da #314 com o evento real (merge `e93f7f3`, base/head da PR):

| | v6.1 | v6.2 |
|---|---|---|
| Classe | D (doc e 2 testes desconhecidos; 3 módulos C) | B |
| Caminho | full + integration (11 jobs) | fast (6 jobs executados: classify, fast, 4 contextos; backend/full/integration skipped) |
| Suítes Chromium | matriz integral 3 motores | 18/28, desktop + mobile |
| Classificação | — | 35 ms |
| `check:all` (inclui testes puros) | — | 1m02s |
| build | — | ~1 s |
| E2E dirigido (591 testes) | — | 4m57s, 591 passed / 3 skipped |
| Presentation build + tour público | — | ~20 s (11 passed) |
| `test:database` (só classe C) | — | 6m48s |

Estimativa do caminho rápido em runner: ~1 min `npm ci`/audit + ~1 min
`check:all` + ~1 min Chromium (cache) + ~5 min E2E + ~0,5 min apresentação ≈
8–10 min; os quatro contextos finais passam a ser segundos. Execuções da Demo
Integration evitadas: todas as PRs A/B/C. Minutos de runner e tempos reais só
serão afirmados após uma PR B pós-merge; comparar mesma classe de runner,
dataset e cobertura, separando fila de execução.

`node scripts/ci/test-risk-policy.mjs --table` imprime os 36 cenários (CSS,
view, módulo puro, teste puro, doc de produto, API, persistência, Auth, RLS,
migration, Recovery, workflow, doc normativo, desconhecido, renome, remoção,
compartilhados, mistos), as injeções de impureza que escalam para D e a matriz
de estados dos quatro contextos.

## Regras que permanecem

Push main, agenda semanal (segunda-feira 05:17 UTC) e workflow_dispatch executam
D. Regressão pós-merge: registrar run/SHA e severidade, suspender promoção desse
candidato, preservar evidências e corrigir via PR ou reverter código por PR.
Não restaurar banco automaticamente. Release exige full validation e integração
real verdes no MESMO SHA; PR rápida não comprova M3/M4/M5 nem autoriza
publicação/cutover. A própria mudança de CI é D e valida a matriz integral.

## Execução integral 7.0 (classificação v6.2 preservada)

O workflow full passa a usar preflight de fonte/build e dois grupos balanceados
de navegadores, com união exata de recibos por caso/projeto/SHA. `full` só é
success com preflight, ambos os grupos, coverage, SQL, apresentação e
deploy-boundaries concluídos. A integração real continua separada e obrigatória
para D. Nada nesta divisão reduz a classe de risco ou usa CI anterior como prova.
Detalhes e métricas: [CI_ACCELERATION_V7.md](CI_ACCELERATION_V7.md).
