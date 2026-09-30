# Camada de experiência da demonstração (laboratório de UX)

A demonstração (`/demo/*`, projeto `arandu-demo`) carrega uma camada de
interface que **não existe na aplicação oficial**. Ela serve para provar a
próxima geração da experiência do Arandu antes de decidir o que promover.

## Modelo: NAVEGAÇÃO → WORKSPACE → CONTEXTO

```
┌ barra lateral ┐┌ topbar: trilha · Buscar ou executar… ⌘K · ● DEMO · 🔔 · Marina ▾ ┐
│ Início        ││                                                                  │
│ TRABALHO      ││  workspace: a tarefa em foco (painel, lista, solicitação,         │
│  Solicitações ││  comparação)                          ┌ contexto ───────────────┐ │
│  Aprovações   ││                                       │ quick view / aprovação  │ │
│  Propostas    ││                                       │ (drawer; bottom sheet   │ │
│ GESTÃO        ││                                       │  no celular)            │ │
│  Contratos    ││                                       └─────────────────────────┘ │
│  Provedores   ││                                                                  │
│  Tarefas      ││  bandeja de comparação (quando há propostas selecionadas)        │
│ ─ Favoritos   │└──────────────────────────────────────────────────────────────────┘
│ ─ Minhas visões
│ Configurações │
```

## Onde fica

```
finance/demo/experience.css        tokens, temas, shell, painel, tabelas, timeline,
                                   comparação, bandeja, quick view, responsivo
finance/demo/workspace/
  boot.js              1º script das páginas /demo: aplica aparência antes de pintar
  preferences.js       registro local versionado (v2) + migração v1 + aplicação no <html>
  index.js             orquestra a camada (afterRender, paleta, configurações)
  shell.js             barra lateral agrupada, topbar, ● DEMO, conta/persona, foco,
                       estados da barra (inclusive sobreposição no tablet)
  presets.js           Equilibrado, Compacto, Executivo, Operacional (+ Personalizado)
  dashboard.js         painel editorial: Precisa de você, Em andamento, pipeline
  rfq-page.js          solicitação: voltar, título ☆ •••, valor, status, abas
  timeline.js          Arandu Timeline (processo da solicitação e ciclo do contrato)
  compare.js           comparação como workspace de foco
  comparison-tray.js   bandeja de comparação (sessão)
  approval.js          leitura de aprovação para quem decide
  quick-view.js        quick view universal: solicitação, proposta, aprovação,
                       contrato, provedor, tarefa
  contracts.js         contratos como ciclo de vida (timeline, visões, •••)
  saved-views.js       Minhas visões (sugeridas + criadas), filtros, colunas, fixar
  table-preferences.js tabela de solicitações: ordenação, colunas, ações no hover
  responsive.js        barra inferior por persona e folha “Mais”
  command.js           Central de comando 2.0 (Ctrl/⌘+K)
  assist.js            assistência contextual determinística (arquitetura para IA)
  personas.js, popover.js, icons.js
```

Carregamento: `finance/app.js` importa `demo/workspace/index.js` **somente**
quando a página tem `data-mode="demo"` e o build habilita a demonstração
(`__ARANDU_DEMO__`), a mesma trava do motor fictício. O build de produção não
emite nenhum desses arquivos (verificado: nenhum `dist/**` contém
`arandu-demo-workspace`; `node scripts/test-demo-mode.mjs --dist` passa).
`experience.css` e `boot.js` só são referenciados pelas cascas `/demo` geradas
por `scripts/generate-finance-pages.mjs` e por `demo/index.html`.

## Código compartilhado tocado (inerte em produção)

| Arquivo | Mudança |
| --- | --- |
| `finance/app.js` | carrega a camada sob a trava acima; `ctx.rerender`; troca de persona sem recarregar quando a camada existe; nesta rodada, `workspace?.decorateSidebar(ctx, navCounts)` (o `?.` é nulo fora da demo) |
| `finance/src/core.js` | `registerIcons()` para ícones extras |
| `finance/src/ui.js` | `drawer({ className })` opcional |
| `finance/src/views/rfqs.js`, `company.js` | atributos `data-entity`/`data-id` nas linhas; gancho `ctx.demoSettings?.(add)` dentro do bloco já exclusivo da demo |

