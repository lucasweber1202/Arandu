# Experiência de produto para 29/10 — evidência de 22/10/2026

Executor efêmero (Linux x64, sessão remota do Claude Code). **Não é a estação de
apresentação: STATION_NOT_VERIFIED.** Dados 100% sintéticos (seed Vitta Foods).

## Ambiente

- Base: `main` em `42dd92b`. Demo canônica local real: `npm run demo:setup` com Auth,
  PostgREST, Storage e app em `ARANDU_ENV=demo`; seed **39/39 checagens OK**.
- Docker Hub respondeu 429 e o ECR público "Data limit exceeded"; as mesmas imagens
  oficiais vieram de `mirror.gcr.io` via `PILOT_LOCAL_*_IMAGE` (procedimento no
  cartão do operador, caso C2).
- Capturas renderizadas no navegador contra `https://localhost:4443`, logadas como
  Juliana, Helena e Eduardo: "antes" no build de `42dd92b` (46 telas) e "depois" no
  build de `b7709e7` (46 telas). Overflow horizontal medido: 0 em todas.
  Quatro telas móveis do "depois" (solicitações, aprovações, propostas, contratos)
  pegaram o limite legítimo de 240 chamadas/10 min da Juliana, por duas rodadas de
  captura seguidas; mostram a tela de 429 do produto, não regressão.
- Visita pública: 13 etapas com capturas reais (`demo/visita/captures.json`: SHA,
  data, base, rota, persona, dimensões), via `scripts/design/capture-tour.mjs`.

## Antes / depois (esta pasta)

| Tela | Antes | Depois | Mudança |
| --- | --- | --- | --- |
| Painel (desktop) | `before-desktop-dashboard.png` | `after-desktop-dashboard.png` | "coleta encerrada" não encosta mais na borda (coluna de prazo flexível) |
| Instituições / Central | `before-desktop-providers.png` | `after-desktop-providers.png` | "Abrir tarefa" leva à tarefa exata |
| Propostas recebidas | `before-desktop-proposals.png` | `after-desktop-proposals.png` | "Instituição" no lugar de "Provedor" |
| Portal da instituição | `before-desktop-provider-home.png` | `after-desktop-provider-home.png` | título alinhado ao menu canônico |
| Painel (celular) | `before-mobile-dashboard.png` | `after-mobile-dashboard.png` | sem mudança visual relevante (controle) |

## Testes (este executor, só Chromium)

| Suíte | Projetos | Aprovados | Ignorados | Falhos |
| --- | --- | --- | --- | --- |
| `test:e2e:finance` (lista do package.json) | chromium-desktop, mobile-chrome | 536 | 10 | 0 |
| `test:e2e:presentation` | chromium-desktop, mobile-chrome | 136 | 20 | 0 |
| `npm run check:all` | — | PASS | — | — |

Firefox, WebKit e mobile-safari **não instalados** aqui: não executados (ficam para o CI).
E2E da Demo real (`playwright.demo.config.js`) não executado para não consumir o
orçamento de workspaces/entradas desta stack; a jornada foi exercida por leitura nas capturas.

## Registrado para a frente técnica (não alterado aqui)

- Tarefa gerada para o período vencido do covenant Dívida líquida/EBITDA nasce sem
  responsável, enquanto a obrigação tem Juliana como responsável: Painel e Central
  mostram "Sem responsável"; Covenants mostra Juliana. Contrato sugerido: a tarefa
  criada pela rotina herda o responsável da obrigação (ou a tela de tarefa cita o
  responsável da obrigação de origem).
- `check:build-size`: maior rota JS 245.860 → 245.884 bytes (+24) de 250.000; CSS
  103.303 → 103.329 (+26). O aviso de 98% já existia na base `42dd92b`; nenhuma dependência nova.
