# Prontidão de release — apresentação de 29/10/2026

Observação feita entre 2026-10-29T00:30Z e 02:20Z (noite de 28/10 em
America/Sao_Paulo) por Claude Code em **executor efêmero de nuvem**
(`CLAUDE_CODE_REMOTE`), não no computador do apresentador. Nenhum deploy,
migration, recovery, cutover, reset hospedado ou mudança de configuração foi
feito. Nenhuma linha da Implementation Matrix foi promovida.

## 1. Versão aprovada

| Item | Valor | Evidência |
| --- | --- | --- |
| `origin/main` | `d5e1612b482d635f0d110db82a0fc4f9412f368f` (merge da #281) | `git fetch origin main && git rev-parse origin/main` |
| PRs abertas | 0 | GitHub `list_pull_requests state=open` |
| Árvore da main = árvore do HEAD da #281 (`ea7d544`) | sim | `git diff --quiet ea7d544^{tree} d5e1612^{tree}` |
| Quatro gates no HEAD da #281 | `deploy-boundaries`, `database`, `presentation`, `validate`: SUCCESS (27/10, run 40555530510) | GitHub check runs da #281. Como a árvore é idêntica, o resultado vale para o código de `d5e1612` |
| Alterações de app entre `0a260b6` (capturas) e `d5e1612` | nenhuma: só `demo/visita*`, docs e `scripts/pilot-local/up.sh` | `git diff --stat 0a260b6 d5e1612` |

## 2. Matriz de verificação

| # | Verificação | Resultado | Evidência reproduzível |
| --- | --- | --- | --- |
| 1 | SHA servido em `arandu-demo.vercel.app` | **PASS** — `d5e1612…`, `built_at` 2026-10-28T12:39:42Z, `modality: informative-tour-with-browser-sandbox`, `backend_required: false`, `canonical_hosted_m3: BLOCKED` | `curl https://arandu-demo.vercel.app/arandu-build.json` |
| 2 | Integridade do manifesto | **PASS** — 188/188 arquivos baixados com HTTP 200 e SHA-256 igual ao manifesto | script de hash da §5 |
| 3 | Capturas da visita = versão aprovada | **PASS** — `captures.json.sha = 0a260b6`; nenhum arquivo de app mudou até `d5e1612` | linha 5 da §1 |
| 4 | Visita de 13 etapas (Chromium 1440/1366/390/375) | **PASS** — 13 imagens carregadas, 0 quebradas, 0 overflow horizontal, 0 erro de JavaScript, 0 resposta ≥ 400; 17 âncoras internas resolvem | Playwright, §5 |
| 5 | Firefox e WebKit | **NOT_RUN** — navegadores não instalados neste executor; o gate `presentation` do CI é a cobertura cross-browser existente | — |
| 6 | Linguagem da visita | **PASS** — rotulada "Ambiente demonstrativo… Nada aqui é gravado, enviado a instituições ou executado"; sem métricas de economia, logos ou clientes; `scripts/test-public-tour.mjs` PASS | `node scripts/test-public-tour.mjs` |
| 7 | Demo canônica local (Plano A) no executor | **PASS como ensaio** — `prepare-station --provision`: seed 39/39, pool 4 prontos (633 s por lote de 2), Modo leitura PRONTO, Modo interativo PRONTO | `reports/demo-readiness/readiness.md` (local, não versionado) |
| 8 | Estação física | **NOT_PROVEN** — executor efêmero termina em PREPARED (correto); READY só no computador definitivo | `reports/demo-station/station.md`: 29 PASS + "Máquina persistente: PREPARED" |
| 9 | Ensaio dos cinco atos na stack real (somente leitura) | **PASS** em mobile 390; desktop 1440 recebeu 429 na Juliana nas 5 primeiras telas porque o `prepare-station` tinha acabado de consumir a cota dela — a tela mostrou "Muitas requisições… Tente de novo em N segundos" com botão bloqueado até o Retry-After. Após a janela, todas as telas carregaram sem erro, sem overflow e sem UUID visível | §5 |
| 10 | Guarda de Node 24 no preflight | **PASS** — com Node 22 o preflight parou em BLOCKED antes de subir qualquer serviço | primeira execução de `prepare-station` |
| 11 | Demo hospedada com backend (Plano B) | **BLOCKED** — `ACTIVE_SUPABASE_ASSIGNMENTS` vazio até recovery/cutover; nenhum `hosted-parity` READY | `lib/deployment-topology.mjs` |
| 12 | Production / M5 | **BLOCKED** — falha de build no `finance:env:check` é a proteção pretendida | evidência de 27/10 |
| 13 | Logs/alias Vercel | **NOT_RUN** — sem credencial Vercel nesta sessão | — |
| 14 | `npm run check:all` e `npm run build` neste executor | ver §6 | — |

## 3. Estado de cada modalidade

| Modalidade | Estado | O que pode ser dito |
| --- | --- | --- |
| **A — Demo interativa local** (Auth, RLS, Storage, API reais; dados fictícios) | PREPARED/ensaiada no executor; **NOT_PROVEN no computador do apresentador** | Só apresentar se `bash scripts/demo/local.sh station` disser READY na máquina, hoje |
| **B — Demo hospedada com backend** | **BLOCKED** | Não apresentar; não dizer que existe ambiente hospedado operacional |
| **C — Visita pública** `https://arandu-demo.vercel.app/demo/visita.html` | **PASS** (SHA, integridade, 13 etapas, desktop e mobile em Chromium) | "Visita guiada com capturas reais do produto, dados fictícios; nada é gravado" |

## 4. Capacidades: real, simulado, capturado

| Capacidade | Na estação local (A) | Na visita (C) |
| --- | --- | --- |
| Login por persona, RLS entre empresas e instituições | real | captura |
| Solicitação estruturada, convites, propostas versionadas | real | captura |
| Proposta externa registrada pelo comprador (origem declarada) | real | captura |
| Comparação factual sem ranking | real | captura |
| Aprovação segregada (Controller → CFO) e decisão humana | real | captura |
| Contrato, obrigações, tarefas, renovação | real | captura |
| Portal da instituição (só o próprio convite) | real | captura |
| Documentos em bucket privado com link temporário | real | não demonstrado |
| Integração bancária, Open Finance, assinatura, desembolso | **não existe** | **não existe** |
| Sandbox legado `/demo/finance/*` | — | simulação no navegador; não usar na narrativa |

## 5. Como reproduzir

```bash
curl -sS https://arandu-demo.vercel.app/arandu-build.json | jq -r .commit
```

Integridade: para cada entrada de `files`, baixar `https://arandu-demo.vercel.app<path>`
e comparar `sha256`. Visita: Playwright Chromium em 1440×900, 1366×768,
390×844 e 375×667, rolagem completa, `pageerror`/`console.error`/HTTP ≥ 400,
`scrollWidth > clientWidth` e `img.naturalWidth === 0`. Ensaio dos atos: login
de Juliana, Helena e Eduardo em `https://localhost:4443/login.html`, rotas do
roteiro, mesmas checagens e procura de UUID no texto.

## 6. Checagens locais do código

Executadas neste executor em `d5e1612` (árvore limpa; os gates do CI valem por
serem a mesma árvore da #281):

| Comando | Resultado |
| --- | --- |
| `npm run check:all` | PASS |
| `npm run build` | PASS |

## 7. Riscos

1. Estação física ainda não provada (principal risco). Mitigação: OPERATOR_RUNBOOK §1.
2. Cota da Juliana: qualquer `prepare-station`, `readiness` ou ensaio nos 10 min anteriores derruba as primeiras telas com 429 (reproduzido hoje). Mitigação: nada roda depois de T-30.
3. Datas do seed são relativas à data do setup; prazos "em N dias" podem diferir dos citados no roteiro se o setup foi feito em outro dia.
4. Cross-browser só coberto pelo CI, não pelo domínio público nesta rodada.