Nenhuma regra financeira, cálculo, scoring, peso, regra de aprovação, RLS,
RBAC, API, contrato de domínio, estado financeiro ou banco mudou. Nenhuma
migration. Nenhuma dependência nova.

## Preferências e armazenamento

Uma chave no `localStorage`: **`arandu-demo-workspace`** (versão 2).

```json
{
  "version": 2,
  "appearance": { "theme": "light|dark|system", "density": "auto|compact|comfortable|spacious",
                  "sidebar": "auto|expanded|compact|hidden", "motion": "normal|reduced",
                  "accent": "indigo|blue|emerald|graphite|violet",
                  "preset": "balanced|compact|executive|operational|custom", "detail": "full|essential" },
  "behavior": { "rfqClick": "quick|page", "home": "overview|rfqs|approvals", "afterCreate": "stay|list" },
  "shell": { "focus": false },
  "dashboard": { "buyer": { "order": [], "hidden": [], "sizes": { "pipeline": "full" } } },
  "favorites": [{ "type": "rfq|contract|provider", "id": "uuid", "title": "…" }],
  "savedViews": [{ "id": "v-…", "name": "…", "page": "rfqs|contracts", "query": "status=comparing",
                   "extra": "|urgent|waiting|renewal|active|ended", "hiddenColumns": [], "pinned": false }],
  "tables": { "rfqs": { "hiddenColumns": [] } },
  "recents": [{ "type": "rfq", "id": "uuid", "title": "…" }]
}
```

**Migração v1 → v2** (`migrate()` em `preferences.js`, coberta por teste): tema,
cor, densidade, barra lateral, painéis, favoritos e visões são preservados;
`behavior` recebe os padrões; visões ganham `extra: ""` e `hiddenColumns: []`;
se a pessoa já tinha densidade ou barra fora do padrão, o preset vira
`custom`. O registro migrado é regravado como v2 na primeira leitura.

`sanitize()` valida tudo por lista branca (valores, UUID, filtros permitidos
`q,status,product,owner,sort`); registro adulterado volta ao padrão.
`sessionStorage`: `arandu-demo-context` (rolagem e última URL filtrada das
listas), `arandu-demo-view:<página>` (visão ativa), `arandu-demo-tray` (bandeja),
`arandu-demo-flash` (aviso após criar). Estado fictício: `arandu_demo_state_v1`.

## Presets e comportamento

| Preset | Densidade | Barra | Detalhe | Painel |
| --- | --- | --- | --- | --- |
| Equilibrado (padrão) | automática | automática | completo | padrão da persona |
| Compacto | compacta | compacta | completo | padrão da persona |
| Executivo | confortável | compacta | essencial | Precisa de você, Em andamento, Renovações |
| Operacional | compacta | expandida | completo | fila, pipeline, tarefas, solicitações, renovações, atividade |

Mexer em densidade, barra, detalhe ou módulos do painel marca **Personalizado**.
Comportamento (em “Aparência e preferências…”): clique na solicitação abre
quick view ou página; página inicial (Visão geral, Solicitações, Aprovações —
vale para o logo/Início); depois de criar, permanecer na solicitação ou voltar
para a lista.

## Minhas visões

Sugeridas: Todas, Minhas, Urgentes (prazo em até 7 dias), Aguardando resposta,
Renovações (contratos). “+ Nova visão” guarda filtros, busca, ordenação e
colunas; o menu da visão renomeia, atualiza, fixa na barra lateral e exclui
(com desfazer). Visão ativa aparece com `aria-current` na barra lateral.

## Solicitação, comparação e aprovação

- **Solicitação**: `‹ Solicitações` (volta à lista como estava), título ☆ •••,
  valor em destaque com números tabulares, produto/revisão, linha de status,
  Arandu Timeline e abas Visão geral · Propostas · Comparação · Aprovação ·
  Decisão · Histórico. Deep links preservados (`#propostas`, `#comparacao`,
  `#aprovacao`, `#decisao`, `#atividade`).
