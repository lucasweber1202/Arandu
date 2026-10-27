# Prontidão unificada para 29/10 — evidência de 27/10/2026

Executor: Claude Code em container efêmero de nuvem (Linux, Docker 29.9.2).
Branch `claude/wizardly-cori-2xq6ii`. Nada hospedado foi alterado.

## 1. Resumo executivo

- **Main reconciliada:** `origin/main = 0a260b6c1f6a1a8b6975b82fec949cf085831429`
  (merge da #280), Arandu CI e Merge audit SUCCESS nesse SHA; nenhuma PR aberta,
  nenhuma worktree/branch concorrente além desta.
- **Demo pública (P0-A):** o domínio `arandu-demo.vercel.app` serve
  byte a byte o build de `0a260b6`: 188/188 arquivos baixados conferem com o
  manifesto servido, que confere 188/188 com um `build:demo` local reproduzido
  do mesmo SHA. **Defeito encontrado:** as 13 etapas da visita usavam capturas
  de `7de5d47` (25/10), 54 commits atrás, anteriores às mudanças de interface
  das #272–#280 em sete views (contratos, Central, RFQ, portal, propostas
  externas). **Corrigido:** capturas refeitas da Demo canônica local em
  `0a260b6` (backend, Auth, RLS e Storage reais; seed 39/39) e visita regenerada.
  Só passa a valer no domínio depois do merge e de novo smoke externo.
- **Laboratório financeiro real em `0a260b6`:** 29/29 etapas PASS, 65 ataques
  com 0 falhas, Auth/RLS/Storage PASS, teardown PASS; escopo provider 35/35
  verificações de recibo PASS.
- **Operação da estação (P0-B):** `prepare-station` agora tenta um terceiro
  registro oficial (GHCR da Supabase) quando ECR e Docker Hub recusam por cota —
  falha reproduzida hoje nos dois.
- Nenhum defeito de segurança P0 reproduzido; nenhuma migration; nenhuma
  mudança em app, API, RLS ou topologia.

## 2. SHAs

| Item | Valor |
| --- | --- |
| SHA inicial (main) | `0a260b6c1f6a1a8b6975b82fec949cf085831429` |
| SHA servido em arandu-demo (`/arandu-build.json`) | `0a260b6c1f6a1a8b6975b82fec949cf085831429`, `built_at` 2026-10-27T14:05:43Z |
| SHA das capturas antes | `7de5d478fa2b2d3140046875a903cb79358ba491` |
| SHA das capturas depois | `0a260b6c1f6a1a8b6975b82fec949cf085831429` |
| HEAD final da PR | o HEAD da branch; os quatro gates valem só nele |

PRs reconciliadas: #272–#280 integradas (ancestrais de `origin/main`); nenhuma aberta.

## 3. Problemas reproduzidos e prioridade

| # | Problema | Prioridade | Decisão |
| --- | --- | --- | --- |
| 1 | Visita pública mostra telas de `7de5d47`; sete views mudaram depois (responsável por tipo e entidade na Central, painel "Trabalho deste contrato", propostas externas, portal da instituição, RFQ). Fere o aceite "versão atual aprovada" e o roteiro de 5 atos (planos C) | P0-A | Corrigido: recaptura real + regeneração |
| 2 | `demo:setup` falha com ECR "Data limit exceeded" e Docker Hub "429" no mesmo dia; a contingência C2 do cartão do operador era manual | P0-B (operação) | Corrigido: fallback automático para `ghcr.io/supabase/*` nas mesmas tags; C2 continua válida |
| 3 | Varredura rápida de rotas esgotou o limite de requisições da conta ("Muitas requisições em pouco tempo") | não é defeito | Proteção funcionando; varredura repetida com ritmo, sem contornar o limite |
| 4 | Production build falha no `finance:env:check` | proteção intencional | Mantida: `ACTIVE_SUPABASE_ASSIGNMENTS.production` está vazio até recovery/cutover |

## 4. Alterações

| Arquivo | Mudança |
| --- | --- |
| `demo/visita/*.webp`, `demo/visita/captures.json`, `demo/visita.html` | Capturas de `0a260b6` por `scripts/design/capture-tour.mjs` (só leitura, sessão real por persona) e `scripts/generate-public-tour.mjs`. 13 etapas, desktop 1120 px e mobile 390 px, 752 KB no total |
| `scripts/pilot-local/up.sh` | Terceiro fallback de registro (GHCR) com as mesmas tags fixadas |
| `docs/IMPLEMENTATION_MATRIX.md` | Entrada datada |
| este arquivo | Evidência |

Diferença de comportamento: nenhuma no produto. O visitante passa a ver as
telas atuais; a estação passa a se recuperar sozinha de cota em dois registros.

## 5. Testes executados (neste container, em `0a260b6` + diff desta branch)

| Teste | Resultado |
| --- | --- |
| `npm ci --include=optional` | OK |
| `npm run check:all` | PASS |
| `npm run build`, `npm run build:demo` | PASS |
| `npm run check:build-size` | PASS — rota maior `rfq` 216.234 B (build) e 218.069 B (build:demo) / 250.000 B, iguais aos valores da #280; `sandboxJavascript` 327.561 / 330.000 B (aviso do próprio script: 99% do limite) |
| `npm run audit:ci` | 0 vulnerabilidades |
| Demo canônica local (`bash scripts/demo/local.sh setup`) | seed 39/39 |
| `local.sh readiness --smoke` | Modo leitura PRONTO; modo interativo NÃO PRONTO (pool de visitantes não provisionado — não necessário para leitura) |
| `scripts/financial-lab/run.mjs` (Node 24.22.1) | PASS: 29/29 etapas, 65 ataques/0 falhas, postgresql/auth_rls/storage PASS, browser/hosted NOT_RUN, teardown PASS |
| `ARANDU_FINANCIAL_LAB_SCOPE=provider` | PASS: 35/35 verificações de recibo; teardown PASS |
| `scripts/test-public-tour.mjs` | PASS (13 etapas, cinco áreas, sem promessa de backend) |
| Smoke externo do domínio público | ver §7 |
| Varredura de overflow (375/390/1366/1440) | PASS, 44/44 (§11) |

