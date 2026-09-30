# Demo — Ultimate Financial Work OS (v3)

Arquitetura da terceira rodada da demonstração (`/demo/*`). Tudo aqui é
**exclusivo da demonstração**: roda no navegador, sobre o motor fictício
(`finance/demo/engine.js`), sem servidor, sem credencial, sem serviço externo.
Piloto e produção não carregam nenhuma destas peças (gate:
`node scripts/test-demo-mode.mjs --dist` num build sem demo).

## Princípio

O motor fictício continua sendo a **fonte de verdade financeira**
(solicitações, propostas, aprovações, decisões, contratos, perfil). A camada
Work OS guarda só o que **não é dado financeiro**: integrações simuladas,
políticas versionadas, comentários de proposta/aprovação/contrato,
notificações locais, diretório, procedência, flags, analytics, auditoria,
fila offline. Nada é duplicado; nenhuma regra financeira muda.

## Organização por domínio

```
finance/demo/workspace/
  platform/        os-store.js     registro local único (arandu-demo-os), versionado e validado
                   bus.js          eventos (delta model) + auditoria + BroadcastChannel entre abas
                   local-first.js  cache stale-while-revalidate sobre o motor (arandu-demo-swr)
                   sync.js         ações otimistas, executores, fila offline, indicador
                   telemetry.js    medições/orçamento, feature flags, analytics local, funil
                   conflict.js     o exemplo de conflito de edição (36 × 48 meses)
  collaboration/   presence.js     presença discreta (outras abas + pessoas do processo)
                   activity.js     linha do tempo universal com filtros
                   comments.js     comentários com escopo Interno / Visível ao provedor, @menções
                   notify.js       regras evento → notificação
                   center.js       central de notificações por categoria
  workflows/       policy.js       regras puras: avaliação, validação, diferença entre versões
                   builder.js      construtor de políticas (/finance/policies.html)
                   policy-line.js  "Política v2 · regra · etapas" no contexto
                   intake.js       "O que você precisa fazer?" (/finance/intake.html)
  integrations/    registry.js     13 conectores simulados com a mesma interface de adaptador
                   fixtures.js     dados fictícios (diretório, ERP, Open Finance)
                   center.js       central (/finance/integrations.html), ERP, Open Finance, procedência
                   chips.js        estado das integrações no contexto
  analytics/       usage.js        Uso da demonstração (/finance/usage.html)
  help/            keyboard.js     atalhos, ajuda "?", glossário, limites
```

"events/" e "performance/" do pedido estão em `platform/` (bus e telemetry),
porque dividem o mesmo registro local; a separação é por arquivo.

## Fluxo de dados

```
tela ──ação──▶ optimistic({ apply, kind, payload })
                 │ apply(): muda a tela já (mede "optimistic")
                 ├─ offline? → outbox (arandu-demo-os) → "Offline · N" → reconectar → flush em ordem
                 └─ executor(kind) → ctx.api (motor fictício) → emit('approval.approved', …)
                                                              │
emit ──▶ auditoria (quem · o quê · quando · objeto · origem) ─┤
     ──▶ ouvintes: notificações, analytics, atividade ─────────┤
     ──▶ outras abas (BroadcastChannel 'arandu-demo-bus') ─────┘

GET  ──▶ local-first: cache (memória + sessionStorage) devolve já; revalida em
         segundo plano; se mudou → 'sync.revalidated' → ctx.reload() sem piscar
```

- **Eventos**: `rfq.updated`, `proposal.submitted`, `approval.requested/approved/
  rejected/changes_requested/opened`, `contract.created`, `comment.created`,
  `mention.created`, `integration.connected/disconnected/synced`,
  `directory.imported`, `erp.imported`, `financial_profile.updated`,
  `policy.published`, `sync.*`. Origens: Web, Slack, Teams, ERP, Open Finance,
  Automação, Diretório.
- **Ouvintes com dono**: `on(type, fn, { owner: node })` sai sozinho quando o
  nó deixa o documento — re-render não acumula ouvintes (teste E2E de
  desempenho).

## Telas novas (só no build de demonstração)

Geradas por `DEMO_ONLY_PAGES` em `scripts/generate-finance-pages.mjs`; o Vite só
as inclui com a demo ligada; `finance/app.js` só as resolve depois de carregar
a camada (`DEMO_BUILD`).

| Página | View | Conteúdo |
| --- | --- | --- |
| `/demo/finance/intake.html` | `workIntake` | necessidade → formulário determinístico → política → editor do produto |
| `/demo/finance/policies.html` | `workPolicies` | versões, rascunho, regras, ordem, prévia, publicar |
| `/demo/finance/integrations.html` | `workIntegrations` | 6 categorias, 13 conectores, SSO/SCIM/RBAC, ERP, Open Finance |
| `/demo/finance/usage.html` | `workUsage` | funil, sessão, auditoria por origem, flags, desempenho |

Telas existentes substituídas na demo: `notifications` (central por
categoria) e `approvals` (caixa de decisão, atrás da flag `decisionInbox`).

## Desempenho

- Cache local-first: troca de tela volta com dado em cache e revalida.
- Pré-carregamento ao passar o mouse (`<link rel=prefetch>`), View Transitions
  (`@view-transition { navigation: auto }`, desligado com movimento reduzido).
- Carregamento sob demanda: central de comando, tela de solicitação,
  contratos, portal do provedor, configurações, comentários do resumo.
  Chunk `workspace` 90,6 kB (orçamento 100 kB de `check:build-size`).
- Orçamentos (`PERF_BUDGETS`, ms): route 1500 · render 800 · inspector 120 ·
  search 50 · filter 80 · comparison 400 · optimistic 50. Medidos localmente,
  vistos em Uso da demonstração e no painel escondido (`?debug=1` ou
  Alt+Shift+D).

## Privacidade

- Comentário `internal`: só a empresa. `provider`: a empresa e **aquele**
  provedor (`provider_org` = organização dona da proposta). A leitura filtra
  antes de desenhar (`visibleComments`), nunca por CSS.
- Aprovação e contrato só aceitam comentário interno; @menção só em interno.
- O provedor nunca vê comparação, justificativa, conversa interna nem outros
  provedores (E2E `comentários com escopo`).
- Presença não aparece para o provedor.

## Limites (deliberados)

Conectores, SSO/SCIM, ERP, Open Finance, PostHog, Drive/OneDrive são
simulados; presença é derivada dos dados (ou real entre abas do mesmo
navegador); a política desenha e explica etapas, mas as aprovações registradas
continuam sendo as do motor; o conflito é um exemplo fixo; não há
recomendação de instituição nem IA.