- **Comparação**: ao abrir a aba, `html[data-compare=on]` recolhe barra lateral
  e cabeçalho; cabeçalhos e critérios fixos; mostrar/ocultar propostas e grupos
  de critérios; “Destacar não informados”; Voltar. No celular, duas propostas
  lado a lado com seletores. **Nunca** há vencedor, “melhor” ou “recomendado” —
  só os destaques factuais do produto (“maior/menor valor informado”).
- **Bandeja de comparação**: selecionar propostas em listas, quick view ou
  cartões; persiste na aba (sessão); uma solicitação por vez; some quando vazia
  e dentro do workspace de comparação.
- **Aprovação**: valor, proposta escolhida por quem pediu, condições,
  justificativa, solicitante, etapa e prazo; Aprovar (primária) à direita,
  Pedir alterações neutra, Rejeitar separada e em estilo de perigo discreto.
  As ações são as do produto (mesma regra de aprovação).
- **Contratos**: timeline de marcos (início, D-90/60/30, aviso prévio,
  vencimento) calculada por `renewalStage`, visões e menu •••.

## Assistência contextual e política de IA

Não há IA nesta rodada nem texto gerado. `assist.js` define ações
**determinísticas** (resumir campos, localizar ausências, comparar fatos),
rotuladas “Calculado a partir dos dados”, que a central de comando e a
comparação consomem — a mesma interface que uma IA futura teria de respeitar.

Política para qualquer assistência futura:

- **Pode**: resumir, explicar, localizar, organizar, preencher rascunhos,
  identificar dados ausentes, comparar fatos informados.
- **Não pode**: escolher banco, recomendar instituição, escolher proposta,
  tomar decisão financeira, aprovar automaticamente.
- **Sempre**: citar a origem de cada afirmação e deixar a decisão com a pessoa.

## Responsividade

- **Desktop (≥ 1280 px)**: barra lateral + workspace + contexto (drawer).
- **Tablet (960–1279 px)**: barra compacta automática; expandir **sobrepõe** o
  conteúdo sem mudar a preferência (Esc ou clique fora fecha).
- **Celular (< 960 px)**: sem barra lateral; barra inferior por persona
  (Comprador: Início/Solicitações/Propostas/Mais; Aprovador:
  Início/Aprovações/Solicitações/Mais; Provedor: Início/Convites/Propostas/Mais;
  Admin: Início/Equipe/Configuração/Mais). Tabelas viram linhas empilhadas;
  quick view vira bottom sheet; a timeline rola até a etapa atual.

## Restaurar

`● DEMO` → “Restaurar demonstração…” (ou menu de preferências / Ctrl+K):

- **Dados demonstrativos** — `engine.reset()`; aparência, painel e favoritos ficam.
- **Aparência e layout** — tema, densidade, cor, barra lateral, modo foco e painéis.
- **Tudo** — dados e todas as preferências.

Decisão: restaurar dados **não** apaga preferências visuais (são do visitante,
não do cenário fictício). A página de entrada oferece os dois botões.

## Tokens de aparência

Tudo em `experience.css`, sob `html.dw`, dirigido por atributos que
`applyAppearance()` escreve no `<html>`:

| Atributo | Efeito |
| --- | --- |
| `data-theme=light|dark` | superfícies, bordas, texto, estados, overlay, tooltip (escuro projetado, não invertido) |
| `data-accent` | `--accent`, `--accent-hover`, `--accent-weak`, `--accent-text`, `--focus-ring`, `--on-accent` |
| `data-density` | `--row-py`, `--cell-px`, `--control-h`, `--gap-module`, `--page-px`, escala `--s*`/`--fs-*` |
| `data-motion=reduced` | durações ~0; `prefers-reduced-motion` é sempre respeitado |
| `data-sidebar-state=expanded|compact|hidden` | `--sidebar-current` (`--sidebar-width` / `--sidebar-compact-width` / 0) |
| `data-sidebar-overlay=on` | tablet: barra expandida sobre o conteúdo |
| `data-preset`, `data-detail=essential` | preset ativo; menos detalhe secundário |
| `data-compare=on` | workspace de comparação |
| `data-focus=on` | barra lateral oculta, rodapé oculto, largura útil maior |