Não executados aqui: `npm run test:e2e` (o Playwright do projeto pede o
Chromium 1248 e o container tem 1243 — coberto pelo gate `presentation` no CI);
`deploy:check` com alvo real; `station`/`freeze` (só na máquina do owner).

## 6. Segurança, Auth/RLS/Storage

Evidência própria desta rodada, toda local e descartável: o laboratório cobre
allowlist fail-closed, convite de uso único (encaminhado, expirado, revogado,
colega do mesmo domínio), SoD comprador≠aprovador, confidencialidade entre
instituições (RFQ, propostas, rascunho, comparação, Passport), documentos em
bucket privado com URL de 60 s, contrato existente com resposta descartada →
recibo → retry sem duplicar, proposta externa sem autoria institucional
presumida, aprovação segregada, decisão humana única e snapshot preservado.
Não prova schema hospedado, Vercel nem a estação física.

## 7. Demo pública (P0-A) — observação externa

- `https://arandu-demo.vercel.app/` 200; `/demo/visita.html` 200; 19 assets
  referenciados pela visita 200; sem login Vercel/GitHub.
- Identidade: 188 arquivos baixados e hasheados = manifesto servido; manifesto =
  build local reproduzido com `VERCEL_PROJECT_PRODUCTION_URL=arandu-demo.vercel.app`
  e o mesmo SHA (as únicas diferenças sem essa variável eram `og:url`/`og:image`
  absolutos).
- `modality: informative-tour-with-browser-sandbox`, `backend_required: false`,
  `canonical_hosted_m3: BLOCKED` no manifesto.
- **Estado:** servido = main, mas com capturas desatualizadas →
  **NOT_PROVEN** como "versão atual" até esta PR ser integrada, publicada pela
  política de `main` e o smoke repetido (conferir `arandu-build.json` com o SHA
  de merge e `captures.json.sha`).

## 8. Vercel

Sem ferramenta/credencial Vercel nesta sessão: logs, alias e projetos
**NOT_RUN** (rodadas anteriores: ACCESS_BLOCKED 403 no scope `lucas-projects467`).
Nenhum deploy, alias, env ou secret alterado.

## 9. Produção e M3

`lib/deployment-topology.mjs`: `demo: []`, `production: []`; alvos
`PENDING_RECOVERY` / `PENDING_DATA_REVIEW`. O FAILURE de production é a
proteção correta. Para liberar: recovery comprovado (export, restore,
reconciliação), atribuição aprovada pelo owner e cutover autorizado.
M3 e M5: **BLOCKED / NOT_PROVEN**. Nenhum export, restore, seed, migration ou
cutover executado.

## 10. Estação local (P0-B)

Este executor só pode chegar a **PREPARED**. A mesma sequência que o owner roda
foi exercida aqui até setup + readiness em modo leitura. READY exige, no
computador definitivo (WSL2 + Docker Desktop, Node 24):

```bash
git fetch origin && git checkout <SHA de merge desta PR>   # árvore limpa
bash scripts/demo/local.sh prepare-station --provision     # D-1; se cota de registro, o fallback GHCR é automático
bash scripts/demo/local.sh freeze --station
bash scripts/demo/local.sh station                         # D-0: esperado READY
```

Não rodar `demo:down`, reset ou reseed depois do freeze; esperar `Retry-After`
em 429.

## 11. Evidência visual

Capturas antes: `git show 0a260b6:demo/visita/<etapa>-<viewport>.webp`.
Depois: `demo/visita/` nesta branch. `captures.json` registra SHA, data, base
`https://localhost:4443`, rota, persona e dimensões de cada imagem.

Varredura de overflow (rotas do roteiro, comprador e instituição):
44 verificações (9 rotas da Juliana + 2 do Atlas × 375/390/1366/1440), com 15 s entre navegações para respeitar o limite da conta: **0 overflow horizontal, 0 erro de carregamento, 0 erro de JavaScript**. Mede `scrollWidth > clientWidth` do documento; não é auditoria WCAG.

## 12. Limitações e riscos

- Capturas usam datas relativas do seed (prazos "em N dias" a partir de 27/10).
- `sandboxJavascript` a 99% do limite: qualquer acréscimo ao sandbox legado quebra o budget (e é proibido de qualquer forma).
- Node local do container era 22; laboratório rodou em Node 24.22.1 baixado e verificado por SHA-256.
- Imagens Docker vieram de GHCR / mirror.gcr.io nas mesmas tags oficiais.

## 13. Contingência 29/10

| Plano | Estado | Condição |
| --- | --- | --- |
| A — Demo canônica hospedada | BLOCKED | hosted parity READY no SHA aprovado; M3 bloqueado |
| B — Demo canônica local | PREPARED (executor) / NOT_PROVEN (máquina do owner) | `station` READY no SHA congelado |
| C — Visita pública | PASS de acesso e identidade; capturas atuais após merge desta PR | smoke externo pós-publicação |

## 14. Próximas ações e adiados

Owner: revisar e integrar esta PR; após publicação, repetir smoke (SHA servido
= merge, `captures.json.sha` = `0a260b6`); D-1 `prepare-station`/`freeze` e D-0
`station` no computador definitivo; ensaio dos 5 atos.

Adiados (P2/pós-evento): recusa de convite pela instituição como API própria;
qualquer redução do sandbox legado; M3/M5.
