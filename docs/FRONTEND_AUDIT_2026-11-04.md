# Auditoria do frontend financeiro — 04/11/2026

Base: `main` em `4ce8153` (após #316 e #319). Escopo: `finance/app.js`,
`finance/src/**`, `lib/finance/intent*.mjs`, `tests/e2e/**`. Nenhum SQL,
migration ou módulo de API alterado (responsabilidade do Codex).

## Estado encontrado (verificado no código)

| Área | Situação | Evidência |
|---|---|---|
| Transporte HTTP | Prazo (30 s leitura / 60 s escrita), 401/403/429/5xx com mensagem em português, escrita incerta avisa para conferir antes de repetir | `finance/app.js` `httpTransport` |
| Escrita offline | Recusada antes de sair (`ctx.api`) | `finance/app.js` `createContext` |
| Rascunho da RFQ | Salvo no servidor (`rfq-editor`), conflito entre abas, chave de idempotência por envio | `finance/src/views/rfqs.js` |
| Ambiente | Selo vem de `organizations.environment` (servidor); Production não mostra selo; sandbox `/demo` só no build demo | `finance/src/shell.js` `renderTopbar` |
| Carregamento | Views por `import()`; busca Ctrl/Cmd+K e Copilot sob demanda | `finance/app.js` `VIEWS`, `shell.js` |
| Duplicação | Dois tratadores de `?acao=` (um com lista fechada, outro com regex); o segundo consumia o parâmetro antes do primeiro | corrigido nesta rodada |
| Conexão | Não havia aviso antes de a pessoa preencher e enviar | corrigido nesta rodada |

## Mudanças desta rodada

1. **Aviso de conexão** (`installConnectivityNotice`, `finance/src/shell.js`):
   rede cai → aviso persistente (`role=status`); rede volta → aviso com
   "Atualizar dados". Nada é recarregado sozinho, para não descartar formulário
   em edição. Só no portal real.
2. **`?acao=` com um único tratador**: lista fechada de `lib/finance/intent-actions.mjs`,
   escopo `#main`. Ação desconhecida não aciona nada.
3. **Peso inicial**: `INTENT_ACTIONS`/`requestedAction` saíram de `intents.mjs`
   (reexportados para compatibilidade). O catálogo de intenções não entra mais
   no chunk carregado por toda tela.

## Medições (build local, `npm run build`)

| Métrica | Antes (`4ce8153`) | Depois |
|---|---:|---:|
| Chunk inicial `app-*.js` | 35.372 B | 33.419 B |
| Chunk inicial `ui-*.js` | 25.993 B | 25.993 B |
| JS total (`check-build-size`) | 768.812 B | 769.337 B (+525 B: aviso de conexão; catálogo movido para a rota que o usa) |

O JS total não caiu: o ganho é no caminho inicial de todas as telas. A meta de
720 KB não foi atingida nesta rodada; maiores candidatos medidos:
`views/policy.js` (46 KB), `views/provider.js` (45 KB), `views/crm-workspace.js` (42 KB).

## Testes

- **API simulada (A)**: 163 testes Chromium desktop (contracts, central, procurement, frontend-architecture, connectivity) passaram; `tests/e2e/finance-connectivity.spec.js` (offline/online,
  `?acao=` fechada) em Chromium desktop e mobile-chrome. Não é validação hospedada.
- **Backend local (B)** e **hospedado (C)**: não executados nesta rodada.

## Handoff ao Codex

Nenhum contrato novo exigido por estas mudanças. Pendências conhecidas que
dependem de backend continuam as registradas em `docs/IMPLEMENTATION_MATRIX.md`;
nada foi declarado hospedado.