Tokens normalizados (rodada 2): `--background`, `--surface`, `--surface-raised`,
`--surface-hover`, `--surface-subtle`, `--text-primary|secondary|muted`,
`--border-subtle|strong`, `--accent|accent-hover|accent-soft`,
`--success|warning|danger|info`, `--radius-xs..lg`, `--shadow-popover|drawer`,
`--duration-fast|normal`, `--sidebar-width`, `--sidebar-compact-width`,
`--context-panel-width`. Os tokens antigos continuam como apelidos.

Tokens da rodada 1: movimento (`--dur-1..3` 120–200 ms, `--ease-*`), elevação
(`--elev-0..3`), `--overlay`, `--drawer-w`, `--row-hover`, `--tooltip-*`,
`--signal*` (indicador DEMO), `--track*`, `--glass*`, `--danger-solid`.

## Estados da barra lateral

- **Expandida** — ícone + nome, favoritos e visualizações fixadas.
- **Compacta** — só ícones; o nome continua no link (acessível) e aparece como tooltip ao passar o mouse ou focar.
- **Automática** — expandida a partir de 1280 px, compacta entre 960 e 1279 px (expandir ali sobrepõe o conteúdo).
- **Oculta (modo foco)** — pelo menu, Ctrl+K ou botão “Modo foco” em solicitação/nova solicitação; sai por “Sair do modo foco”. Escape nunca desfaz o modo foco nem descarta edição.
- Alternar: botão da barra, botão da topbar ou **Ctrl/⌘+B**. Abaixo de 960 px a navegação é a barra inferior.

## Recursos exclusivos da demonstração

Indicador `● DEMO` com popover, seletor de persona na topbar com troca
instantânea, landing product-first, painel modular/personalizável por persona,
preferências de aparência, modo foco, quick views, central de comando
expandida, favoritos, visualizações salvas, contexto de listas preservado,
menus `•••` em contratos e ações de interface no “Mais” da solicitação.
Rodada 2: presets de workspace, preferências de comportamento, Minhas visões,
tabela configurável, nova tela de solicitação, Arandu Timeline, workspace de
comparação, bandeja de comparação, quick view universal, leitura de aprovação,
contratos como ciclo de vida, Central de comando 2.0, assistência determinística
e navegação móvel por persona. **Nada disso foi promovido para produção.**

## Como promover uma peça para produção

1. Mover os tokens da peça de `experience.css` para `finance/style.css`
   (`:root`), sem o prefixo `.dw`.
2. Mover o módulo de `finance/demo/workspace/` para `finance/src/` e
   importá-lo em `app.js` fora da trava da demo.
3. Preferências reais que precisem seguir o usuário entre dispositivos exigem
   endpoint próprio — não reutilizar a chave local da demo.
4. Levar os testes de `tests/e2e/demo-workspace.spec.js` e `demo-workspace-next.spec.js` para
   `finance-procurement.spec.js` e passar pelo fluxo `feature/* → pilot`.

## Testes e evidências

- `npm run test:e2e:presentation` inclui `tests/e2e/demo-workspace.spec.js` e
  `tests/e2e/demo-workspace-next.spec.js` (presets, comportamento, migração v1→v2,
  bandeja, comparação, abas, aprovação, quick view universal, navegação móvel por
  persona, tablet, zoom 125%, texto grande, movimento reduzido, tema escuro).
- Capturas: `ARANDU_DEMO_SCREENSHOTS=1 ARANDU_DEMO_SCREENSHOTS_DIR=docs/evidence/demo-ux-AAAA-MM-DD npm run test:e2e:presentation -- -g capturas`.
  Rodadas: `docs/evidence/demo-ux-2026-09-30/` (PR #86) e
  `docs/evidence/demo-workspace-2026-09-30/` (desktop 1440×900, tablet 1024×768,
  celular 390×844).
