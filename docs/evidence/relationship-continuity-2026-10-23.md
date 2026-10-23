# Reconciliação pós-261 e continuidade do relacionamento — 23/10/2026

**INTEGRAÇÃO SOMENTE APÓS 29/10/2026**, com liberação humana posterior ao
evento. Branch `codex/post-29-relationship-continuity`, base
`9b57f2a7434fb9ca0bc68e607a36e63334728359`. O HEAD é o commit que contém
este relatório; os checks da PR devem corresponder a ele. Não há merge,
deploy manual ou migração hospedada nesta entrega.

## Release aprovado e reconciliação

Fetch remoto e ancestralidade confirmaram os HEADs #259
`5ae24d8b49f6f8f935a371be96f15c60637e2490`, #260
`100a8a4eafc20c19d2091a3e7759ac87fc2d56a1` e #261
`41e02f7620fdf869920f71f2e4e8120401694dd3` dentro de `main@9b57f2a`.
Não havia PR aberta na consulta inicial. Worktrees anteriores foram preservadas;
a evolução usa outra worktree, sem push em main.

O merge antecipado de #261 não motivou revert. Sua árvore e a do merge são
idênticas (`1d7ea7586b72995f13bda5069f4fd25b1916c30b`): não houve resolução de
conflito alterando API, rota, build ou artefatos. #261 altera o recorte de
relacionamento; não muda configuração de publicação, dependências ou seed.
Os quatro checks `database`, `deploy-boundaries`, `presentation`, `validate`
passaram tanto no HEAD #261 quanto na main atual. Main também tem
[merge-audit SUCCESS](https://github.com/lucasweber1202/Arandu/actions/runs/39895125530)
e [CI SUCCESS](https://github.com/lucasweber1202/Arandu/actions/runs/39895125558).
[Reconciliação dos checks/status](continuity-2026-10-23/main-reconciliation.json).
A nova prova pública abaixo e a CI de apresentação sustentam manter a main;
não foi reproduzida regressão P0 que justifique outra PR de estabilização.

| Estado | Evidência / SHA / ambiente | Limite e impacto em 29/10 | Próxima ação |
| --- | --- | --- | --- |
| PUBLIC_SHAREABLE PASS | Origem pública, `9b57f2a`, 23/10 03:37 UTC | Visita M2 sintética; não autentica nem grava no backend canônico | Compartilhar a visita aprovada; renovar prova se trocar SHA |
| LOCAL_STATION_READY NOT_VERIFIED | Estação física indisponível; cloud `station --fast` BLOCKED | SQL descartável e browser com fixtures não comprovam WSL2 | Operador executar o cartão nas datas abaixo |
| CANONICAL_HOSTED_M3 BLOCKED | `hosted-parity` NOT_READY no domínio/SHA atual | Sem evidência de Auth, ambiente e personas canônicos; M2 não satisfaz esse contrato | Recovery/cutover apenas com autorização específica |
| PRODUCTION_M5 BLOCKED | Status GitHub failure; API Vercel 403 | Causa do build não acessível; não atribuir ao SQL ou a variáveis sem logs | Recuperar autorização no escopo correto |
| Incremento pós-29 | Branch isolada e testes desta entrega | Nova migration e contrato API exigem rollout conjunto após o evento | Revisão humana e quatro gates no HEAD próprio |

## Prova pública nova, independente de M3

Execução na worktree limpa e destacada da main atual:

```bash
node scripts/public-tour-proof-flow.mjs 9b57f2a7434fb9ca0bc68e607a36e63334728359 /tmp/arandu-9b57-public-flow.json
NODE_USE_ENV_PROXY=1 node scripts/smoke-public-demo.mjs --url=https://arandu-demo.vercel.app/ --sha=9b57f2a7434fb9ca0bc68e607a36e63334728359 --browser --flow=/tmp/arandu-9b57-public-flow.json
NODE_USE_ENV_PROXY=1 node scripts/demo/hosted-parity.mjs --url=https://arandu-demo.vercel.app --sha=9b57f2a7434fb9ca0bc68e607a36e63334728359
```

Primeiro contrato: **229 verificações, 185 artefatos com hash, 36 capturas**;
HTTP e navegador desktop/mobile PASS. Chromium 156.0.8078.4, Playwright 1.64.1
do lockfile. Transporte `actual-origin-response-relay`: bytes da origem pública,
com hashes verificados, sem fixtures substituindo respostas. Inclui entrada,
visita, comprador, instituição, assets, deep links, recarga e Tab/Enter. Identidade
do commit e rótulo de simulação verificados. [Prova completa](continuity-2026-10-23/public-proof.json),
[exemplo desktop](continuity-2026-10-23/desktop-dashboard.png),
[exemplo mobile](continuity-2026-10-23/mobile-contracts.png).
Os demais artefatos permanecem no diretório local `reports/public-demo` da
worktree `Arandu-release-9b57`; seus hashes estão no JSON.

Segundo contrato: saída 1, **NOT_READY**, [relatório](continuity-2026-10-23/hosted-parity.json).
Backend `synthetic-fixtures`, ambiente canônico não demonstrado, readiness,
autenticação e personas não aprovadas. É resultado esperado para uma visita M2;
não foi trocado o checker nem reclassificado como M3.

## Vercel: fatos e acesso

No SHA `9b57f2a`, status GitHub Demo SUCCESS (deployment
`5kRWMEwfhMtw2FFspp71zGHwrr4p`), Pilot SUCCESS
(`9eH5ufcw4bLVo98iTYCW875FvKAi`) e Production FAILURE
(`EhoSFXrR9RWpJXA1uMDBKtktqaQs`). Leitura direta do deployment Production
continua **403 / ACCESS_BLOCKED**, projeto `arandu`, scope
`lucas-projects467`, team `team_BBpDcLVx5izJjXz5qBEq2cRy`.
Ação mínima do proprietário: reautorizar a conexão Vercel para acesso a essa
mesma equipe/projeto e então consultar deployment/logs. Não foram tentados
outros tokens, scopes, contas ou bypass de SSO. Não há causa remota confirmada.

O sucesso de Demo foi confirmado também por domínio, identidade e artefatos.
O código mantém publicação automática somente de main e branches de trabalho
sem deploy. Build command/configuração efetiva do dashboard não foram lidos
por causa da restrição de acesso; a configuração versionada foi validada.
Nenhum assignment, segredo, ambiente, tier, cobrança ou configuração hospedada
foi alterado. Não houve inventário novo de dados reais Supabase.

## Problemas reproduzidos e comportamento novo

1. O endpoint #261 buscava tarefas apenas dos primeiros 200 contratos. Uma
   pendência do contrato 201 desaparecia mesmo sem sentinela de tarefas cheia.
   O teste API falhou antes; a fixture SQL demonstra que esse contrato está fora
   da página inicial e que sua tarefa é autorizada. Agora uma view derivada faz
   o join sob a RLS das duas fontes, sem depender da página de contratos.
2. Contratos e tarefas tinham recortes finitos sem continuação. Agora têm
   ordenação estável, sentinela de uma linha e cursor por organização,
   instituição e seção. Primeira página até 200, seguintes 50, máximo aceito
   200; não há busca de milhares no navegador em uma só requisição.
3. Abrir uma tarefa fora das primeiras 50 linhas só destacava uma linha que
   não estava na tela. Reproduzido nos dois viewports. O link agora consulta
   `tasks?task_id=…` com organização e JWT do leitor, em filtro próprio “Tarefa
   deste link”. Não mistura a tarefa concluída/cancelada com a fila aberta;
   inacessível e inexistente recebem o mesmo estado vazio neutro. Canceladas
   são somente leitura, sem caixa que as reabra acidentalmente.

A UI preserva linhas ao falhar uma página, permite retry, deduplica IDs e
rejeita resposta parcial/cursor parado. Atualização completa descarta páginas
atrasadas, inclusive depois de concluir uma tarefa. Paginação não substitui o
corpo inteiro nem perde formulários abertos. Teclado e foco têm cobertura;
responsável aparece mesmo sem prazo. Não infere owner como assignee.

Indicadores e mapa permanecem explicitamente do **recorte inicial**. Contatos,
issues, avaliações, facilities, convites e propostas continuam limitados; o
workspace não promete histórico completo. A paginação não é um snapshot entre
requisições: alterações concorrentes de prazo/status exigem atualização completa
para rever o recorte; deduplicação não promete snapshot transacional. Nenhum
Financial Graph foi copiado.
Há valor buyer-first com contrato importado e instituição cadastrada pelo
comprador, sem adesão de banco ou decisão financeira automática.

## Segurança, migration e rollback

`fin_provider_contract_tasks` é view `security_invoker=true` e
`security_barrier=true` (PG15+), sem materialização: tarefas e contratos continuam
fontes de verdade. Join inclui organização e instituição; somente BUYER.
Somente authenticated tem SELECT; anon e service_role sem grant da view, sem
escrita direta. API mantém membership, instituição visível e JWT do usuário em
cada página. Cursor não confere acesso; a RLS é reavaliada em cada leitura.
Governança registra projeção derivada, dado pessoal/confidencial, sem export
extra ou retenção própria de cópias.

Migration aditiva ao fim dos dois fluxos do manifest: view, dois índices,
marker `financial-relationship-continuity-1` e reload PostgREST. Doctor, backup,
bundle pendente e probes reconhecem o novo marker sem ignorar os anteriores.
Não altera tarefas, responsáveis, contratos, valores ou políticas existentes.
A skill Supabase orientou consultar documentação e criar a migration por CLI;
CLI oficial 2.79.0 temporária, arquivo baixado com SHA256 obrigatório, sem nova
dependência no app nem execução do instalador npm.

**Risco de rollout:** índices transacionais podem bloquear escrita enquanto
constroem; volume/tempo não medidos em hosted. Exige janela e aprovação depois
29/10. Aplicar migration antes do app que consulta a view; não liberar app sobre
schema antigo (erro explícito, não lista vazia). Reverter primeiro o app e então
[rollback aditivo](../rollback/supabase-financial-relationship-continuity.rollback.sql),
que remove view/índices sem CASCADE ou remoção de registros e só recua o marker
se ele ainda for o desta migration. Rollback/reaplicação fazem parte da suíte. O harness remove a projeção nova
antes de ensaiar o rollback histórico que remove `assignee_id`; não usa CASCADE.

Covenant owner → task assignee continua deliberadamente adiado. Sync exigiria
origem, precedência manual, revogação, replay e proveniência demonstrados;
esta entrega testa que owner não é herdado, sem inventar esse contrato.

## Validação e limites de evidência

Validação local geral: `npm ci --include=optional`, `check:all`, build normal,
budget e links PASS. Suíte financeira: **550 PASS, 10 SKIPPED** em Chromium
desktop/mobile. Focada de contratos/relacionamento: **126 PASS**. Apresentação em seu build
próprio, executado sequencialmente: **136 PASS, 20 SKIPPED**. Os SKIPPED
seguem as condições existentes dos testes; não são PASS.

Resultados finais e hashes estão no [manifesto de validação](continuity-2026-10-23/validation.json).
Fixtures de UI são dados fictícios e respostas interceptadas, sem Auth/Storage
reais: [antes desktop](continuity-2026-10-23/continuity-before-chromium-desktop.png),
[depois desktop](continuity-2026-10-23/continuity-after-chromium-desktop.png),
[antes mobile](continuity-2026-10-23/continuity-before-mobile-chrome.png),
[depois mobile](continuity-2026-10-23/continuity-after-mobile-chrome.png),
[link antes](continuity-2026-10-23/task-link-before-mobile-chrome.png),
[link depois](continuity-2026-10-23/task-link-after-mobile-chrome.png).
Não são capturas de backend canônico nem da estação física.

PostgreSQL real 16.15, imagem oficial fixada por digest, container próprio
sem rede, sem portas e com dados em tmpfs. Transportes psql/pg_dump/pg_restore
executam os clientes nativos dentro dele; não são mocks SQL. Suíte completa PASS, incluindo
instalação limpa, upgrade, reexecução, concorrência, dump/restore e probes.
Novo teste cobre 203 contratos, tarefa do 201, leitor, entidade restrita,
outro tenant, provider, membro removido, concluída, contrato terminado,
assignee ausente e grants da view. Isso não prova GoTrue, PostgREST ou Storage.
Firefox/WebKit locais NOT_RUN; os cinco projetos ficam a cargo da CI existente.

## Operação física: comandos nas datas do cartão aprovado

Executar no WSL2 da máquina definitiva, clone no disco Linux, Node 24 do WSL,
Docker Desktop com integração ligada e cliente PostgreSQL instalado.
Não executar estes passos no executor cloud nem na branch P1.
[Cartão completo e recuperação](../demo/OPERATOR_29-10.md).

**26/10** — confirmar novamente os quatro checks no SHA escolhido; abaixo é a
main comprovada nesta rodada, não autorização para seguir outro SHA sem checks:

```bash
git fetch origin --prune
git status --short
# Só continuar com árvore limpa e checks confirmados no SHA exato.
git checkout 9b57f2a7434fb9ca0bc68e607a36e63334728359
npm ci --include=optional
npx playwright install chromium
npm run check:all && npm run build
bash scripts/demo/local.sh prepare-station --provision
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
npm run demo:local:workspaces -- provision --count=1
# Aguardar o provisionamento terminar e conferir o ensaio antes do freeze.
bash scripts/demo/local.sh freeze --station
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

**28/10** — completar somente o pool que faltar, ensaiar uma vez, repor o
consumido e aguardar antes da prontidão:

```bash
bash scripts/demo/local.sh resume
npm run demo:local:workspaces -- list
# Se faltarem N para 4 prontos, e somente com N > 0:
# npm run demo:local:workspaces -- provision --count=N
ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
npm run demo:local:workspaces -- provision --count=1
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

**29/10, T−60:** retomar somente se necessário, exigir READY e leitura PRONTO;
interativo precisa passar seu próprio contrato (pool ≥2, quota e baseline):

```bash
bash scripts/demo/local.sh resume
bash scripts/demo/local.sh readiness --smoke
bash scripts/demo/local.sh station
```

**T−30:** uma janela anônima em
`https://localhost:4443/login.html#demonstracao`; aceitar certificado, ainda sem
entrar. Encerrar testes, readiness/station e provisionamento até a reunião.
Sem reset, sem nova janela por tentativa e sem troca de persona para contornar
429. Seed 38/39, falta de espaço, Auth/PostgREST indisponível ou station sem
READY não liberam a operação. Recuperação já está no cartão: retomada preserva
estado; app isolado pode ser retomado; não apagar volumes nem trocar driver.
Cloud `station --fast` saiu 20/BLOCKED, [relatório](continuity-2026-10-23/cloud-station.json),
sem freeze. O operador ainda precisa comprovar WSL2/navegador Windows.

Plano C em outra cópia do mesmo SHA aprovado: `npm run build:demo` e
`PORT=4174 npm run serve:test`, abrir `/demo/visita.html`; sem Auth/persistência
real. Não substituir o dist da estação congelada nem prometer `file://`.
Contingência C comprovada nesta rodada no SHA `9b57f2a`, cópia separada e
porta 4174: build:demo PASS, **11 PASS e 1 SKIPPED** no public-tour desktop/mobile.
Sem API e sem serviços canônicos. Isso não comprova o navegador Windows.
Se nem o servidor estático funcionar, mostrar capturas identificadas como tais.

## Próximas liberações

1. Proprietário comprovar estação física em 26/10 e preservar o freeze.
2. Rever acesso Vercel na equipe exata; recuperar logs antes de formular causa.
3. Depois do evento, revisão humana do incremento, quatro gates do HEAD,
   janela de migration e autorização para rollout. Nenhum merge antes disso.
4. M3 permanece trilha própria de recovery/cutover; M5 exige backend,
   autenticação, readiness e evidências hospedadas, além de build verde.
