# Demo — Workspace Architecture & Design System 2.0 · revisão

Rodada exclusiva da demonstração (`/demo/*`). A aplicação oficial (piloto e
produção) não mudou visual nem comportamento. Este documento descreve o que
mudou, por quê, como foi verificado e o que precisa de olhar humano.

- Base: `main` @ `723d14de3322220d72ad3fa95ec35fe6947b69fc` (conferida com
  `git fetch` no início da rodada; `pilot` estava 9 commits atrás de `main`).
- Evidência: `artifacts/demo-workspace-v2/before/` (capturado **antes** de
  qualquer mudança, commit `6f7407f`) e `artifacts/demo-workspace-v2/after/`.
- Roteiro de captura: `node scripts/demo-workspace-screenshots.mjs <before|after>`
  (depois de `npm run build:demo`). O script nunca sobrescreve o baseline.

## Estado anterior

A demo já tinha uma camada de experiência madura (PRs #86 e #87): shell com
barra lateral agrupada, painel personalizável, quick view, Ctrl+K, visões
salvas, workspace de comparação e leitura de aprovação. O que ainda pesava:

- **Módulos antes de trabalho.** A barra lateral era Trabalho/Gestão por tipo
  de tela; o início tinha "Precisa de você", mas logo abaixo vinham números
  (Concorrências ativas, Propostas recebidas…) e o pipeline — cara de BI.
- **Próxima ação sem gramática.** Cada tela dizia o próximo passo com palavras
  próprias: "Avaliar e decidir" na lista, "Compare, peça aprovação e decida" no
  detalhe, "Aprovar: …" no início. O mesmo objeto parecia outro em cada lugar.
- **Status técnico no lugar de ação.** A lista mostrava "Em avaliação" para uma
  solicitação que, na verdade, aguardava o CFO.
- **Aprovar sem ler.** A caixa de aprovações tinha Aprovar/Rejeitar na própria
  linha (com confirmação, mas sem passar pelo contexto).
- **Filtros desconexos.** Busca, três selects, chips de status, abas de visões e
  "+ Nova visão" — cinco linguagens para filtrar.
- **Comparação sem síntese.** Matriz completa sempre, sem dizer onde as
  propostas diferem nem quantas estão completas; a estimativa do Arandu vinha
  destacada como "menor valor estimado" dentro da matriz, perto demais de
  parecer recomendação.
- **Provedor com nomes trocados.** Barra lateral "Oportunidades · Código de
  convite", barra inferior "Convites · Propostas" apontando para Oportunidades.
  Depois de enviar, só um aviso passageiro e recarregar.
- **Configurações misturadas.** Empresa, "Seu nome e cargo", perfil,
  política, notificações, equipe, demonstração e aparência numa lista plana.
- **Personalização exposta cedo.** O painel de preferências abria com presets,
  quatro densidades, quatro estados de barra, cinco cores e movimento.
- **Personas sem continuidade.** Trocar de papel levava ao painel da persona,
  não ao mesmo processo visto por ela.

## Estratégia adotada

1. **Uma gramática antes de telas.** `finance/demo/workspace/next-action.js`
   (módulo puro, testado em Node) responde, para solicitação, aprovação,
   contrato, tarefa e oportunidade do provedor: **estado · próxima ação · por
   quê · prazo · responsável**. Toda superfície usa a mesma função; a mesma
   solicitação diz a mesma coisa no início, na lista, no inspector, no detalhe,
   na caixa de aprovação e na busca.
2. **Três profundidades explícitas.** *Inspector* (entender rápido, ao lado da
   lista) → *Workspace* (a página do objeto, para operar) → *Foco* (comparação).
3. **Governança como fluxo.** A caixa de aprovação leva a "Revisar decisão";
   as ações existem só no contexto, na ordem de leitura de quem decide.
4. **Estrutura sentida, não desenhada.** Menos cartões e bordas; régua fina,
   espaço, tipografia. Uma marca visual própria: o **trilho** (fio vertical no
   tom do estado) em tudo que pede ação.
5. **Tudo sob a trava da demo.** Os módulos novos só existem no pacote
   demonstrativo; o gate de fronteira do build oficial foi estendido para
   provar isso (ver "Isolamento").

## Mudanças implementadas

| Área | O que mudou | Onde |
| --- | --- | --- |
| Gramática da próxima ação | estado · ação · por quê · prazo · responsável para RFQ, aprovação, contrato, tarefa e oportunidade; prazo muda com a fase (resposta na coleta, validade da proposta na avaliação, aviso prévio no contrato) | `next-action.js`, `work-ui.js` |
| Navegação | grupos **Meu trabalho** (Início, Aprovações, Tarefas) · **Processos** (Solicitações, Propostas, Contratos) · **Rede** (Provedores) | `shell.js` |
| Início | fila "Precisa de você" com trilho, ação, motivo, prazo e botão; "Em andamento" com estado e próxima ação de cada processo; números ("Indicadores") só no fim; "Personalizar" discreto | `dashboard.js`, `personas.js`, `presets.js` |
| Lista de solicitações | coluna Status mostra o estado real ("Em aprovação"); "Próxima ação" com motivo; no celular, "2/3 respostas · 3d" em vez de esconder | `table-preferences.js` |
| Inspector | ≥ 1360 px: lista \| resumo ancorado, não modal, ↑/↓ (ou j/k) trocam o item, Esc fecha e devolve o foco, item marcado com `aria-current`; abaixo disso, quick view | `inspector.js`, `quick-view.js` |
| Filtros | `[Status: …] [Produto: …] [Responsável: …] [Ordenar: …]` com × para limpar; "Salvar filtro" só aparece com uma combinação nova; "Minhas visões" virou **Filtros salvos** (renomear, atualizar, fixar, excluir com desfazer preservados) | `filters.js`, `saved-views.js` |
| Detalhe da RFQ | painel da **fase atual** (Rascunho: completar → convidar → abrir; Coleta: 2/3 e prazo; Avaliação: propostas completas/ausentes; Aprovação: etapa e quem; Decidida: registrar contrato); ação principal do cabeçalho rebaixada para não competir | `rfq-page.js` |
| Continuidade | "Continuar como Ricardo" (mesmo pedido na caixa dele), "Ver como Camila (Atlas Bank)", "Ver como Marina (empresa)" no provedor, "Registrar a decisão" de volta à Marina, "Ver governança como Helena" | `handoff.js` |
| Comparação | síntese factual (propostas, completas, com ausências, revisão anterior, validade mais próxima); "Onde as propostas mais diferem" (variação relativa entre valores informados, rotulada como fato); modos **Diferenças** (padrão) · Todos os critérios · Campos ausentes; matriz por grupos tipográficos, sem grade; estimativa sem ênfase de destaque | `compare.js` |
| Estimativas | bloco próprio "Calculado pelo Arandu com hipóteses": valor ou motivo de não calcular, "Ver cálculo" (fórmula, hipóteses, parcela ou variável+fixo, CET informado quando houver), "não é CET" e **Não considerado** | `compare.js` (usa `lib/finance/products.mjs` sem alterá-lo) |
| Aprovações | **caixa de decisão**: lista \| contexto (≥ 1100 px) ou folha (celular). Contexto na ordem 1 Quanto? 2 Qual proposta? 3 Quais condições? 4 Por quê? 5 Diferenças materiais (só onde diferem, ↓/↑ menor/maior informado) 6 Quem pediu? 7 Etapa 8 Decisão. Ações Pedir alterações · Rejeitar · Aprovar, só no contexto; depois de decidir, volta para a fila | `decision-inbox.js`; `finance/app.js` aplica `workspace.views` |
| Provedor | Oportunidade / Proposta / Convite coerentes na barra lateral, barra inferior e busca; próxima ação em cada oportunidade; "A solicitação mudou" com diff campo a campo do histórico publicado e "Atualizar proposta"; "✓ Proposta vN enviada · Responde à revisão N · Você ainda pode revisar…" | `provider-portal.js`, `shell.js`, `responsive.js`, `command.js` |
| Configurações | **Minha conta** (nome e cargo, notificações, aparência) · **Empresa** (dados, perfil financeiro) · **Governança** (equipe, política) · **Demonstração** (restaurar, simular falha, console) — mesma página, mesmas âncoras | `settings-architecture.js` |
| Personalização | superfície: Tema (Sistema/Claro/Escuro) e Densidade (Confortável/Compacta); o resto em "Preferências avançadas" (nada removido) | `index.js` |
| Central de comando | vazio: **Seu trabalho** primeiro; busca: objetos → páginas → ações → filtros → administração → personas e aparência; aprovações buscáveis | `command.js` |
| Landing | fluxo Necessidade → Convites → Propostas → Comparação → Aprovação → Contrato → Renovação; **Explorar livremente** e **Ver processo completo** (roteiro de 7 passos pelas 4 personas, barra discreta, sem balões) | `demo/index.html`, `landing.js`, `route.js` |
| Design system | "papel e tinta": fundo de papel quente, tinta quase preta, índigo Arandu mais profundo como único destaque, cor semântica só com significado, trilho como marca; cartões viram seções; números tabulares; alvos ≥ 44 px no celular | `experience.css` §19 |
| Registro local | `arandu-demo-workspace` v2 → **v3** ("Em andamento" entra depois de "Precisa de você", inclusive em layout personalizado). Novas chaves de sessão: `arandu-demo-route`, `arandu-demo-proposal-seen` | `preferences.js` |

## O que deliberadamente não foi alterado

- Nenhuma migration, Supabase, RLS, RBAC, API, contrato de domínio, regra
  financeira, cálculo (`lib/finance/*` intacto), ordenação ou score.
- Nenhuma recomendação, "melhor", "vencedor" ou ranking do Arandu; nenhuma IA
  ou chatbot; nenhum gráfico decorativo.
- Nenhuma dependência, framework, fonte remota ou asset novo.
- Nenhuma tela do produto foi removida; nenhuma capacidade escondida sem
  caminho (presets, densidades, barra, cores, movimento, comportamento, painel
  personalizável, colunas, favoritos e filtros salvos continuam acessíveis).
- Os dados fictícios (`seed.js`, `engine.js`) não mudaram.
- As telas oficiais em `finance/src/views/*` não mudaram.

Código compartilhado tocado: **uma linha** em `finance/app.js`
(`Object.assign(VIEWS, workspace.views || {})`), dentro do bloco que só roda
quando a camada da demo foi carregada — `workspace` é `null` fora de `/demo`.

## Comparação por persona

Pares de captura com mesmo viewport, persona, estado (demo restaurada) e objeto:

| # | Tela | Antes | Depois |
| --- | --- | --- | --- |
| 01 | Landing 1440 | `before/01-landing-desktop.png` | `after/01-landing-desktop.png` |
| 02 | Início comprador 1440 | `before/02-buyer-home-desktop.png` | `after/02-buyer-home-desktop.png` |
| 03 | Solicitações 1440 | `before/03-rfqs-desktop.png` | `after/03-rfqs-desktop.png` |
| 04 | Capital de giro 1440 | `before/04-rfq-detail-desktop.png` | `after/04-rfq-detail-desktop.png` |
| 05 | Comparação 1440 | `before/05-comparison-desktop.png` | `after/05-comparison-desktop.png` |
| 06 | Aprovação (Ricardo) 1440 | `before/06-approval-desktop.png` | `after/06-approval-desktop.png` |
| 07 | Provedor início 1440 | `before/07-provider-home-desktop.png` | `after/07-provider-home-desktop.png` |
| 08 | Proposta Atlas 1440 | `before/08-provider-proposal-desktop.png` | `after/08-provider-proposal-desktop.png` |
| 09 | Admin início 1440 | `before/09-admin-desktop.png` | `after/09-admin-desktop.png` |
| 10–12 | Início, comparação e provedor 390 | `before/10…12-*-mobile.png` | `after/10…12-*-mobile.png` |
| 13–18 | Nova solicitação, contratos, aprovador, caixa, oportunidades, configurações | `before/13…18` | `after/13…18` |
| 19–21 | Notebook 1280 × 800 | `before/19…21` | `after/19…21` |
| 22–29 | Celular 390, 360 e 320 | `before/22…29` | `after/22…29` |

### Comprador
**Antes:** "Precisa de você" com ícones coloridos e "Tarefa/Prazo/Renovação"
como rótulo; logo abaixo quatro números grandes e o pipeline. Lista com
"Em avaliação" para o Capital de giro e "Aguardando aprovação" solto.
**Depois:** fila com trilho no tom do estado, ação em imperativo, motivo e
prazo, botão por item; "Em andamento" mostra o Capital de giro "Em aprovação
· Aguardando Ricardo Alves · Etapa 2 de 2 · 3/3 respostas"; números só no fim.
No detalhe, a fase atual (Aprovação, etapa 2 de 2) e "Continuar como Ricardo".
Comparação abre em Diferenças com síntese e estimativas separadas.

### Aprovador
**Antes:** caixa com Aprovar/Rejeitar na linha; contexto num drawer sobre a
lista. **Depois:** caixa de decisão lado a lado; a linha só diz "Revisar
decisão"; o contexto responde às oito perguntas na ordem de quem decide.

### Provedor
**Antes:** "Oportunidades/Código de convite" no desktop e "Convites/Propostas"
no celular; enviado = aviso e recarregar. **Depois:** Oportunidades / Convites
/ Aceitar por código em todo lugar; próxima ação por oportunidade; "A
solicitação mudou" com diff e "Atualizar proposta"; estado de sucesso claro.

### Administrador
**Antes:** configurações numa lista plana, aparência com todas as opções à
vista. **Depois:** Minha conta · Empresa · Governança · Demonstração, com
restaurar dentro de Demonstração; aparência com tema e densidade e o resto
recolhido.

### Mobile
**Antes:** fila e pipeline empilhados; provedor com rótulos trocados.
**Depois:** fila com trilho; "Em andamento" mantém "3/3 respostas" e prazo;
lista mostra "2/3 respostas · 3d"; filtros em linha rolável; aprovação como
folha com contexto e ações; alvos ≥ 44 px; sem rolagem horizontal em 390, 360
e 320 px.

## Gates executados

| Gate | Resultado |
| --- | --- |
| `npm run check:all` (baseline, antes de mudar) | ✅ |
| `npm run check:all` (final) | ✅ |
| `npm run build` (produção) | ✅ |
| `node scripts/test-demo-mode.mjs --dist` sobre o build de produção (agora também procura marcadores da camada 2.0) | ✅ "nenhuma página nem código da demonstração no pacote" |
| `npm run deploy:check:demo` (build demo + tamanho + referências) | ✅ |
| `check:build-size`, `check:dist-assets`, `check:financial-surface`, `check:financial-navigation`, `check:globals` | ✅ |
| `node scripts/test-demo-next-action.mjs` (novo, também em `check:finance` e `test:demo`) | ✅ |
| `npm run test:e2e` (oficial `finance-procurement.spec.js`) — Chromium desktop e mobile-chrome | ✅ 20/20 em cada |
| `npm run test:e2e:presentation` — Chromium desktop e mobile-chrome (inclui o novo `demo-workspace-v2.spec.js`) | ✅ ver "Resultados" |
| Firefox e WebKit | ⚠️ **não executados**: os navegadores dessas versões do Playwright não estão instalados no ambiente (`Executable doesn't exist at /opt/pw-browsers/firefox-1543`). O CI do repositório roda os cinco projetos. |
| `check:css`, `check:navigation`, `check:ux`, `check:seo:dist` | ⚠️ falham **igualmente no baseline `723d14d`** (verificado num worktree limpo); são checagens do site legado, fora de `check:all`, sem relação com esta rodada |

## Resultados

- Suíte de apresentação (Chromium desktop + mobile-chrome): todos os testes
  passam; os pulados são os específicos de outra plataforma (ex.: "só no
  celular") e a captura opcional `ARANDU_DEMO_SCREENSHOTS`.
- Testes novos (`tests/e2e/demo-workspace-v2.spec.js`): próxima ação
  consistente, inspector (↑↓, Esc, foco, fallback em 1280), continuidade
  Marina → Ricardo, modos e síntese da comparação, estimativas, caixa de
  decisão por teclado, provedor (sucesso + "A solicitação mudou"),
  configurações por grupo, roteiro guiado, central de comando, migração
  v2 → v3, celular (compacto, alvos ≥ 44 px, folha de aprovação), 360/320 px,
  zoom 200 % e 400 %, semântica (`aria-current`, `aria-expanded`,
  `aria-pressed`, `aria-haspopup`), movimento reduzido e ausência da camada na
  página oficial.
- Testes antigos atualizados onde o comportamento mudou de propósito
  (documentado em cada teste): aprovação passa pela revisão; ordem do painel;
  "Filtros salvos"; preferências avançadas; nomes do provedor; migração até v3.

## Isolamento

- Os módulos novos vivem em `finance/demo/workspace/` e só são importados por
  `finance/demo/workspace/index.js`, carregado por `finance/app.js` **somente**
  com `data-mode="demo"` e `__ARANDU_DEMO__ === true`. O build oficial não os
  emite.
- `scripts/test-demo-mode.mjs --dist` (build sem demo) agora falha se qualquer
  `.js/.css/.html` de `dist/` contiver: `arandu-demo-workspace`,
  `arandu-demo-route`, `arandu-demo-proposal-seen`, `decisionInbox`,
  `installInspector`, `installFilterBar`, "Calculado pelo Arandu com hipóteses",
  "Ver processo completo", "Onde as propostas mais diferem", `data-inspector`,
  `wq-row`, `dinbox`, "Marina Costa" ou "— DEMO". Passa.
- E2E: `/finance/rfqs.html` no mesmo navegador não recebe `html.dw` nem
  nenhum elemento da camada (`.ft-bar`, `#inspector`, `.wq`, `#stage-panel`,
  `.route-bar`); as 20 jornadas oficiais continuam verdes.

## Limitações

- Firefox/WebKit não validados localmente (ver acima).
- "Onde as propostas mais diferem" usa a variação relativa entre valores
  informados; critérios textuais (garantias, amortização) entram com peso fixo
  menor. É um fato calculado e rotulado como tal, mas a escolha dos quatro
  primeiros é uma heurística de apresentação.
- "Incompleta" = deixou de informar um critério comparável que outra proposta
  informou (campo que ninguém informou não conta como lacuna).
- O estado de sucesso do provedor é detectado comparando a versão vista antes
  do envio (sessão da aba) com a atual; abrir a proposta em outra aba depois de
  enviar mostra o estado normal "Proposta enviada".
- O inspector aparece a partir de 1360 px; em 1280 × 800 a lista usa a quick
  view (drawer), como antes, para não espremer a tabela.
- Leitores de tela reais (NVDA/VoiceOver) não foram usados; a semântica foi
  verificada por papéis, nomes e estados ARIA nos testes.

## Pontos que precisam de avaliação humana

1. **Identidade visual "papel e tinta" e o trilho** como marca do Arandu — é a
   direção desejada para promover ao produto?
2. **Nomes:** "Meu trabalho / Processos / Rede", "Filtros salvos",
   "Aceitar por código", "Indicadores".
3. **Densidade da fila** no início: cinco itens com botão cada — suficiente
   sem virar lista de botões?
4. **Heurística de "onde mais diferem"** — útil como está, ou preferível só a
   contagem de critérios que diferem?
5. **Roteiro guiado** — sete passos e a barra no rodapé: tom certo para demo
   comercial?
6. **Aprovação:** a ordem Pedir alterações · Rejeitar · Aprovar (aprovar à
   direita e por último) atende a quem decide?
7. **Promoção:** nada foi promovido. Se alguma peça for adotada, seguir
   `docs/FINANCIAL_DEMO_EXPERIENCE.md` → "Como promover" e o fluxo
   `feature/* → pilot`.
