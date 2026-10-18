# Demo canônica pública: experiência, jornada completa e prontidão para 29/10 (Claude, 18/10/2026)

Categorias usadas: **IMPLEMENTED** (no código desta branch), **LOCAL_VALIDATED** (executado contra a Demo canônica local real: app em `ARANDU_ENV=demo`, Postgres, GoTrue, PostgREST e Storage em Docker, seed 39/39), **CI_VALIDATED** (gates do GitHub no HEAD da PR), **HOSTED_VALIDATED** (executado no domínio público), **BLOCKED** (depende de outra frente), **NOT_RUN** (não executado; nunca conta como PASS).

## 1–4. Identificação

| Item | Valor |
| --- | --- |
| Branch | `claude/gracious-mendel-2l3lsh` (branch designada desta sessão; recomeçada da ponta da `main` depois do merge da #224 — a sugerida na missão, `claude/p0-canonical-demo-launch-validation-20261018`, não foi criada para não abrir uma segunda branch) |
| Base | `41513ee` (merge da #224) |
| SHA final | ver a PR (o HEAD exato é o que os quatro gates validam) |
| PR | aberta para `main`, sem merge automático |

## 5. O que foi examinado

- As 31 capacidades da matriz (`docs/DEMO_PRODUCTION_PARITY_MATRIX.md`) seguem `PARITY_VERIFIED` **localmente** (gate `check:demo-parity` verde nesta branch); o eixo hospedado continua `BLOCKED`. Esta rodada não reconstruiu a matriz: percorreu as capacidades da apresentação no produto real.
- **Ensaio de leitura das 16 etapas** com as contas do baseline, em 1440 e 390 px (Painel, Solicitações, RFQ da nova linha em 6 abas, comparação/aprovação/decisão da adquirência, Contratos, Implantação, Covenants, Instituições, Tarefas, Propostas, aprovações da CFO, portal da Meridian: início, oportunidades e proposta): **0 erro de console, 0 resposta 4xx/5xx da API, 0 overflow horizontal, 0 UUID/enum/ISO na tela**.
- **Jornada completa pela entrada pública**, num único workspace de visitante (detalhe na seção 13).
- Navegação sem sessão, link antigo `/demo`, rota inexistente, deep links (seção 16).
- Acessibilidade heurística em 13 telas e teclado na entrada (seção 17).
- Verificação hospedada contra `arandu-demo.vercel.app` (seção 20).

## 6–7. Defeitos reproduzidos e correções

| # | Defeito (reproduzido) | Antes | Correção | Teste |
| --- | --- | --- | --- | --- |
| D1 | Na comparação, dois avisos da mesma coluna se fundiam num texto só: **"8 condições mudaram desde a v1Proposta vencida"** (Lumina Pay, adquirência) | `comparison-header-1440-before.png` | `.matrix-flag` passa a bloco (um aviso por linha, alinhado à coluna) | `finance-procurement.spec.js` "comparação financeira: filtros, versões…" mede as duas caixas; **falha sem a correção**, passa com ela (Chromium, Firefox, Pixel 7) |
| D2 | Link aberto sem sessão (ex.: `/finance/rfq.html?id=…` compartilhado, nova aba) levava ao **Painel** depois do login: "Entrar na conta" mandava `next=/finance/dashboard.html` e o login só aceitava caminho sem query; a entrada por persona ignorava `next` | — | A tela de "Entre para usar o portal" e o "Entrar em outra aba" de sessão expirada mandam a página aberta (caminho + query restrita); o login por senha e a **entrada por persona** voltam a ela. A persona só segue link do próprio lado (empresa → `/finance`, instituição → `/provider`). SSO mantém o contrato do servidor (só caminho) | `finance-procurement.spec.js` (retorno ao registro; `?id=<script>`, `//evil`, `#` e `https://` recusados; link do gate) e `demo-persona-entry.spec.js` (persona com `next` do próprio lado, do outro lado e inválido) |
| D3 | A entrada pública não dizia **o que é o Arandu**, que **não é banco**, que o que se faz **fica gravado** e **como sair** | `entry-*-before` = `docs/evidence/claude-canonical-demo-parity-2026-10-18/login-*-after.png` | Uma frase do que o produto organiza; "O Arandu não é banco: não concede crédito, não movimenta dinheiro e não escolhe a instituição"; "fica gravado de verdade"; "Sair" no menu da conta | `demo-persona-entry.spec.js` (texto exigido) |
| D4 | No celular, o botão **"Entrar" do cabeçalho público ficava cortado** (navegação com rolagem horizontal escondida; aparecia só um "E") em 320–390 px | medido: borda direita do botão em 424 px numa tela de 390 px | Navegação pública quebra linha em ≤ 700 px em vez de rolar | `finance-procurement.spec.js` "site público no celular…" em `/`, `/login.html`, `/produto.html`: **falha sem a correção** |
| D5 | `hosted-parity.mjs` só sabia READY/NOT_READY: sem distinguir **acesso bloqueado** de **falha de transporte**, sem checar **sessão exigida**, **assets** do build e **rotas** | — | Vereditos `READY`, `NOT_READY`, `ACCESS_BLOCKED`, `INCONCLUSIVE` (regra pura em `scripts/demo/hosted-parity-verdict.mjs`); itens novos: domínio responde como o Arandu, `/api/finance/*` exige sessão (401), cada asset referenciado pelo `login.html` publicado, rotas de RFQ/contratos/proposta; timeout de 20 s | `demo-hosted-parity-verdict.spec.js` |

Ganho, sem números inventados: D1 remove uma leitura errada exatamente na tela que prova "versões preservadas"; D2 elimina o caminho morto de quem recebe um link do processo; D3 responde, antes da escolha, às perguntas que a missão lista (o que é, o que não é, dados, isolamento, papéis, registro, saída); D4 tira um botão quebrado da primeira tela do celular; D5 impede que "sem acesso" ou "sem rede" seja lido como pronto ou como falha do produto.

## 8–9. Testes e matriz de navegadores

Preenchido com a execução final antes do push (ver seção "Validação" da PR). Firefox desktop instalado localmente nesta rodada; **WebKit e iPhone: NOT_RUN localmente** (navegador não instalado nesta estação) — cobertos pelo job `validate` do CI.

## 10. Paridade

A paridade visual canônico × entrada (mesmo dataset, mesma persona, 320–1440 px) foi provada na #224 (6/8 telas com texto idêntico; diferenças só de tempo relativo e ordem de empate, H-13). Esta rodada não refez as capturas: nenhuma tela canônica mudou de estrutura, só os avisos da comparação (D1), comparados antes/depois com o dado real.

## 11–15. Personas, workspace, persistência, isolamento e capturas

`tests/e2e/demo-entry-lifecycle.spec.js` (novo) — **LOCAL_VALIDATED, 1 passed (39,7 s)**, um workspace de visitante, só pela entrada pública e "Trocar persona":

| Passo (critério da missão) | Verificação |
| --- | --- |
| 1–7 entrada, sessão, organização, papel | Juliana entra pela escolha de persona; workspace lido de `/api/finance/organizations`; selo do ambiente; nome e papel na barra lateral; Vitta Foods no seletor |
| 8–12 necessidade, RFQ, convidadas, propostas, comparação | R$ 12.000.000; "3 convidados · 2 responderam" com Meridian; Atlas em versão 2; "O Arandu não recomenda instituições" |
| 13–15 versionamento, aprovação, decisão | Lumina v2 na comparação e na decisão; Helena (mesmo workspace) aprova a etapa dela, **relida em Concluídas após recarregar**; Juliana passa a ver "Registrar decisão" no Painel |
| 16–20 contrato, implantação, obrigações, tarefas, renovação | Contrato da Lumina com "Ver processo e decisão de origem" e "Implantação deste contrato"; Atlas com "Janela de renovação aberta", "Iniciar nova concorrência" e "Covenants e obrigações deste contrato" (Dívida líquida/EBITDA); tarefa com Rafael como responsável **relida após recarregar** |
| 21–23 instituição | Meridian: comprador identificado, sem concorrentes; obrigatórios bloqueiam o envio vazio; v1 enviada e relida; v2 com "1,29% → 1,27%" no histórico relido |
| isolamento entre instituições | Orbe abre o link da proposta da Meridian: "Proposta não encontrada", sem nome, taxa ou produto vazados |
| 24–25 volta e persistência | Juliana vê "Meridian Financial · versão 2 de 2" e a tarefa criada |
| papel | Carlos (leitor) vê a tarefa, sem caixa de conclusão nem formulário |
| 26 sair | "Sair" no menu da conta → login; `/api/finance/organizations` = **401** |
| robustez | nenhuma resposta 5xx da API durante o roteiro |

**27 — outro visitante:** `demo-entry-journeys.spec.js` (dois visitantes simultâneos, workspaces diferentes, escrita de um invisível ao outro) e `demo-workspaces.spec.js` (19 módulos negando o outro tenant, IDOR, cookie forjado, quota, expiração) — resultado na seção 8–9.

Capturas desta rodada em `docs/evidence/claude-public-canonical-demo-launch-2026-10-18/`: antes/depois do cabeçalho da comparação (dado real), entrada em 390 e 1440 px.

## 16. Navegação e erros

Sem sessão: `/finance/contracts.html` e `/provider/proposal.html?proposal=…` mostram "Entre para usar o portal" (nenhum dado, nem fictício); `/demo/index.html` mostra 404 com "Entrar na demonstração" (só porque o servidor expõe a Demo); rota inexistente: 404 com caminho de volta. 401/409/429/rede/incerto ao gravar: cobertos por testes das PRs #216/#218/#224 (regressão no `test:e2e`). Deep link: D2.

## 17. Acessibilidade

Heurística em 13 telas reais (entrada, Painel, Solicitações, Aprovações, Contratos, Implantação, Covenants, Tarefas, Propostas, Comparação, Decisão, Aprovações da RFQ): **0 controle sem nome acessível, 0 campo sem rótulo, 0 id duplicado, 1 `h1` por tela, `lang` presente**. Entrada: foco inicial no primeiro cartão ao chegar por `#demonstracao`, Tab percorre os cartões na ordem da jornada, contorno de foco de 3 px. Sem axe-core no projeto (não adicionado: `package.json` fora do escopo) — **auditoria WCAG completa com leitor de tela: NOT_RUN**.

## 18–19. Roteiros

`docs/demo/PRESENTATION_2026-10-29.md` ganhou: decisão **A / B / C** com condição verificável; **preparação reproduzível da estação** (Roteiro B), incluindo o ensaio completo por `demo-entry-lifecycle.spec.js` e o reinício controlado **sem apagar dados** (`demo:down` apaga tudo — corrigido no texto); **15 contingências** com reconhecimento e procedimento seguro (Vercel, Supabase, Auth, pool, rede lenta, 409, proposta alterada, Storage, permissão revogada, sessão, 429, navegador, celular, asset, dados de apresentação anterior).

## 20–21. Prontidão e estado público

`node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=41513ee408f58dff6386eabea4d45f03205aeadd` (18/10, 22h UTC):

| Resultado | Itens |
| --- | --- |
| PASS | domínio, health, `misconfigured=false`, **SHA = 41513ee**, login canônico, 5 assets do build, Painel canônico, rotas RFQ/contratos/proposta |
| FAIL | `environment` ausente, `datasource=synthetic-fixtures`, prontidão 503, personas 404, `/api/finance/organizations` 404 (não 401), sandbox legado servido em `/demo` |

**Veredito: NOT_READY.** O domínio publica o build certo, mas como sandbox (`ARANDU_DEPLOYMENT_KIND=demo`), não como Demo canônica. **HOSTED_VALIDATED: nada.** Laboratório local (`--local`): tudo PASS exceto prontidão 503 (esperada: banco fora da topologia hospedada) — por isso o veredito local também não é READY e não libera o Roteiro A.

## 22. Handoff ao Codex

Continuam válidos H-9 (P0 cutover do `arandu-demo` para a Demo canônica), H-10 (redirect de `/demo`), H-11, H-12 (reabastecimento automático do pool) e H-13, de `docs/evidence/claude-canonical-demo-parity-2026-10-18.md`. Novo:

| Campo | H-14 |
| --- | --- |
| Problema | Provisionar o pool local leva dezenas de minutos: dois seeds em paralelo dividem o limite de 120 requisições/10 min por usuário e ficam esperando |
| Endpoint | API financeira usada por `scripts/demo/seed.mjs --quiet` (via `npm run demo:local:workspaces -- provision`) |
| Persona | contas do seed de cada workspace |
| Reprodução | `npm run demo:local:workspaces -- provision --count=4` numa Demo recém-semeada |
| Observado | 18/10: os dois primeiros workspaces seguiam em `provisioning` 25+ min depois do início; o seed principal (mesmo script) registrou "limite de requisições da API atingido; aguardando 30 s" repetidas vezes |
| Esperado | Workspace pronto em poucos minutos, ou estimativa honesta no runbook; para o hospedado, reabastecimento antes de esvaziar (H-12) |
| Severidade | P2 (operação da apresentação: a estação precisa ser preparada com horas de antecedência) |
| Evidência | log do provisionamento e `demo:local:workspaces -- list` nesta sessão |
| Aceite | 4 workspaces prontos em tempo previsível e documentado, sem relaxar o limite para usuários reais |

## 23–25. Riscos, rollback e estado

- **Riscos:** a Demo hospedada continua não validada; o Roteiro B depende de uma estação preparada com antecedência (H-14). D2 aceita query restrita no retorno do login — mesma origem, só `/finance/*.html` e `/provider/*.html`, sem `#`, sem `//`, com teste negativo.
- **Rollback:** reverter a PR (sem SQL, migration, API ou configuração).
- **Estado A/B/C em 18/10:** **A — NÃO** (NOT_READY). **B — pronto nesta estação de laboratório** (seed 39/39, jornada completa LOCAL_VALIDATED), mas a estação da apresentação precisa repetir a lista do Roteiro B no dia. Até lá, o estado declarado para 29/10 é **B condicionado à preparação da estação**; sem ela, **C**.
