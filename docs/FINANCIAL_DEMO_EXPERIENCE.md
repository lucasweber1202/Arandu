# Camada de experiência da demonstração (laboratório de UX)

A demonstração (`/demo/*`, projeto `arandu-demo`) carrega uma camada de
interface que **não existe na aplicação oficial**. Ela serve para provar a
próxima geração da experiência do Arandu antes de decidir o que promover.

## Onde fica

```
finance/demo/experience.css        tokens, temas, shell, painel, quick view, landing
finance/demo/workspace/
  boot.js          1º script das páginas /demo: aplica aparência antes de pintar
  preferences.js   registro local versionado + aplicação no <html>
  index.js         shell: barra lateral, topbar, ● DEMO, persona, preferências,
                   modo foco, favoritos, contexto de listas, restaurar
  dashboard.js     painel modular e personalizável por persona
  quick-view.js    resumo lateral de solicitação, proposta, provedor e contrato
  command.js       central de comando (Ctrl/⌘+K)
  saved-views.js   visualizações de Solicitações
  personas.js      prioridades, sugestões e painel padrão de cada persona
  popover.js, icons.js
```

Carregamento: `finance/app.js` importa `demo/workspace/index.js` **somente**
quando a página tem `data-mode="demo"` e o build habilita a demonstração
(`__ARANDU_DEMO__`), a mesma trava do motor fictício. O build de produção não
emite nenhum desses arquivos (verificado: nenhum `dist/**` contém
`arandu-demo-workspace`). `experience.css` e `boot.js` só são referenciados pelas
cascas `/demo` geradas por `scripts/generate-finance-pages.mjs` e por
`demo/index.html`.

## Código compartilhado tocado (inerte em produção)

| Arquivo | Mudança |
| --- | --- |
| `finance/app.js` | carrega a camada sob a trava acima; `ctx.rerender`; troca de persona sem recarregar quando a camada existe |
| `finance/src/core.js` | `registerIcons()` para ícones extras |
| `finance/src/ui.js` | `drawer({ className })` opcional |
| `finance/src/views/rfqs.js`, `company.js` | atributos `data-entity`/`data-id` nas linhas; gancho `ctx.demoSettings?.(add)` dentro do bloco já exclusivo da demo |

Nenhuma regra financeira, RLS, RBAC, API ou contrato de domínio mudou.

## Preferências e armazenamento

Uma chave no `localStorage`: **`arandu-demo-workspace`**.

```json
{
  "version": 1,
  "appearance": { "theme": "light|dark|system", "density": "compact|comfortable|spacious",
                  "sidebar": "expanded|compact|auto", "motion": "normal|reduced",
                  "accent": "indigo|blue|emerald|graphite|violet" },
  "shell": { "focus": false },
  "dashboard": { "buyer": { "order": [], "hidden": [], "sizes": { "pipeline": "full" } } },
  "favorites": [{ "type": "rfq|contract|provider", "id": "uuid", "title": "…" }],
  "savedViews": [{ "id": "v-…", "name": "…", "page": "rfqs", "query": "status=comparing", "pinned": false }],
  "recents": [{ "type": "rfq", "id": "uuid", "title": "…" }]
}
```

`sanitize()` valida tudo por lista branca (valores, UUID, filtros permitidos
`q,status,product,owner,sort`); registro adulterado volta ao padrão. Contexto de
listas (rolagem e última URL filtrada) fica em `sessionStorage`
(`arandu-demo-context`). O estado fictício continua em `arandu_demo_state_v1`.

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
| `data-sidebar-state=expanded|compact` | `--sidebar-current` (248 px / 64 px) |
| `data-focus=on` | barra lateral oculta, rodapé oculto, largura útil maior |

Tokens novos: movimento (`--dur-1..3` 120–200 ms, `--ease-*`), elevação
(`--elev-0..3`), `--overlay`, `--drawer-w`, `--row-hover`, `--tooltip-*`,
`--signal*` (indicador DEMO), `--track*`, `--glass*`, `--danger-solid`.

## Estados da barra lateral

- **Expandida** — ícone + nome, favoritos e visualizações fixadas.
- **Compacta** — só ícones; o nome continua no link (acessível) e aparece como tooltip ao passar o mouse ou focar.
- **Automática** — expandida a partir de 1280 px, compacta entre 960 e 1279 px.
- **Oculta (modo foco)** — pelo menu, Ctrl+K ou botão “Modo foco” em solicitação/nova solicitação; sai por “Sair do modo foco”. Escape nunca desfaz o modo foco nem descarta edição.
- Alternar: botão da barra, botão da topbar ou **Ctrl/⌘+B**. Abaixo de 960 px a navegação é a barra inferior.

## Recursos exclusivos da demonstração

Indicador `● DEMO` com popover, seletor de persona na topbar com troca
instantânea, landing product-first, painel modular/personalizável por persona,
preferências de aparência, modo foco, quick views, central de comando
expandida, favoritos, visualizações salvas, contexto de listas preservado,
menus `•••` em contratos e ações de interface no “Mais” da solicitação.

## Como promover uma peça para produção

1. Mover os tokens da peça de `experience.css` para `finance/style.css`
   (`:root`), sem o prefixo `.dw`.
2. Mover o módulo de `finance/demo/workspace/` para `finance/src/` e
   importá-lo em `app.js` fora da trava da demo.
3. Preferências reais que precisem seguir o usuário entre dispositivos exigem
   endpoint próprio — não reutilizar a chave local da demo.
4. Levar os testes de `tests/e2e/demo-workspace.spec.js` para
   `finance-procurement.spec.js` e passar pelo fluxo `feature/* → pilot`.

## Testes e evidências

- `npm run test:e2e:presentation` inclui `tests/e2e/demo-workspace.spec.js`.
- Capturas: `ARANDU_DEMO_SCREENSHOTS=1 ARANDU_DEMO_SCREENSHOTS_DIR=docs/evidence/demo-ux-AAAA-MM-DD npm run test:e2e:presentation -- -g capturas`.
  Última rodada: `docs/evidence/demo-ux-2026-09-30/`.
