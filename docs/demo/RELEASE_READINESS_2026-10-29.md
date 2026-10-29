# Prontidão de release — apresentação de 29/10/2026

> **Nomenclatura:** Plano A = demonstração financeira interativa **local**; Plano B = demonstração financeira **hospedada**; Plano C = **visita pública** informativa.

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

## 8. Segunda auditoria independente — 29/10 (03:00–04:30Z)

Mesmo tipo de executor (efêmero, reciclado entre as rodadas; não é a máquina
do apresentador). Nenhum código, deploy, configuração ou dado hospedado alterado.

### 8.1 Reconciliação

| Verificação | Resultado | Evidência | Impacto | Ação |
| --- | --- | --- | --- | --- |
| `origin/main` | PASS — `f4f247f` (merge da #282, só docs) | `git log origin/main` | nenhum | — |
| Código de app entre `d5e1612` e `f4f247f` | PASS — idêntico (5 arquivos de docs) | `git diff --stat d5e1612 f4f247f` | o commit aprovado de app continua `d5e1612` | — |
| Gates da #282 (run 40805619330) | PASS — 4/4 | GitHub check runs | — | — |
| PRs abertas / worktrees | PASS — 0 / só a principal | GitHub, `git worktree list` | — | — |
| arandu-demo serve | PASS — `f4f247f`, `built_at` 2026-10-29T02:44Z | `arandu-build.json` | — | — |
| Manifesto | PASS — 188/188 hashes; **byte a byte igual ao build de `d5e1612`** (0 arquivos diferentes) | comparação dos dois manifestos | a visita é exatamente a versão aprovada | — |
| arandu-pilot / arandu (Production) | NOT_RUN — sem acesso Vercel; `*.vercel.app` adivinhados respondem 404 e não provam nada | — | nenhum: não serão usados | — |
| Visita offline (`build:demo` + `serve:test`, rede externa bloqueada) | PASS — 13/13 etapas visíveis com imagem, 1440 e 390 | Playwright | contingência sem internet confirmada | — |
| Visita pública, etapa a etapa (âncoras) | PASS — 13/13, 1440 e 390 | Playwright | — | — |

### 8.2 Estação (ensaio no executor) e contingência real

Ao reciclar o container o Docker parou. `local.sh resume` falhou com
`503 Could not query the database for the schema cache` — exatamente o caso
C3 do cartão — e a mensagem do seed sugeriu `npm run demo:reset`. Aplicado o
procedimento C3 (`docker restart arandu-pilot-local-rest-1` + `resume`):
**39/39 em 7 s**. Classificação **P1** (contorno documentado e comprovado);
não justifica código no dia. O cartão já diz para não resetar.

### 8.3 Cinco atos, desktop 1440×900 e 1366×768 (stack real, só leitura)

18 telas/abas por resolução (Juliana, Helena, Eduardo): **0** erro de
JavaScript, **0** resposta HTTP ≥ 400, **0** overflow horizontal, **0** UUID,
data ISO ou enum na tela. Portal do Eduardo: só as próprias oportunidades e
versões (v1 → v2), aviso "Você não vê propostas de outros provedores…";
rotas do comprador redirecionam para o portal.

### 8.4 Matriz de defeitos

| ID | Tela/fluxo | Gravidade | Reprodução | Observado | Esperado | Correção/contingência | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Retomada após reinício do Docker | P1 | parar o daemon; `local.sh resume` | 503 schema cache; mensagem sugere reset | resume volta sozinho | C3 do cartão (7 s). Correção de script no backlog | MITIGADO |
| D2 | Comparação da Adquirência | P1 (fala) | Ato 4 → Comparação | as três propostas mostram "Proposta vencida" | — (é correto: validade expirou após a contratação) | Roteiro explica antes de abrir | MITIGADO |
| D3 | Aprovações da Adquirência | P1 (fala) | Ato 5 → aba Aprovações | justificativa do Controller fictício: "a economia de MDR compensa…" | — (texto humano registrado) | Não ler em voz alta; não converter em claim | MITIGADO |
| D4 | Contratos → painel do contrato | P2 | abrir contrato; botão Voltar do navegador | Voltar sai de Contratos (o painel não entra no histórico) | fechar com × | Roteiro: fechar com × | MITIGADO |
| D5 | Aprovações (card) | P2 | Ato 5 | "Prazo de liquidação 1 dias" | "1 dia" | backlog | ABERTO |
| D6 | Painel do contrato Atlas | P2 | Contratos → Atlas | obrigação vencida aparece como "Pendente" (em Instituições aparece "Tarefa vencida"); datas de criação sem ano | mesmo rótulo nas duas telas | backlog | ABERTO |
| D7 | Proposta externa | P1 (roteiro) | — | o cenário semeado não tem proposta registrada pelo comprador | — | Só como resposta verbal; não prometer na tela | MITIGADO |
| D8 | Nomenclatura de planos | P1 (operação) | documentos antigos × novos | A/B invertidos entre documentos | uma só convenção | Corrigido nesta rodada (nota em todos + cartão relabelado) | CORRIGIDO |
| D9 | Barra lateral em páginas longas | — | rolar Contratos até o fim | fixa e íntegra em rolagem real | — | era artefato de captura full-page | NÃO É DEFEITO |
| D10 | 429 logo após preparação | — | `prepare-station` e abrir a demo em seguida | mensagem clara, botão bloqueado até o Retry-After | — | proteção correta; janela T-30 | NÃO É DEFEITO |

Nenhum P0. Decisão: **Caso A — sem alteração de código.**
