# Arandu 11.3 — Product Excellence (incremento)

Relatório de implementação e evidência. Não é guideline.

- **SHA base:** `main` `1c9c0918c0bad4177f49cea6fb5da83f7a1fd275` (PR #362 integrada).
- **Ambiente:** container Linux, Chromium 1243 headless, API simulada (`page.route`
  nos E2E; servidor de fixtures em `scripts/perf/measure-journeys.mjs`). Sem Demo
  local com Supabase: nenhuma prova de integração real, nenhuma captura de tela.
- **Maturidade:** M1. M2 depende dos quatro gates no HEAD exato da PR.

## Escopo entregue × não entregue

| Onda | Entregue | Não entregue |
|---|---|---|
| A — renovação | `renewalStage` canônico + todos os consumidores | — |
| B — Relationship 360 | rota mais leve (ver F); link de origem filtrado | reorganização visual do 360 |
| C — negociação / portal | convites sem "respondeu" falso; prazo vencido no portal | comparação, Decision Studio, propostas externas |
| D — visual | — | capturas antes/depois, revisão de hierarquia |
| E/F — performance e bundle | −11,2% JS inicial em Relationship 360 | outras rotas |
| G — segurança frontend | limpeza da aba no logout; link interno | auditoria completa de sessões/troca de organização |

## A. Aviso prévio desconhecido (P0 — prazo inventado)

`renewalStage` (`finance/src/core.js`) usava `Number(renewal_notice_days || 0)`:
aviso nulo virava 0 dias e o produto afirmava data-limite igual ao término (e
"aviso prévio vencido" no último dia). Agora:

- nulo, ausente ou não inteiro ⇒ `noticeKnown: false`, `deadline: null`,
  `daysToDeadline: null`; janela abre 90 dias antes do fim; nunca `past_notice`;
- `0` explícito ⇒ válido, data-limite = término (antes o plano de renovações o
  marcava como "não cadastrado" por usar `!renewal_notice_days`).

Mesma regra de `lib/finance/contract-portfolio.mjs` (`unknown_notice`).
Consumidores revisados: carteira (`company/contracts.js`: próxima ação e barra
de vigência sem marco inventado), plano de renovações (grupo pelo término, sem
"decidir em 30 dias"), radar de prazos (0 explícito conhecido), sinais de contexto
("Confirmar aviso prévio"), Painel, Central de Relacionamentos, contexto do
relacionamento. `provider-relationship.js` e `summary.js` já eram coerentes.

## C. Jornadas

- **RFQ → convites:** proposta retirada (ou rascunho) aparecia como "Respondeu" e
  contava em "N responderam". Só `submitted`/`revised` contam; retirada aparece
  como "Proposta retirada".
- **Portal da instituição:** oportunidade cujo prazo informado já passou era a
  "próxima ação" e aparecia como urgente, à frente de uma ainda no prazo. Agora
  vai depois, diz "Prazo informado passou" e o destaque explica que o envio só
  vale se o servidor aceitar.

## F. Performance (mesma máquina, mesmas fixtures, `measure-journeys.mjs`, 1 amostra fria + 1 quente por jornada)

| Jornada | JS inicial antes | depois | Transferência antes | depois | Requisições antes → depois |
|---|---:|---:|---:|---:|---:|
| relationship360 | 243.081 B | 216.180 B (−11,1%) | 98.138 B | 87.696 B (−10,6%) | 27 → 25 |
| portfolio | 138.373 | 138.761 (+0,3%) | 55.077 | 56.358 | 14 → 16 |
| contract360 | 196.816 | 197.204 (+0,2%) | 82.999 | 84.279 | 25 → 27 |
| renewal (acumulado) | 255.299 | 255.687 (+0,2%) | 104.547 | 105.827 | 36 → 38 |
| buyer / institution / obligations | ±0,3% | | | | iguais |

Causa: `company/providers.js` exigia `contract-center` inteiro só para o botão
"Registrar contrato existente". O botão foi para
`contract-center/import-button.js` (490 B); `contract-center.js` o reexporta.
Custo: duas requisições pequenas (o chunk e o `preload-helper`) nas rotas de
contratos, dentro da tolerância de 10%. Tempo de script variou entre 4 e 25 ms
entre execuções (ruído; não alegamos ganho de tempo). Baseline de jornadas
atualizada com motivo; registro de crescimento do agregado +2.190 B
(`docs/perf/bundle-growth-log.json`). Nenhum hard limit alterado.

## G. Segurança de frontend

| Item | Estado |
|---|---|
| "Sair" deixava o token de convite pendente e a organização lembrada no `sessionStorage` da aba | corrigido (`shell.js`), com teste para saída confirmada e não confirmada |
| `context.source_href` da API renderizado como `href` sem filtro (`javascript:` ou outro domínio viraria link) | corrigido: só caminho interno `/finance/` ou `/provider/` |
| `innerHTML` | único uso: dossiê exportado a partir de DOM próprio com `escapeHtml` no título; sem mudança |
| Troca de organização, respostas atrasadas de sessão anterior, 429 em todas as escritas | **não auditado** neste lote |

Backend (Codex), sem mudança: idempotência de convites, `coverage.complete`,
prévia de convite — inalterados desde o 11.1.

## Testes

| Comando | Resultado |
|---|---|
| `npm run check:all` | ok (corrigido `test-finance-command-center.mjs`, que listava as fontes do botão) |
| `npm run build`, `check:build-size`, `check:perf-journeys` | ok |
| E2E `chromium-desktop` + `mobile-chrome` | 1043 passed, 11 skipped |
| `test:e2e:presentation --project=chromium-desktop` | 73 passed, 6 skipped |
| WebKit, Firefox, mobile-safari | não executados (ausentes no container); CI |

Testes novos (API simulada): aviso 0 × nulo no plano e no Painel; aviso ausente
da resposta; convite com proposta retirada; prazo vencido no portal; limpeza no
logout; origem de sinal maliciosa.
