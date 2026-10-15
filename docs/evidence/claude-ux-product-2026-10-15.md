# Evidência — lote de produto e UX (Claude), 15/10/2026 — segunda rodada

Base: `main` @ `f66136edcb01b8065661baebd3309fd722ceb113` (#197 integrada), reconfirmada
com `git fetch origin main` no início. Branch: `claude/wonderful-shannon-is91mw` — a branch
gerenciada pela sessão, isolada, limpa e criada exatamente nesse SHA; foi usada no lugar de
`claude/product-ux-20261015`, como a missão permite. Worktree: o checkout da própria sessão
(`/home/user/Arandu`), container exclusivo — nenhuma worktree de outro agente existe aqui.

Ambiente: Demo canônica **local** (`npm run demo:setup`: Supabase real em Docker — Postgres,
GoTrue, PostgREST, Storage — e o app desta branch em `ARANDU_ENV=demo`, semeado com a Vitta
Foods por `scripts/demo/seed.mjs`; 37/37 checagens de sanidade). Nenhum Supabase hospedado,
segredo, deploy, migration, API, workflow, `lib/api/**`, `package.json` ou matriz foi tocado.
Estados: **PASS**, **FAIL**, **NOT RUN**.

Maturidade: nada aqui passa de M1 + validação local (LOCAL_VALIDATED). CI no HEAD da PR é o
próximo passo (M2). A Demo hospedada continua condicionada ao cutover (guideline §36.4).

## Método

1. `npm run demo:setup`; `npm run design:capture -- --label=before` (46 capturas, desktop
   1440 px e celular 390 px, overflow 0) com o build da base.
2. Leitura das capturas (Painel, Tarefas, Contratos, portal do provedor) e do código das views
   de contrato, tarefa, decisão e aprovação.
3. Varredura renderizada própria (Chromium, 390 px) do portal do provedor (Eduardo Lima, Atlas
   Bank: as três propostas) e das telas do aprovador (Carlos Tavares: Aprovações, Painel,
   Tarefas, Contratos) procurando nome de concorrente, UUID, ISO, `null`/`undefined`/`NaN` e
   overflow horizontal: **nenhuma ocorrência**.
4. Para cada defeito: teste de regressão → falha no código da base → correção → teste passa.

Contextos validados: comprador (Juliana), aprovador (Carlos), provedor (Eduardo) e
administradora (Helena, pelas capturas de configurações/Passport/qualificação). Jornadas
verificadas: 5 da Demo canônica × 2 viewports + as 4 novas regressões × 2 viewports.

## Defeitos comprovados e correções

| ID | Sev. | Jornada / quem | Problema observado | Correção | Regressão |
| --- | --- | --- | --- | --- | --- |
| UX-E1 | P2 | Contrato → histórico de versões — comprador | O diff entre versões mostrava o número e o código crus: "Valor principal contratado: alterado — 5000000 → 5100000", indexador "pre → cdi", ausência como "—" (Constitution §1.5, §9). O próprio E2E anterior afirmava o texto cru. | O histórico usa a mesma formatação dos termos vigentes (moeda, percentual, indexador por extenso), ausência vira "não informado", tarifas "1 tarifa → 2 tarifas". `enumLabel` passa a conhecer TJLP, SOFR, USD e "outro" (antes caíam no código). | `histórico de versões: indexador e percentuais por extenso…` e o teste existente reescrito para `R$ 5.000.000 → R$ 5.100.000` |
| UX-E2 | P2 | Decisão e pedido de aprovação — comprador | Com várias propostas, o formulário vinha com **a primeira da lista marcada**: um clique em "Registrar decisão" registrava a escolha sem a pessoa escolher, e a ordem da lista virava recomendação implícita (Constitution §1.2; guideline §3.3, §36.2). O pedido de aprovação também consultava a policy para a primeira proposta antes de qualquer escolha. | Nenhuma proposta vem marcada quando há mais de uma (com uma só, segue marcada; com aprovação ou conflito, a proposta aprovada/em conflito continua marcada). Enviar sem escolher mostra "Escolha a proposta da decisão." / "…que vai para aprovação." e foca o grupo; nada vai ao servidor. A prévia da policy só roda depois da escolha. | `decisão e pedido de aprovação: com mais de uma proposta nada vem marcado…` |
| UX-E3 | P2 | Registrar contrato existente (primeiro valor, §35.10) — comprador | O formulário longo vive num painel que fechava com clique fora, Esc ou Cancelar **descartando tudo** o que foi digitado, sem aviso. | `drawer({ confirmClose })` em `ui.js`: com dados preenchidos, X, Esc, clique fora e Cancelar pedem "Descartar o registro do contrato?"; sem dados, fecha direto. Nada é guardado no navegador (sem dado financeiro em storage). | `registrar contrato existente: clique fora, Esc ou Cancelar…` |
| UX-E4 | P3 | Tarefas, Painel — comprador | Na Demo, 14 de 19 tarefas mostravam só "· Ver contrato" (separador órfão, sem dizer qual contrato) e o Painel listava "Obrigação: Dívida líquida / EBITDA — vencida há 12 dias" sem instituição. Concluir a tarefa de renovação não deixava claro que o vencimento real continua. | A tarefa de contrato mostra "Atlas Bank · Crédito empresarial" (ou o título do contrato) e "Contrato vence em 08 de jan de 2027 · aviso prévio até 09 de nov de 2026", também nas concluídas; no Painel, o item diz "Atlas Bank · Crédito · Vencida há 12 dias". | `responsável do contrato e tarefa de contrato com contexto…` |
| UX-E5 | P3 | Contratos — comprador, aprovador | O cartão do contrato não dizia quem responde por ele ("responsável definido" é parte da continuidade de renovação). O dado já vem da API (`owner_id`). | Linha "Responsável" no cartão (nome do membro; "Não informado" se vazio). Na Demo: Juliana Ramos. | idem |

Os cinco testes novos/reescritos **falham** no código da base (verificado com `git stash` de
`finance/` e rebuild: 5 failed) e passam depois da correção.

## Antes / depois (Demo canônica local, Chromium)

Capturas em `docs/evidence/claude-ux-product-2026-10-15/` (dados fictícios da Vitta Foods). As 46
capturas completas `before`/`after` de `design:capture` ficam em `reports/design/` (não versionado).

| Tela | Antes | Depois |
| --- | --- | --- |
| Tarefas 1440 px | `tasks-before.webp` | `tasks-after.webp` |
| Tarefas 390 px | `tasks-mobile-before.webp` | `tasks-mobile-after.webp` |
| Contratos 1440 px | `contracts-before.webp` | `contracts-after.webp` |
| Contratos 390 px | `contracts-mobile-before.webp` | `contracts-mobile-after.webp` |
| Painel 1440 px | `dashboard-before.webp` | `dashboard-after.webp` |

Checklist Constitution §15: hierarquia (contexto do contrato em linha secundária, sem novo
destaque), alinhamento (sem mudança de grid), contraste (texto auxiliar em `--text-muted`, AA
medido por `check:design`), densidade (uma linha a mais só em tarefas de contrato), overflow (0
nas 46 capturas `after`, 1440 e 390 px), estados (vazio/erro inalterados; erro de escolha com
`role=alert`), teclado (foco vai ao grupo de propostas; Esc no painel abre a confirmação, que
devolve o foco), celular (tarefas e cartão de contrato sem truncar o contexto).

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run check:all` | PASS |
| `npm run build` | PASS |
| `npm run check:design` | PASS |
| `npm run check:demo-parity` (matriz não precisou de regeneração) | PASS |
| `npm run test:e2e:list` | PASS (795 casos listados em 20 arquivos) |
| `test:e2e` (as 21 specs do script) — Chromium desktop + Pixel 7 | PASS: 321 passed, 7 skipped por desenho |
| Regressões novas contra o código da base | 5/5 FAIL, como esperado |
| `test:e2e:demo` contra a Demo local | PASS: 5 + 1 skip (desktop) e 5 + 1 skip (celular); o skip é o pool de visitantes, por desenho |
| `test:e2e:presentation` (build `ARANDU_PRESENTATION_MODE=true`) — Chromium desktop + Pixel 7 | PASS: 125 passed, 19 skipped |
| `design:capture` before/after | 46 + 46 capturas, overflow 0, sem tela de erro |
| `git diff --check` | PASS |
| Firefox, WebKit, iPhone 15 | **NOT RUN** — só o Chromium 1194 está no container; o `@playwright/test` 1.64 espera outro build e o projeto proíbe `playwright install`. Os testes rodaram com `executablePath` apontando para o Chromium instalado (config local fora do repositório). Rodam no CI (`validate`/`presentation`). |
| `npm run test:database` | **NOT RUN** — sem SQL nesta PR |

## Limitações ambientais

- Node 22.22 no container (o projeto declara 24.x); todas as verificações acima passaram nele.
- O Docker Hub respondeu 429 para as imagens `supabase/gotrue` e `supabase/storage-api`; as
  mesmas imagens oficiais vieram do ECR público (`public.ecr.aws/supabase/*`), que é o padrão do
  `docker-compose.yml`. Nenhum arquivo do ambiente local foi alterado.
- O seed pela API real esperou 18 × 30 s pelo limite legítimo de requisições (já documentado em
  `docs/demo/README.md`); terminou com 37/37 checagens.

## Dependências registradas para o backend (Work — não implementadas aqui)

| Origem | Entrada | Esperado | Atual | Impacto | Sev. |
| --- | --- | --- | --- | --- | --- |
| `docs/supabase-financial-implementation.sql:126` (criação do plano de implantação) | plano com etapas `establishments`, `go_live`, `settlement_validation`… | título da tarefa com o rótulo em português da etapa (ex.: "Implantação: entrada em produção") | `'Implantação: '||replace(v_kind,'_',' ')` grava a chave interna: na Demo aparecem seis tarefas "Implantação: go live", "settlement validation", "pricing activation"… (Constitution §1.5: enum na tela é bug) | Tarefas e Painel mostram inglês técnico; a interface não reescreve título gravado para não mascarar o dado. Correção é migration aditiva + backfill dos títulos abertos. | P2 |
| `fin_tasks`, `GET /api/finance/tasks` e `overview.tasks` | tarefa de renovação/obrigação de um contrato com responsável | responsável da tarefa (`assignee_id` + nome) — por padrão o responsável do contrato/marco | a tabela não tem responsável; a leitura devolve `id,title,due_on,status,related_type,related_id`. A interface já lê `assignee_id`/`assignee_name` (filtro "só as minhas" do Painel e nome na lista), mas o dado nunca chega | Toda pendência aparece para todos; "responsável definido" só existe no contrato (UX-E5), não na tarefa | P3 |
| Da rodada anterior | `overview.contracts[].days_to_end` arredondado; `assignments[].history` sem termos por versão | — | **Resolvidas pela #198 (Work)**, integrada à `main` em `ba8ab206`: `days_to_end` por dias de calendário e `history` com o snapshot de termos de cada versão enviada | A interface desta PR não depende desses campos; nada a ajustar | — |

## Observado e não alterado

- Campos de data mostram `mm/dd/yyyy` nas capturas: é o locale do Chromium headless (en-US) no
  controle nativo, não texto do produto.
- "Inteligência de valor" no Painel ainda mostra "0 abaixo (—)" em Tarifas bancárias; é
  `executive.js` com dado real e metodologia; fica para revisão própria em vez de mudança
  cosmética.
- Subagentes não foram usados: as correções tocam `ui.js`/`style.css` (coordenador) e views
  vizinhas; dividir criaria conflito sem ganho.

## PR e SHA

PR: lucasweber1202/Arandu#199. HEAD `e0b1244`: `database`, `deploy-boundaries`, `validate` e
`presentation` PASS (run 38799102107). A PR do Work (#198) foi integrada primeiro (`main` @
`ba8ab206`); esta branch recebeu a nova `main` por merge (sem conflito nem sobreposição de
arquivos), foi revalidada (`check:all`, `build`, `test:e2e` Chromium desktop + Pixel 7) e segue
para os quatro gates no novo HEAD e `npm run merge:gates -- 199`. SHA final: o HEAD verificado na
PR.
