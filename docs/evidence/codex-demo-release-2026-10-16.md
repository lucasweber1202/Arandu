# Codex — readiness da Demo e ensaio de release (16/10/2026)

## Escopo e identidade

- Base reconciliada: `origin/main@168e60d3a5ae12ecf2e9e671e3369a2855336e14`.
- PR #207 e PR #208 são ancestrais da base; a #208 é o merge atual.
- Worktree exclusiva: `codex/demo-release-readiness-20261016`, criada a partir
  do SHA acima. Node local: `v24.19.0` (`.nvmrc` = `24`).
- A árvore não altera UI, jornadas E2E ou `scripts/demo/**`. Nenhum banco,
  segredo, binding, migration ou ambiente hospedado foi modificado.

## Diagnóstico M3 em fontes autorizadas

O status combinado do GitHub consultado para o SHA exato da main contém:

| Projeto Vercel | Status no commit | Link de status | O que isso prova |
| --- | --- | --- | --- |
| `arandu-demo` | `success` | [status](https://vercel.com/lucas-projects467/arandu-demo/GXbSgH99yYTcB9usL1tXHu37eLrF) | Apenas um status de deployment associado ao commit; não vincula domínio, ambiente, datasource, schema nem readiness. |
| `arandu-pilot` | `success` | [status](https://vercel.com/lucas-projects467/arandu-pilot/4kVihFmP14qPYwEWKxKC42tBUN66) | Apenas um status do estágio transitório; não o torna ambiente permanente nem prova M3. |
| `arandu` | `failure` | [status](https://vercel.com/lucas-projects467/arandu/BaVK2SeQFDF2CUs8b8SJqgyh1WQu) | Falha associada ao SHA. A causa não foi determinada porque o acesso detalhado Vercel ao escopo `lucas-projects467` já havia retornado HTTP 403. A requisição não foi repetida nem o escopo trocado. |

Estado de deployment e conclusão de build detalhada: **INCONCLUSIVE**. Variáveis,
alias/domínio, datasource efetivo, identidade Supabase e schema instalado:
**ACCESS_BLOCKED / NOT VERIFIED**. Não foi inferido ambiente ou causa de build
a partir do nome do projeto ou do status.

O código versionado mantém `demo: []` e `production: []`; Pilot e legado
continuam slots transitórios/legados planejados. Isso não autoriza ativação,
reset ou conversão. A evidência read-only já registrada antes desta rodada
descreve Pilot em schema antigo, sem os hooks/configuração de revogação, e
legado sem superfície financeira atual. Nesta rodada não houve consulta a
catálogos Supabase, autenticação, usuários ou dados hospedados. Projeto Demo
dedicado, Auth/RLS/Storage da Demo e recuperação hospedada permanecem
**NOT VERIFIED / NOT RUN**.

| Item M3 | Estado | Evidência e limite |
| --- | --- | --- |
| SHA publicado e deployment | `INCONCLUSIVE` | Os contextos GitHub acima são associados ao SHA `168e60d`; detalhes, alias e SHA do bundle não foram acessados. |
| Ambiente declarado e datasource | `ACCESS_BLOCKED` | Configuração Vercel detalhada indisponível (403 anterior); assignments ativos Demo/Production vazios no código. |
| Schema e migrations hospedados | `NOT VERIFIED` | Sem leitura autorizada do projeto Supabase Demo; nenhum comando remoto executado. |
| Auth, RLS, Storage e isolamento hospedados | `NOT VERIFIED` | Status/build não exercitam essas superfícies em uma identidade real da Demo. |
| Recovery hospedado completo | `NOT RUN` | Não houve export, restore ou leitura de dados reais; exige autorização específica, custódia durável e alvo isolado. |
| M3 | **NOT PROVEN** | CI, deployment SUCCESS e HTTP 200 isolados não satisfazem a prova de datasource, schema, segurança e recuperação da Demo canônica. |

PR #207 teve os quatro jobs (`database`, `deploy-boundaries`, `validate`,
`presentation`) SUCCESS no run `38940242447`. PR #208 teve os quatro jobs
SUCCESS no run `38943086346` e foi integrada como `168e60d`. Esses resultados
validam a base antes desta alteração; os quatro jobs da nova branch ainda
precisam executar no HEAD da PR.

## Defeito de release reproduzido e correção

**Antes:** o workflow publicava um resumo após smoke, seed, jornada, sondas e
recovery, mas antes do teardown e do upload do artifact. Reproduzi o resumo
antigo com os outcomes de produto em `success` e sem resultado de cleanup: as
linhas exibiam PASS e não havia uma decisão final capaz de distinguir ensaio
completo de execução ainda aberta ou limpeza falha. O resumo não reportava
Node/setup, instalação/build completos, sanitização/arquivo de evidência nem
teardown como parte do veredito.

**Agora:** `lib/demo-rehearsal-result.mjs` só emite `B_LOCAL_DEMO_VALIDATED`
quando os SHAs completos do checkout e do evento/PR e todos os 21 outcomes exigidos são
`success`: Node/setup, identidade do commit, preflight, bloqueio de Supabase
hospedado, instalação, build, stack, smoke, seed e releitura, Playwright,
Chromium desktop/mobile, jornada, ataques, recovery, coleta/sanitização,
teardown e publicação do artifact. Status vazio, `skipped`, falha ou SHA
inválido resulta em `C_NO_GO`. O relatório separa SHA do checkout e SHA do
evento/PR.

O workflow agora coleta evidência, executa teardown com saída preservada e
arquiva os relatórios antes de emitir a decisão final. Falha em qualquer uma
dessas fases aparece como blocker e impede B. A rotina continua sem secrets,
deploy ou acesso a Supabase hospedado. B declara apenas validação de laboratório
efêmero; `hostedStatus` permanece sempre `NOT_PROVEN`. Nenhum caminho emite A.

O preflight local agora exige Node major 24, `age` e `age-keygen` antes da fase
de provisionamento de imagens. O workflow instala `psql`, `age` e `age-keygen`
se necessário. Isso evita iniciar a stack sem runtime e ferramentas que o
ensaio completo/recovery requer.

## Resultado objetivo dos gates de release existentes

O validador existente `npm run check:evidence` continua como source of truth;
não foi criado outro framework. Estado lido em `ops/release-evidence.json`:
**1/13 no nível mínimo declarado**, sendo `migration_ci` (referência registrada
em 11/08/2026); as outras 12 gates estão `not_started`.

| Gate | Estado registrado | Categoria do bloqueio atual |
| --- | --- | --- |
| `migration_preflight` | `not_started` | `ENVIRONMENT_BLOCKED`: ambiente/alvo e plano revisado não comprovados. |
| `migration_ci` | `ci_validated` | Evidência armazenada, referência `GHA-RUN-31499692700` (11/08); não é prova de migration hospedada nem substitui CI da nova PR. |
| `migration_staging` | `not_started` | `ENVIRONMENT_BLOCKED`: sem atribuição aprovada de datasource Demo/Pilot para validação. |
| `backup_restore` | `not_started` | `OWNER_AUTHORIZATION_REQUIRED`: snapshot/custódia e restore isolado hospedado não autorizados nem executados. |
| `write_canary` | `not_started` | `ENVIRONMENT_BLOCKED`: sem datasource e identidade Demo verificados. |
| `rls_isolation` | `not_started` | `ENVIRONMENT_BLOCKED`: exige identidades sintéticas no datasource hospedado correto. |
| `reservation_concurrency` | `not_started` | `ENVIRONMENT_BLOCKED`: concorrência hospedada não ensaiada. |
| `catalog_real` | `not_started` | `OWNER_DECISION_REQUIRED`: catálogo/escopo externo da Demo não foi aprovado. |
| `commercial_policy` | `not_started` | `OWNER_DECISION_REQUIRED`: política comercial requer definição humana rastreável. |
| `monitoring` | `not_started` | `EXTERNAL_DEPENDENCY`: integração e recebimento canário não comprovados. |
| `privacy_contact` | `not_started` | `OWNER_DECISION_REQUIRED`: contato operacional/de privacidade não fornecido. |
| `domain_https` | `not_started` | `EXTERNAL_DEPENDENCY`: domínio e HTTPS da Demo não verificados. |
| `pilot_closed` | `not_started` | `OWNER_AUTHORIZATION_REQUIRED`: fechar Pilot depende de classificação, preservação e decisão sobre o legado; ausência de usuário não prova ausência de dados. |

Checks estáticos, CI e laboratório não substituem esses gates externos. A
evidência `migration_ci` é antiga; seu estado foi lido sem promovê-la a prova
atual de release.

## Procedimento de ensaio e decisão para 29/10

Runbook executável em [`docs/DEMO_RELEASE_REHEARSAL.md`](../DEMO_RELEASE_REHEARSAL.md).
Ele reutiliza o stack e o harness existentes (`scripts/ci-demo/run.sh`), com
trap de evidência/teardown; restringe as URLs ao local; exige Node 24, Docker,
`psql`, `age`, `age-keygen`, Chromium e recursos; mantém a execução serial. O
CI fixa imagens por digest, usa apenas dados sintéticos e bloqueia projetos
Supabase hospedados conhecidos.

- **A — Demo hospedada validada:** permanece bloqueada por acesso/configuração,
  identidade do datasource e gates externos; nenhum comando de conversão pode
  ser executado agora.
- **B — prova de laboratório:** só é elegível com decisão `B` no mesmo SHA da
  apresentação, ou stack descartável da estação de apresentação ativa, smoke e
  seed verificados nesse SHA e durante a sessão. Artifact CI isolado não mantém
  serviço disponível após destruição do runner.
- **C — NO-GO:** qualquer falha, etapa pulada, recovery incompleto ou teardown
  sem confirmação. Não substituir aplicação, autenticação, Storage ou jornada
  por mock, sandbox legado ou roteiro de telas.

No executor atual, o preflight confirmou 9.318 MB de memória e 24 GB livres,
mas o daemon Docker retornou `permission denied` no socket; `psql`, `age` e
`age-keygen` também não estão instalados. `npm run test:database` encerrou com
127 (`psql: command not found`). A integração completa e o B local são,
portanto, **NOT RUN** nesta máquina. O runbook não foi usado para iniciar uma
stack ou alterar outro ambiente.

## Validação executada nesta branch

`npm ci --include=optional` passou após retry com acesso de rede autorizado;
Node `v24.19.0`.

| Comando | Resultado real |
| --- | --- |
| `npm run build` | PASS |
| `npm run check:backend` | PASS |
| `npm run check:security` | PASS |
| `npm run check:migrations` | PASS |
| `npm run check:platform` | PASS |
| `npm run check:env` | PASS como diagnóstico; apenas 1/9 itens de readiness configurados. |
| `npm run check:evidence` | PASS como validador; 1/13 gates no mínimo requerido, 12 pendentes. |
| `node scripts/test-release-candidate.mjs` | PASS (suite contratual, não recovery hospedado). |
| `node scripts/test-pilot-doctor.mjs` | PASS (12 configurações inseguras recusadas, somente leitura). |
| `node scripts/check-staging-rehearsal.mjs` | PASS (0 problemas estáticos). |
| `node scripts/test-release-evidence.mjs` | PASS |
| `node --check` nos módulos JavaScript alterados; `bash -n scripts/ci-demo/run.sh` | PASS |
| Parse YAML do workflow e assert da ordem final | PASS (`teardown < artifact upload < decisão`, 24 steps). |
| Verificador sintético do assessor | PASS: outcomes + os dois SHAs completos → B local e hosted `NOT_PROVEN`; cleanup failure/skipped, upload failure, recovery skipped e qualquer SHA ausente/inválido → C. |
| Resumo sintético executado pelo shell | PASS: completo → B; teardown failure → C. |
| `git diff --check` | PASS |
| `npm run test:database` | NOT RUN: `psql` ausente. |
| `node scripts/test-ci-demo.mjs` / `npm run check:staging` | PARCIAL / bloqueado: os checks estáticos e puros iniciais passaram; em seguida `spawnSync node EPERM` impede executar os testes negativos que criam subprocessos. O output vazio quebra asserts desses testes; não foi classificado como regressão nem mascarado. |
| `npm run check:all` | PARCIAL / bloqueado no primeiro teste que depende de subprocesso (`spawnSync` resulta em stderr/stdout vazios por `EPERM`). |
| `npm run check:finance` | PARCIAL / bloqueado em teste de variável de ambiente que invoca Node filho (`spawnSync EPERM`). |
| `npm run check:governance` | Parcial: checks de governance anteriores passaram; o preflight JSON final não consegue consumir subprocesso bloqueado e recebe saída vazia. |
| `npm run check:supply-chain` | checker estático PASS; casos de ações inválidas não executam o subprocesso e falham sem stderr devido a `EPERM`. |
| `npm run audit:ci` | NOT RUN por proxy bloqueado (`connect EPERM ...:8080`); sem conclusão de vulnerabilidade nova. |
| B completo em PostgreSQL/Auth/Storage/Playwright descartáveis | NOT RUN: sem acesso ao Docker daemon e sem `psql`/age. |

Os resultados de subprocesso e auditoria não foram convertidos em PASS. Os quatro
gates obrigatórios para esta PR e o `merge:gates` no HEAD final ainda dependem
do GitHub Actions; não há merge nesta entrega.

## Rollback, dependências e ações mínimas do proprietário

Rollback de código: reverter esta PR. O change é restrito a workflow, assessor
de saída, teste de CI e documentação; não inclui migration nem mutação de dados.
Não há efeito reversível em hospedagem porque nenhum recurso hospedado foi
alterado.

Para avançar a Demo M3 sem ampliar o backlog, restam decisões/acessos concretos:

1. Restaurar acesso read-only ao mesmo escopo Vercel `lucas-projects467` e
   identificar deployment, branch/SHA, domínio e nomes/escopos de variáveis.
   Não enviar valores secretos por chat.
2. Designar explicitamente a origem (Pilot ou outro projeto), classificar e
   custodiar o snapshot fora do runner efêmero; aprovar separadamente export,
   restore isolado, migrations e eventual cutover. Confirmar primeiro se há
   dados de clientes ou artefatos que precisam ser preservados.
3. Aprovar/criar o destino Supabase dedicado à Demo e o seu próprio Auth/Storage;
   só depois registrar assignment explícito e executar doctor, canário, RLS,
   isolamento, recovery e jornada sintética no domínio final.
4. Registrar domínio HTTPS, monitoramento/canário e contatos/políticas que são
   decisões da operação. Não misturar a trilha Production antes de M3.

Primeiro comando seguro após disponibilizar credenciais read-only no executor
autorizado (sem ecoar valores):

```bash
ARANDU_ENV=pilot npm run finance:pilot:doctor -- --json
```

É diagnóstico somente leitura do Pilot atual; não aplica migration ou seed e
não certifica Demo. Se a intenção for descartar/converter Pilot, o próximo
passo exige aprovação explícita de origem/destino e custódia antes de qualquer
export/restore.
