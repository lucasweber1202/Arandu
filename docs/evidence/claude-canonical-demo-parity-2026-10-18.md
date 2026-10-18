# Evidência — paridade da Demo pública com o produto canônico (Claude), 18/10/2026

Base: `main` @ `005676a` (#222). Branch: a branch gerenciada da sessão, reiniciada dessa `main`. PR: ver descrição.
Área exclusiva: `financial-demo-entry.js`, `financial-not-found.js`, `financial-auth.js` (bloco da entrada por persona),
`login.html` (sem mudança de marcação), `404.html` (um `<script>`), `financial-public.css`, `finance/src/shell.js`
(selo do ambiente), `finance/style.css`, `tests/e2e/**`, `playwright.demo.config.js` (+1 spec na lista da Demo),
`scripts/demo/hosted-parity.mjs`, `docs/demo/PRESENTATION_2026-10-29.md` e este documento. **Nenhum** arquivo de `api/**`,
`lib/**`, SQL/migrations/RLS/Auth/Storage, `vercel.json`, `package.json`/lock, workflows, `docs/IMPLEMENTATION_MATRIX.md`
ou do Codex.

## Estado por categoria

| Categoria | O quê |
| --- | --- |
| IMPLEMENTED | Entrada pública da Demo canônica por persona (jornadas, aviso de dados fictícios, destino por lado); "Trocar persona" no selo do ambiente; 404 de link antigo `/demo` que leva à entrada; verificação hospedada `scripts/demo/hosted-parity.mjs`; roteiros A/B |
| LOCAL_VALIDATED | Demo canônica local (Docker: Auth, PostgREST, Storage, API real, seed 39/39, pool de workspaces): jornada pela entrada pública **PASS**; dois visitantes simultâneos **PASS**; testes mockados da entrada 20/20; `test:e2e` 460 passed + 10 skipped e `test:e2e:presentation` 125 passed + 19 skipped (Chromium desktop + Pixel 7); `check:all` (inclui `check:demo-parity`), `check:design`, `build`, `git diff --check` |
| CI_VALIDATED | quatro gates no HEAD da PR — ver PR |
| HOSTED_VALIDATED | **nenhum** |
| BLOCKED | Demo hospedada: `arandu-demo.vercel.app` publica o sandbox (ver "Readiness hospedada") — depende do cutover do Codex |
| NOT_RUN | Firefox, WebKit e iPhone localmente (navegadores não instalados neste executor; CI roda os cinco); `test:database` (sem SQL) |

## Lote 1–2 — inventário e mapa de diferenças

**Produto canônico.** `lib/finance/parity-manifest.mjs` → 31 capacidades, todas `PARITY_VERIFIED` localmente
(`docs/DEMO_PRODUCTION_PARITY_MATRIX.md`): Início, Tarefas, Aprovações, Notificações, Solicitações (lista, nova, detalhe,
comparação, decisão), Propostas, Documentos e fatos, Implantação, Contratos, Dívida, Covenants, Tarifas, Spend, Valor,
Oportunidades, Instituições, Qualificação, Performance, Passport, Console operacional, Limites, Portal da instituição
(início, oportunidades, proposta, convite) e entrada por persona. Cada uma com rota, recurso da API e checagem do seed; o
gate falha se uma tela não pertencer a nenhuma capacidade.

**Sandbox público (`/demo`, build com `ARANDU_DEPLOYMENT_KIND=demo`).** Não é o produto: 23 telas em `demo/finance/` + 4 em
`demo/provider/` que carregam `finance/demo/workspace/boot.js`; motor no navegador (`finance/demo/engine.js`, estado em
`localStorage`, "Restaurar demonstração"); **outro elenco e outra empresa** (Acme Indústria, Marina Costa, Ricardo Alves,
Camila Rocha/Atlas, Helena Prado) contra a Vitta Foods do seed canônico; telas exclusivas `intake`, `policies`,
`integrations`, `usage` (decisões registradas na matriz: promovida, equivalente canônico ou não promover).

| Dimensão | Sandbox `/demo` (hoje público) | Demo canônica (`ARANDU_ENV=demo`) | Diferença que comprometia a apresentação |
| --- | --- | --- | --- |
| Telas | cópias com camada própria | as mesmas de `finance/**` e `provider/**` | melhorias da `main` (ex.: #220, #222) só chegam ao canônico |
| Dados | fixtures no navegador (Acme) | seed real pela API (Vitta Foods) | roteiro de 29/10 e capturas são da Vitta: o público via outra empresa |
| Autenticação | nenhuma (troca de "persona" local) | Auth real; `POST /api/auth/demo-login` abre sessão no workspace do visitante | sem sessão real, RLS e papéis não eram demonstrados |
| Escrita | `localStorage` | API + banco; releitura do servidor | "persistiu" era só no navegador |
| Isolamento | por navegador | workspace por visitante no banco (docs/demo/VISITOR_ISOLATION.md) | — |
| Entrada | página própria com 4 papéis e "processo em 7 passos" | lista plana de 9 botões "Nome · Cargo" no login, todos indo a `/finance/index.html` | **lacuna desta PR**: o visitante não sabia quem escolher, o que cada um faz, que os dados são fictícios nem que tem um espaço só dele; instituição passava por redirecionamento |
| Voltar / trocar | seletor de papel na faixa | só "Sair" | **lacuna desta PR**: sem caminho para trocar de persona no workspace |
| Link antigo `/demo/...` | sandbox | 404 genérico no build canônico | **lacuna desta PR** |
| Identidade hospedada | `datasource=synthetic-fixtures` | `datasource=supabase`, `environment=demo` | não havia verificação objetiva do que está publicado |

Verificado no build canônico local: `/finance/*` e `/provider/*` não carregam o sandbox (gate `check:demo-parity`), e
`/demo/index.html` responde 404.

## Lote 3–4 — o que mudou

| # | Prior. | Mudança | Arquivos |
| --- | --- | --- | --- |
| E1 | P0 | **Entrada pública da Demo canônica**: "Conheça o Arandu por dentro" no `login.html`, só quando o servidor expõe `auth/demo-personas` (Produção não mostra nada). Três fatos ditos antes da escolha (dados fictícios e nada sai do ambiente; espaço só do visitante que expira; permissões reais). Personas agrupadas em **Empresa compradora · Vitta Foods** (gestora, CFO/aprovadora, analista, leitor) e **Instituições financeiras**, cada uma com papel e o que encontra no dataset; ordem da jornada (gestora primeiro; Meridian, que responde ao vivo, primeiro entre as instituições). Persona nova do servidor aparece com nome e cargo, sem jornada inventada | `financial-demo-entry.js`, `financial-auth.js`, `financial-public.css` |
| E2 | P0 | **Login real e destino certo**: o navegador envia só `{persona}`; entrada só conta com `authenticated: true` do servidor; comprador → Painel, instituição → portal da instituição (antes: todos a `/finance/index.html`, instituição redirecionada). Recusas ditas sem dizer que entrou: Demo cheia (`demo_capacity`), 429, rede, 404, 200 sem sessão | idem |
| E3 | P1 | **Trocar persona** no selo "Ambiente de demonstração" do workspace → volta à entrada (`/login.html#demonstracao`, foco no primeiro cartão); o servidor abre a nova sessão no **mesmo** workspace. Só no ambiente `demo` (lista permitida do gate); alvo ≥ 40 px no celular | `finance/src/shell.js`, `finance/style.css` |
| E4 | P1 | **Link antigo `/demo/...` numa Demo canônica**: o 404 oferece "Entrar na demonstração" só se o servidor expõe personas; em Produção continua 404 comum | `financial-not-found.js`, `404.html` |
| E5 | P0 | **Verificação hospedada objetiva**: `node scripts/demo/hosted-parity.mjs --url=… --sha=…` lê `/api/health` (ambiente, datasource, SHA), `?probe=ready`, `auth/demo-personas`, casca canônica sem sandbox e `/demo` sem sandbox; READY só com tudo PASS; NOT_RUN nunca passa | `scripts/demo/hosted-parity.mjs` |

Correções da #222 (origem do contrato, tabelas com `data-label`, tarefas por urgência, painel orientado a trabalho, comprador
no portal, barra compacta, uma ação primária, plural) **não foram reimplementadas**: a entrada leva às mesmas telas; a
jornada real abaixo passa por elas.

## Lote 5–7 — testes

**Mockados (`npm run test:e2e`, `tests/e2e/demo-persona-entry.spec.js`, 20/20 em Chromium desktop + Pixel 7):** toda persona
do seed (`lib/finance/demo-personas.mjs`) tem jornada e lado corretos e todo guia tem persona (falha se o seed mudar);
grupos e fatos; foco por `#demonstracao`; só `{persona:'juliana'}` sai do navegador; comprador → Painel; instituição →
portal; recusas (cheia, 429 com o tempo do `Retry-After` do servidor, rede, 200 sem sessão) sem navegar; persona nova sem jornada; ordem; 404 de `/demo` com e sem
Demo; nome de persona renderizado como texto (sem XSS); sem rolagem horizontal. `finance-procurement`: "Trocar persona" só
com `environment: demo`.

**Backend real (Demo canônica local, `playwright.demo.config.js`):**

| Spec | O que prova | Resultado |
| --- | --- | --- |
| `demo-entry-journeys.spec.js` (novo; `ARANDU_DEMO_ENTRY_E2E=1`) | entrada pública → Painel com `environment=demo` lido do servidor e Vitta Foods; tarefa criada **persiste após recarregar**; Rafael (outra persona, mesmo visitante) vê a tarefa no **mesmo** workspace; Carlos (leitor) vê sem caixa de conclusão nem formulário; Meridian entra no portal da instituição, proposta com "Solicitado por Vitta Foods" e sem concorrentes; **segundo visitante simultâneo** entra em outro workspace e não vê a tarefa; o primeiro continua no seu; logout → 401 | **PASS** (11 s) |
| `demo-workspaces.spec.js` (existente; helper atualizado para a nova região) | dois visitantes: 19 módulos negam a organização do outro (403), IDOR, escrita, aprovação, troca de persona no mesmo workspace, portal do provedor, cookie forjado, quota e expiração | **PASS** (8 s) |
| `demo-baseline.spec.js` | jornadas canônicas pelas contas do baseline | não reexecutado nesta rodada (sem mudança nas telas; executado na #222: desktop e celular 6 passed + 1 skipped) |

Pool usado: `npm run demo:local:workspaces -- provision --count=4` e `--count=2` (≈10 min por lote).

## Paridade visual (mesma persona, mesmo dataset)

`claude-canonical-demo-parity-2026-10-18/`:
- `login-<largura>-{before,after}.png` — 320, 390, 768, 1024 e 1440 px; a mesma lista de personas do servidor local nos dois
  builds (antes = `main` `005676a`); 0 overflow em todas.
- `parity-*.png` e `parity-report.json` — produto canônico (conta do baseline por e-mail) × entrada pública (workspace do
  visitante), **mesma persona** (Rafael; Patrícia/Meridian no portal), mesmo seed e mesma viewport. O texto de `#view` de
  cada tela foi comparado (tempos relativos normalizados):

| Tela | Texto | Larguras | Overflow | Selo + "Trocar persona" |
| --- | --- | --- | --- | --- |
| Painel | igual exceto o tempo relativo da atividade ("há 1 h" × "há 15 min": o workspace foi clonado depois) | 320, 390, 768, 1024, 1440 | 0 | sim / sim |
| Solicitações | **igual** (211 palavras) | 390, 1440 | 0 | sim / sim |
| RFQ "Capital de giro — nova linha" | **igual** (424) | 390, 1440 | 0 | sim / sim |
| Contratos (origem da decisão da #222) | **igual** (500) | 390, 1440 | 0 | sim / sim |
| Tarefas (grupos por urgência da #222) | igual exceto a ordem de 5 tarefas com o **mesmo prazo** (07/11): o servidor ordena só por prazo e o clone tem novos IDs → H-13 | 390, 1440 | 0 | sim / sim |
| Implantação (rótulos no celular da #222) | **igual** (108) | 390, 1440 | 0 | sim / sim |
| Portal da instituição — início | **igual** (121) | 390, 1440 | 0 | sim / sim |
| Proposta "Capital de giro sazonal" (comprador no topo, barra compacta da #222) | **igual** (345) | 320, 390, 768, 1024, 1440 | 0 | sim / sim |

Conclusão: a entrada pública leva às **mesmas telas, com o mesmo conteúdo**, do produto canônico — não a uma cópia.

## Readiness hospedada (lida do servidor em 18/10)

`node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=005676a0ddc10ccabdee9c728f653f8f13de6de8`:

| Item | Resultado |
| --- | --- |
| health / SHA | PASS: `commit=005676a…` (a `main` está publicada) |
| environment | **FAIL**: ausente (não é `ARANDU_ENV=demo`) |
| datasource | **FAIL**: `synthetic-fixtures` |
| readiness | **FAIL**: HTTP 503 `not_ready` |
| entrada por persona | **FAIL**: `auth/demo-personas` 404 |
| `/demo` sem sandbox | **FAIL**: sandbox servido |

Veredito: **NOT_READY**. Na Demo local o mesmo script dá PASS em identidade, datasource, entrada e casca; readiness 503
(banco local fora da topologia hospedada, esperado) e SHA NOT_RUN — também NOT_READY, de propósito.

## Handoffs ao Codex

| ID | Sev. | Capacidade / rota | Contrato atual | Esperado | Evidência | Reprodução | Resolvido quando |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-9 | **P0** | Demo hospedada (`arandu-demo`) | build do sandbox, `datasource=synthetic-fixtures`, sem personas, readiness 503 | build canônico (`ARANDU_ENV=demo`, sem `ARANDU_DEPLOYMENT_KIND=demo`), Supabase DEMO atribuído em `lib/deployment-topology.mjs`, `ARANDU_DEMO_PASSWORD`, seed + pool de workspaces | tabela acima | `node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=<main>` | o script dá **READY** e `ARANDU_DEMO_APP_URL=… ARANDU_DEMO_ENTRY_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-journeys.spec.js` passa contra a URL pública |
| H-10 | P1 | `/demo`, `/demo/` | rewrite para `/demo/index.html` (sandbox; no build canônico vira 404) | depois do cutover: redirect para `/login.html#demonstracao` | `vercel.json` linhas 36–42 | `curl -I https://<demo>/demo` | 30x para a entrada; até lá o 404 já oferece a entrada (E4) |
| H-11 | P2 | `GET /api/auth/demo-personas` | `{key, name, title}` | (opcional) `side: 'buyer'|'provider'` e nome da organização | a interface mantém um guia por chave (`financial-demo-entry.js`), vigiado por teste contra `lib/finance/demo-personas.mjs` | `demo-persona-entry.spec.js` | campos presentes; a interface passa a preferi-los |
| H-13 | P3 | `GET tasks` | ordena por `due_on` | desempate estável (ex.: `due_on, created_at, title`) | tarefas com o mesmo prazo mudam de ordem entre baseline e workspace (e entre recargas, se o plano mudar) | `parity-report.json` (Tarefas) | mesma ordem nos dois lados |
| H-12 | P1 | pool de workspaces | reabastecimento manual (`provision`) | reabastecimento automático (item `OPS-CONCURRENCY`) | entrada diz "demonstração cheia" com pool vazio | esgotar o pool e entrar | a entrada não fica cheia com uso normal |

## Riscos e limites

- Nada aqui publica a Demo: a PR prepara a entrada; a ativação é o cutover (H-9/H-10).
- O guia de personas é texto da interface por chave; um teste quebra se o seed ganhar/perder persona ou trocar de lado.
- A seção de personas carrega logo após a página (uma chamada); por um instante o formulário de e-mail desce. Registrado como
  P3 (não muda o resultado de nenhum clique de pessoa; a automação local espera a seção aparecer).
- Firefox/WebKit/iPhone não executados localmente.

## Rollback

Reverter a PR: a entrada volta à lista plana do login; o selo volta sem "Trocar persona"; o 404 volta ao texto padrão.
Nenhum contrato de API, dado ou migration.
