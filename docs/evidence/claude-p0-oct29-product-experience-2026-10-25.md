# P0 29/10 — experiência de produto e visita pública (Claude, 25/10/2026)

Frente de UX/visita pública. Não altera backend, migrations, CI, scripts de
estação/deploy, runbooks do operador nem a Implementation Matrix. Não declara
publicação no domínio: a verificação de `arandu-demo.vercel.app` após o merge é do Codex.

## Base e ambiente

| Item | Valor |
| --- | --- |
| Base | `main` `f57cbfa028a8482c4ff8a847cf7bb9377c3d00f2` (PRs #262–#264 integradas) |
| Branch | `claude/trusting-brahmagupta-q1h1o2` |
| Ambiente de captura | Demo canônica **local** (`npm run demo:setup`, Docker: Postgres, GoTrue, PostgREST, Storage), `ARANDU_ENV=demo`, seed `scripts/demo/seed.mjs` 39/39, app em `https://localhost:4443` servindo o build do commit |
| Executor | Container efêmero (não é a estação do owner: no máximo PREPARED, nunca READY) |
| Viewports | Desktop 1440×900, mobile 390×844 |
| Personas | Juliana Ramos (comprador), Helena (aprovação), Eduardo Lima (Atlas Bank) |

## Auditoria — achados observados

| # | Achado | Superfície | Gravidade / impacto na demo | Evidência |
| --- | --- | --- | --- | --- |
| 1 | Etapa "O contrato registrado" da visita é rotulada **Processo C** (Lumina, adquirência) mas a captura mostrava o cartão do **Atlas, crédito (Processo D)** no topo. O visitante via um contrato diferente do descrito | Visita pública `#contrato` | Alta — continuidade enganosa no ato 4 | `evidence-p0-oct29/contrato-desktop-antes.webp` |
| 2 | Capturas da visita eram do commit `bebc553` (22/10), anteriores ao painel "Trabalho deste contrato" (#262–#264: solicitação de origem, relacionamento, tarefas do contrato). A visita não mostrava a continuidade contrato → origem → trabalho | Visita pública | Média — fidelidade ao produto atual | `demo/visita/captures.json` (antes `bebc553`) |
| 3 | No celular (390 px) o painel "Trabalho deste contrato" estourava a largura: o atalho "Solicitação de origem: <título>" não quebrava linha e alargava a seção para ~580 px, cortando texto e os botões "Abrir tarefa"/"Concluir tarefa" | Produto: Contratos → Abrir contrato | Alta no mobile — ação principal fora da tela | `evidence-p0-oct29/contrato-drawer-mobile-antes.webp` |

Varredura sem defeito novo: 20 rotas do comprador e 2 do portal da instituição
em 390 e 1440 px, sem rolagem horizontal da página. Respostas "Muitas
requisições" nessa varredura vieram do limite da API local provocado pela
própria navegação rápida, não de defeito da tela.

## Correções

| # | Mudança | Arquivos |
| --- | --- | --- |
| 1–2 | A etapa de contrato agora enquadra o cartão da Lumina e abre o painel somente leitura "Abrir contrato" (origem, relacionamento, tarefas). Texto da etapa descreve exatamente isso e diz que concluir tarefa não altera contrato. Todas as 13 etapas recapturadas da Demo canônica local no commit `7de5d47` | `lib/public-tour.mjs`, `scripts/design/capture-tour.mjs`, `scripts/generate-public-tour.mjs`, `demo/visita.html`, `demo/visita/*` |
| 3 | Seção do painel encolhe (`min-width:0`) e atalhos do painel quebram linha | `finance/style.css` |
| — | Teste de regressão mobile (falha sem a correção: 110 nós fora da tela; passa com ela) | `tests/e2e/finance-contracts.spec.js` |
| — | Roteiro comercial em 5 atos com perguntas, limites e plano C pela visita | `docs/demo/ROTEIRO_COMERCIAL_5_ATOS_29-10.md` |

## Evidência visual

| Arquivo (`docs/demo/evidence-p0-oct29/`) | Commit | Rota | Viewport | Persona | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `contrato-desktop-antes.webp` | `bebc553` | `/finance/contracts.html` | 1440 (reduzida a 1120) | Juliana | `bf2d68fa…126b` |
| `contrato-desktop-depois.webp` | `7de5d47` | `/finance/contracts.html` + Abrir contrato (Lumina) | 1440 (1120) | Juliana | `71488a6d…b390` |
| `contrato-drawer-mobile-antes.webp` | `38c8068` (UI = `f57cbfa`) | idem | 390×844 | Juliana | `9667554f…c95c2` |
| `contrato-drawer-mobile-depois.webp` | `7de5d47` | idem | 390×844 | Juliana | `1ae00c58…4922` |

Fonte dos dados: seed sintético Vitta Foods pela API real local. Resultado
esperado: contrato da Lumina com origem e tarefas, sem corte no celular.
Observado: conforme as imagens "depois". Limitação: capturas locais, não do domínio público.

## Testes executados

- `npm run check:all` — OK (inclui `check:design` e `check:demo-parity`)
- `npm run build` e `npm run build:demo` — OK
- `npm run check:links` — OK
- `tests/e2e/public-tour.spec.js` — 11 passaram, 1 ignorado por desenho (teclado no mobile), Chromium desktop + Pixel 7
- `tests/e2e/finance-contracts.spec.js` — 116 passaram (Chromium desktop + Pixel 7)
- Firefox/WebKit não instalados neste executor: ficam para os quatro gates da PR.

## Limitações, riscos e próximo gate

- A visita pública segue **informativa** (M2); nenhuma escrita de backend é alegada. M3 hospedado não comprovado.
- O painel mostra "Concluir tarefa" na captura: na visita é imagem; o texto diz que nada é gravado.
- Para Codex (não é UI): tarefas de implantação geradas pelo seed aparecem "Sem responsável"; é dado do seed/rotina, não da tela — mesmo padrão do risco já registrado para a tarefa de covenant.
- Próximo gate: quatro checks verdes no HEAD da PR; após o merge, publicação e smoke externos do domínio pelo Codex.

## Rollback

Reverter o commit da PR. A visita volta às capturas de `bebc553`; o painel de contrato volta ao corte no celular. Sem dados, migrations ou configuração envolvidos.
