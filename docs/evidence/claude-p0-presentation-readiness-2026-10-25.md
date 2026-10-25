# P0 29/10 — prontidão da apresentação (Claude, 25/10/2026)

**Executor:** container cloud efêmero (`CLAUDE_CODE_REMOTE`), Linux x64. **Não é a máquina do apresentador.** Este relatório não declara `LOCAL_STATION_READY`; o máximo possível aqui é **PREPARED**, e foi o que se obteve.

## A. Estado operacional (executor remoto)

| Componente | Estado | Evidência |
| --- | --- | --- |
| Máquina Windows/WSL2 | **Não verificada** — executor é cloud Linux | `station.mjs`: "executor efêmero: nunca é a estação" |
| Docker | Engine 29.9.2, Compose 5.6.1 (daemon do container, não Docker Desktop) | station: PASS |
| Node | 24.22.1 instalado no executor (o padrão era 22: o gate bloqueou corretamente) | station: PASS após instalação |
| PostgreSQL | healthy | readiness/station: PASS |
| Auth (GoTrue) | HTTP 200 | PASS |
| PostgREST | HTTP 200 | PASS |
| Storage | HTTP 200 | PASS |
| App HTTPS | `https://localhost:4443`, `ARANDU_ENV=demo`, datasource supabase, SHA servido = checkout | PASS |
| Seed | 39/39 checagens | PASS |
| Pool | 4 prontos após ensaio + reposição (627 s por workspace) | PASS |
| SHA | `db4901ce15bf83d077d6f9f689a7a1186ccc4f62` (= `origin/main` em 25/10), árvore limpa | PASS |
| Station | **PREPARED** (saída 10): sem freeze, estação não declarada, máquina efêmera | esperado |
| Modo leitura | PRONTO | readiness --smoke |
| Modo interativo | PRONTO (CFO pendente, Meridian sem proposta, 0 tarefas de ensaio, pool ≥ 2) | readiness --smoke |
| Contingência (Plano C) | Validada em worktree isolada (`build:demo`, porta 4174) | 30/30 assets 200, e2e da visita 12/12 |

Não houve reset do cenário-base: o container anterior já tinha sido descartado pelo executor (sem volumes), por isso a stack foi recriada com `demo:down && demo:setup`. Isso **não** deve ser repetido na estação do owner.

## B. Experiência — jornada auditada (só leitura)

Personas: Juliana Ramos (Vitta Foods), Eduardo Lima (Atlas Bank); Helena e demais via readiness. Desktop 1440×900 e mobile 390×844, **uma** sessão por persona.

| Ato | Etapa | Rota | Resultado (desktop e mobile) |
| --- | --- | --- | --- |
| 1 | Painel "Precisa de você" | `/finance/dashboard.html` | ok |
| 1 | Instituições / renovação Atlas | `/finance/providers.html` | ok |
| 2 | Nova linha R$ 12 mi + propostas (Atlas, Orbe) | `/finance/rfq.html?id=…` | ok |
| 3 | Comparação de adquirência ("O Arandu não recomenda instituições") | aba Comparação | ok |
| 3 | Decisão Lumina v2 | aba Decisão | ok |
| 4 | Contratos (Lumina, Atlas, origem) | `/finance/contracts.html` | ok |
| 4 | Painel "Trabalho deste contrato" (origem, relacionamento, implantação) | idem | ok; Esc fecha; sem overflow no mobile (#267 preservada) |
| 4 | Ver processo e decisão de origem | `/finance/rfq.html?id=…` | ok |
| 4 | Implantação da Lumina | `/finance/implementations.html?contract_id=…` | ok |
| 4 | Covenants do Atlas | `/finance/covenants.html?contract_id=…` | ok |
| 4 | Janela de renovação | `/finance/contracts.html` | ok |
| 4 | Tarefas | `/finance/tasks.html` | ok (grupos Vencidas / Próximos 7 dias) |
| 5 | Portal Atlas / Oportunidades | `/provider/index.html`, `/provider/rfqs.html` | ok; nenhuma menção a Orbe, Meridian, Nexo ou Lumina |
| 5 | Retorno ao Painel | `/finance/dashboard.html` | ok |

Sem respostas 4xx/5xx da API, sem 429 e sem rolagem horizontal em nenhuma etapa. Ensaio D-1 com gravação (`demo-entry-lifecycle.spec.js`, workspace descartável): **1/1 em 41 s**; workspace consumido reposto.

**Defeitos de produto encontrados:** nenhum. A correção da #267 (painel de contrato no celular, capturas da visita) está presente no RC. Nenhum arquivo de interface mudou entre o commit das capturas (`7de5d47`) e o RC.

**Ajustes de roteiro (sem código):**
1. Ato 5: o histórico v1 → v2 do Atlas fica em **Ver** na oportunidade, não na lista.
2. Pergunta provável: o menu mostra "Tarefas 18" e a tela "19 tarefas". É intencional (`finance/app.js:300`): o menu conta as atribuídas a quem está logado ou sem responsável; a tela lista todas as da equipe, inclusive a do Rafael.

## C. Roteiro executivo

`docs/demo/ROTEIRO_COMERCIAL_5_ATOS_29-10.md` (5 atos, 12–15 min, só leitura, perguntas, limites e plano C por ato), com os dois ajustes acima.

## D. Riscos

| Risco | Impede a apresentação? | Mitigação |
| --- | --- | --- |
| Estação física não preparada/congelada até D-1 | **Sim** para o Plano B | Handoff abaixo; senão Plano C |
| Docker Desktop/WSL2, portas ou certificado no Windows | Sim para o Plano B; não testável daqui | Validar no navegador do Windows (passo 6 do handoff) |
| Limites do registro de imagens (429 Docker Hub / ECR) | Só na preparação | Espelho `mirror.gcr.io` (cartão do operador, C2); baixar até D-3 |
| 429 de entrada/API por ensaios repetidos | Sim, se ignorado | Nada de ensaio nos 10 min antes; uma janela; "Trocar persona" |
| Primeiro boot do gateway reporta porta 5000 ocupada logo após o Docker subir | Não (transitório; passou na repetição) | Repita `station` depois de 1 min se a porta 5000 aparecer BLOCKED |
| Hospedado M3 | Não (Plano A segue indisponível) | Não apresentar como hospedado |

Melhorias futuras (pós-29/10): nenhum P0 em aberto vindo desta auditoria.

## E. Handoff para a máquina do apresentador (P0-B)

No Ubuntu do WSL2, com Docker Desktop rodando e repositório **fora** de `/mnt/c`:

```bash
git fetch origin && git status --short          # vazio
git checkout db4901ce15bf83d077d6f9f689a7a1186ccc4f62
node -v                                         # v24.x (senão: instale Node 24 no WSL)
npm ci --include=optional && npx playwright install chromium
npm run check:all && npm run build
bash scripts/demo/local.sh prepare-station --provision     # ≈ 20 min + ≈ 22 min de pool
# esperado: Modo leitura PRONTO, Modo interativo PRONTO, Estação PREPARED (sem freeze)
set -a; . scripts/pilot-local/.state/demo.env; set +a
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
npm run demo:local:workspaces -- provision --count=1      # repõe o consumido (≈ 11 min)
bash scripts/demo/local.sh freeze --station
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station                        # esperado: READY (saída 0)
```

6. No navegador do **Windows**: `https://localhost:4443/login.html#demonstracao` → aceitar o certificado → tela "Conheça o Arandu por dentro" com as personas, CSS carregado. **Não entrar** (consome cota).

Interpretação: READY → Plano B. PREPARED → siga a linha "→" de cada item. BLOCKED → corrija o item (Node 24, porta, Docker). UNSAFE → pare, terminal novo, sem reset nem seed.

Evidência a devolver (sanitizada, sem senha, token ou cookie): `reports/demo-station/station.md`, `reports/demo-readiness/readiness.md`, saída de `git rev-parse HEAD` e captura da tela de personas no navegador do Windows.

Plano C offline no mesmo computador, em **cópia separada** (não no diretório congelado): `git worktree add ../arandu-planc db4901ce && cd ../arandu-planc && npm ci --include=optional && npm run build:demo && PORT=4174 npm run serve:test` → `http://127.0.0.1:4174/demo/visita.html`.

## F. Evidências

- SHA: `db4901ce15bf83d077d6f9f689a7a1186ccc4f62`; checks locais: prepare-station, readiness --smoke (2×), station (2×), ensaio lifecycle 1/1, e2e da visita 12/12.
- Capturas desta auditoria (ficaram no executor, efêmero; hashes SHA-256, 12 primeiros dígitos): painel `f62dfaeecea3`, comparação `dff4ba3f2168`, painel do contrato desktop `832557f6c6c4` e mobile `d303912d07c8`, oportunidades Atlas `941e1a2b56ff`.
- Nenhuma alteração de código, `package.json`, migrations, Auth, RLS, CI ou Vercel.
