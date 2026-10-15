# Stage 0 — segurança, integridade financeira e prontidão operacional (14/10/2026)

Base: `main` @ `fa551c0` (#190). Branch `claude/youthful-goldberg-gf9xoo`.
Nenhum banco, segredo, projeto, atribuição (`ACTIVE_SUPABASE_ASSIGNMENTS`),
Auth/RLS hospedado, branch protection ou gate foi alterado. As migrations novas
**não foram aplicadas** em Pilot (`offgpyysgdhfemjlchod`), legado
(`igacnfjeuqhxcmfyepgj`) nem em qualquer outro banco hospedado.

Estados usados: IMPLEMENTED (código no repositório), LOCAL_VALIDATED (executado
nesta sessão contra Postgres/Supabase local descartável), CI_VALIDATED (job do
GitHub Actions no HEAD exato), HOSTED_VALIDATED (ambiente hospedado), BLOCKED
(depende de algo fora do alcance desta sessão, dito qual) e NOT_RUN. SKIPPED
nunca conta como PASS.

## R1 — revogação de sessão no PostgREST direto

Antes: depois do logout, GoTrue e a API do Arandu recusavam o access token, mas
o PostgREST o aceitava até expirar (≤ 1 h), porque valida só a assinatura.

Correção (`docs/supabase-financial-session-revocation.sql`,
`financial-session-revocation-1`): o PostgREST chama
`public.fin_request_session_guard()` antes de toda requisição
(`pgrst.db_pre_request` no papel `authenticator`). Para `role=authenticated`, o
`session_id` do JWT precisa existir em `auth.sessions` e não ter vencido
(`not_after`); senão a requisição para com **401 `session_revoked`** antes de
qualquer tabela ou RPC. `service_role` e `anon` não passam pela checagem. O
gancho é `security invoker`; só a consulta a `auth.sessions` é `security
definer` (`fin_current_session_alive`, sem `search_path` mutável, não
executável por `anon` — invariante de `ops/sql/post-migration-probes.sql`).
Não depende da validade do token: a revogação é imediata, na requisição seguinte.

| Caso (GoTrue + PostgREST reais, stack local) | Resultado |
| --- | --- |
| Sessão ativa | 200 |
| Depois do refresh | 200 |
| Token antigo após logout (global, padrão da API do Arandu) | 401 `session_revoked` |
| Token renovado após `logout?scope=local` | 401 `session_revoked` |
| Outra sessão do mesmo usuário após logout local | 200 (intacta) |
| Escrita por RPC com token encerrado | 401; nada gravado |
| Usuário removido | 401 |
| JWT sem `session_id`, malformado, sessão vencida | 401 `session_revoked` |
| `service_role` | 200 |
| `anon` | inalterado |

Custo: 400 requisições × 2 rodadas direto ao PostgREST — p50 1,65–1,77 ms sem
o gancho, 1,86–1,98 ms com (+~0,2 ms); p95 +0,2–0,7 ms. Plano: Index Scan em
`sessions_pkey`, 3 buffers, uma vez por requisição.

Limites: o navegador nunca recebe o access token (fica no cookie
HttpOnly/Secure/SameSite=Lax assinado), então explorar R1 já exigia token
roubado. Storage direto com JWT de usuário já era recusado (sem políticas de
bucket); download passa pela RPC protegida pelo gancho. A configuração
`pgrst.db_pre_request` é do papel `authenticator`: em projeto hospedado,
aplicar a migration como `postgres` e conferir com
`ops/sql/post-migration-probes.sql`, que falha se a função existir sem o registro
(teste negativo feito na stack local). Se o PostgREST de um provedor gerenciado
ignorar a configuração do papel, o probe acusa; o gancho não se instala sozinho.

Evidência: `tests/database/financial-session-revocation.sql` (claims vivos,
inexistentes, vencidos, malformados, sem `session_id`, `service_role`, `anon`,
sessão apagada; definer/invoker/grants), `scripts/ci-demo/smoke.mjs` (quatro
verificações de sessão contra GoTrue/PostgREST/API reais no laboratório efêmero).

## R3 e D2 — decisão contra mudança simultânea de proposta

Demonstração antes de classificar (duas sessões `psql` reais,
`tests/database/financial-decision-race.sh`, sincronizadas por
`pg_stat_activity`, sem `sleep` como mecanismo):

- **D2 (P1, confirmado):** com as duas operações inteiras em qualquer ordem, o
  lock da RFQ serializava e não havia corrida de dados, mas a decisão se
  vinculava em silêncio à versão nova da proposta, que a pessoa nunca viu
  (`decided_version` = versão enviada depois da abertura da tela).
- **R3 (P2, confirmado):** na janela entre a leitura de status e a inserção da
  versão pelo provedor, `fin_submit_proposal` travava proposta → RFQ e
  `fin_record_decision` RFQ → proposta (FK com KEY SHARE): **deadlock detected**.
  A integridade se mantinha (uma das transações abortava), mas a pessoa recebia
  erro cru.

Correção (`docs/supabase-financial-decision-integrity.sql`,
`financial-decision-integrity-1`):

- `fin_record_decision_v2(rfq, proposal, expected_version, …)` trava a RFQ, confere papel e
  elegibilidade e recusa com `proposal version changed` se a versão atual não
  for a exibida; a API exige `expected_version` (400
  `expected_version_required`) e traduz a recusa em 409
  `proposal_version_changed`; deadlock/serialização viram 409
  `concurrent_update`. A tela recarrega nos dois casos para mostrar as condições
  atuais. Nada é gravado na recusa.
- `fin_submit_proposal` passa a travar RFQ → proposta, mesma ordem da decisão.
- `fin_record_decision` (sem versão) continua executável: exige as mesmas
  permissões, então não é fronteira de segurança, e mantém a API anterior
  funcionando contra o banco novo durante o deploy. O caminho da tela e da API
  passa sempre pela v2. Ordem segura: migration primeiro, depois o código (o
  doctor fica NO-GO enquanto `fin_record_decision_v2` ou o schema faltarem).

Prova: o teste de corrida falha sem a migration e passa com ela, nas duas
ordens (provedor primeiro → decisão recusada por versão; decisão primeiro →
envio recusado com `rfq is not receiving proposals`) e com dois primeiros
envios simultâneos (ambos aceitos, RFQ em `collecting`).
`tests/database/financial-decision-integrity.sql` cobre versão velha, 0, nula,
futura, proposta alheia, analista/outro tenant/provedor (`forbidden`), repetição
e envio após a decisão. Sonda DEC-1 em `scripts/ci-demo/adversarial.mjs`
repete o caso pela API real.

## R2 — oráculo de existência de UUID em RPCs `SECURITY DEFINER`

Medição no catálogo (stack local, todas as migrations): 171 funções
`fin_*` `SECURITY DEFINER` executáveis por `authenticated`; 59 contêm tanto
"not found" quanto `'forbidden'` (limite superior heurístico). Quem chama a RPC
direto no PostgREST com um UUID de outra organização pode distinguir "existe,
sem permissão" de "não existe". Reproduzido no laboratório com a Demo semeada,
sessão real do provedor Atlas e UUIDs da Vitta:

| RPC direta | UUID de outra organização | UUID aleatório |
| --- | --- | --- |
| `fin_record_contract_amendment` | 400 `forbidden` | 400 `contract not found` |
| `fin_start_contract_rfq` | 400 `forbidden` | 400 `contract not found` |
| `fin_record_decision_v2` | 400 `forbidden` | 400 `rfq not found` |

Nada é gravado nem lido em nenhum dos casos (sonda TENANT-4); pela API do
Arandu o contrato alheio devolve 404, como o inexistente (TENANT-1).

Classificação: **P3, aceito**. Exige sessão válida (agora também não revogada,
R1) e um UUID v4 já vazado (122 bits aleatórios, não enumerável); revela
existência, nunca conteúdo; a API do Arandu já devolve 404 igual para os dois
casos via RLS antes da RPC. Reescrever 59 RPCs não é proporcional a esse
ganho. Regra para código novo: RPC nova deve recusar "não existe" e "sem
permissão" com a mesma mensagem quando o chamador não for membro.
`fin_record_decision_v2` herda o comportamento de `fin_record_decision`
(mesmas mensagens) e não amplia a superfície.

## Recuperação, conversão da Demo e validação hospedada

| Item | Estado | Evidência / bloqueio |
| --- | --- | --- |
| Migrations `decision-integrity` e `session-revocation`: instalação limpa, upgrade, rollback, reaplicação | LOCAL_VALIDATED | `npm run test:database` exit 0 (PostgreSQL 16 descartável); CI_VALIDATED depende do job `database` no HEAD do PR |
| Laboratório efêmero (Supabase real em Docker) com as migrations novas | LOCAL_VALIDATED | `scripts/ci-demo/run.sh` up → smoke (16/16) → seed → check → jornada → adversarial → E2E; ver "Execução local" abaixo |
| Cadeia de recuperação sintética (export cifrado → verify → restore isolado → reconciliação) | CI_VALIDATED (job `database`) | `scripts/test-recovery-real.mjs` com PostgreSQL 17.11 e age 1.3.2 fixados; NOT_RUN local (executor sem PG17) |
| Ensaio de restore em imagem Supabase descartável | BLOCKED (preflight correto) | `npm run pilot:restore:drill` sem `PILOT_SOURCE_DATABASE_URL`, sobre a Demo local semeada: recusado antes de gerar dump por `pg_dump_major` (cliente 16 × servidor 15) e `storage_objects_empty` (6 objetos). Lacuna real: o ensaio não preserva objetos do Storage, então não cobre uma Demo com documentos; a conversão precisa do export de Storage antes do restore |
| `recovery:doctor` | BLOCKED (esperado) | `RECOVERY_SOURCE_IDENTITY_INVALID`; banco não acessado, backup e restore não gerados |
| Backup real do Pilot e do legado | BLOCKED | runner `arandu-recovery` e secrets do environment `database-recovery` ausentes (`docs/SUPABASE_ENCRYPTED_PRESERVATION.md`); proibido nesta missão sem autorização |
| Restore real comprovado, RPO/RTO medidos | NOT_RUN | RPO ≤ 24 h / RTO ≤ 4 h são metas, não medidas (`FINANCIAL_OPERATIONAL_RESILIENCE.md`) |
| `consolidation:check --environment=demo` | BLOCKED (esperado) | "evidência ausente ou inválida"; exige identidade, inventário exato, ausência de cliente/PII, export verificado, restore real e reconstrução controlada |
| `release:candidate:check` | BLOCKED (esperado) | "evidência JSON ausente" |
| Publicar a Demo canônica hospedada | BLOCKED | allowlist `demo: []`; só um PR de cutover, depois do recovery aprovado, libera (`docs/TWO_ENVIRONMENT_CONSOLIDATION.md`) |
| Aplicar as migrations novas no Pilot | NOT_RUN (proibido sem autorização) | runbook abaixo |
| Probe pós-migration da revogação de sessão | LOCAL_VALIDATED | `ops/sql/post-migration-probes.sql` falha com a função instalada e o registro ausente (negativo feito) e passa com ele |

### Runbook de recuperação (quando houver autorização, runner e secrets)

Somente comandos existentes; nenhum segredo vai em linha de comando nem em log.

1. `npm run recovery:doctor` — confere ferramentas, custódia da identidade
   `age`, diretório privado. Precisa terminar sem BLOCKED antes do passo 2.
2. Workflow `consolidation-export.yml` (manual, `main`, environment
   `database-recovery`, runner `arandu-recovery`) — export cifrado de cada
   origem com manifesto e hashes. Alternativa local controlada:
   `npm run recovery:export:private`.
3. `npm run recovery:restore:verify` — restaura o **mesmo** export num
   PostgreSQL 17 local (loopback) e reconcilia contagens tabela a tabela;
   `npm run recovery:verify` só declara `RECOVERY_RESTORE_VERIFIED` com `MATCH`
   do mesmo export.
4. `npm run pilot:restore:drill` com `PILOT_SOURCE_DATABASE_URL` — restore em
   imagem Supabase descartável, canário de isolamento e probes. Medir e
   registrar os tempos (RPO/RTO observados).
5. Classificar os registros legados (PII/LGPD) e montar a evidência de
   `consolidation:check`; só então o PR de cutover pode mover o ref.

### Aplicar as migrations desta rodada num ambiente hospedado (quando autorizado)

Pré-requisito: passos 1–4 acima no mesmo ambiente, com restore verificado.

1. `ARANDU_ENV=<ambiente> npm run release:candidate:doctor -- --json --expected-commit=<sha>`.
2. Aplicar, em ordem, `docs/supabase-financial-decision-integrity.sql` e
   `docs/supabase-financial-session-revocation.sql` como `postgres`.
3. `psql -f ops/sql/post-migration-probes.sql` (transação desfeita) e
   `npm run release:candidate:canary`.
4. Conferir R1 hospedado: entrar, copiar nada; fazer logout pela tela e
   confirmar no log da API 401 nas chamadas seguintes; o smoke do laboratório é
   o roteiro (`scripts/ci-demo/smoke.mjs`, seção "Sessão").
5. Rollback: `docs/rollback/supabase-financial-session-revocation.rollback.sql`
   (remove o gancho e as funções) e depois
   `docs/rollback/supabase-financial-decision-integrity.rollback.sql`. A API
   desta versão chama `fin_record_decision_v2`: reverter o banco exige reverter
   o deploy junto.

## Production — preparação sem ativação

| Item | Estado | Evidência |
| --- | --- | --- |
| Build do projeto `arandu` (Production) | BLOCKED (fail-closed por desenho) | Reproduzido no HEAD desta rodada com valores simulados e sem segredo: sem `ARANDU_ENV`, com o ref legado, com o ref do Pilot, com um ref novo ou sem `SUPABASE_URL`, `scripts/vercel-build.mjs` termina com exit 1 antes do build porque `ACTIVE_SUPABASE_ASSIGNMENTS.production` está vazio. `BUILD_UTILS_SPAWN_1` é o código com que a Vercel relata "comando de build terminou com erro"; não é a causa. Qual ramo exato falhou na Vercel continua não observado (logs 403); qualquer configuração atual falha da mesma forma |
| Ativação de Production | BLOCKED | depende de preservação/classificação do legado, reconstrução limpa com marcador `production`, PR de cutover verde e decisão humana |
| Mapa de configuração | IMPLEMENTED (documental) | variáveis lidas pelo doctor (`ARANDU_ENV`, `ARANDU_SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ARANDU_DEPLOYMENT_KIND`, `ARANDU_DEMO_MODE`, `ARANDU_PRESENTATION_MODE`, `ARANDU_EMAIL_DISPATCH_ENABLED`) e por `finance:env:check` (+ `ARANDU_DEMO_PASSWORD`, `ARANDU_PILOT_ALLOWLIST_CONFIRMED`, `ARANDU_FINANCE_ENABLED`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`); diferença entre ambientes só por `lib/runtime-mode.mjs` |

Checklist M5 (nenhum item cumprido; todos exigem evidência hospedada):
recovery do legado comprovado; dados legados classificados; projeto Production
reconstruído com `cleanInstall` e marcador; allowlist liberada por PR de
cutover verde; variáveis próprias (nunca as da Demo); build verde com log real;
doctor GO no SHA exato; canário e probes; jornada hospedada desktop/celular;
R1 conferido no hospedado; rollback ensaiado; decisão humana registrada.

## Execução local

Stack Supabase local em Docker (GoTrue, PostgREST, Storage, Postgres 15.14),
todas as migrations do `cleanInstall` aplicadas pelo caminho oficial
(`scripts/ci-demo/run.sh`), app em `ARANDU_ENV=demo`.

| Fase | Resultado |
| --- | --- |
| `check:all` | exit 0 |
| `build` | exit 0 |
| `test:database` (PostgreSQL 16 descartável, com papel `authenticator`) | exit 0 |
| smoke | 16/16 PASS (4 de sessão novas) |
| seed + `--check` | PASS (decisões do seed com `expected_version`) |
| jornada | 24 passos, 63 ataques, 0 falhas |
| adversarial | 24 sondas, 24 PASS, 0 FAIL, 0 SKIPPED (inclui DEC-1) |
| E2E Demo desktop/celular (stack recriada, E2E antes das fases que escrevem, como no CI) | 5 passed + 1 skipped em cada projeto (o mesmo skip do CI: pool de workspaces) |

Duas execuções descartadas, com causa: (1) `--check` rodado depois da
meia-noite UTC sobre o seed do dia anterior — as datas esperadas são relativas
ao dia corrente (um dia de diferença); pendência registrada à parte; (2) E2E
rodado depois de jornada e adversarial, que escrevem na Demo — no CI o E2E roda
antes delas; o `--reset` do seed também não remove as entidades legais criadas
pela sonda MENT-0, por isso a stack foi recriada do zero, como no CI.

## Próxima intervenção humana mínima

1. Revisar e mergear os PRs desta rodada com os quatro gates verdes no HEAD exato.
2. Autorizar e prover o runner `arandu-recovery` e os secrets do environment
   `database-recovery` (fora do chat) para o primeiro export cifrado do Pilot.
3. Depois do restore verificado, autorizar explicitamente a aplicação das duas
   migrations no Pilot e a conferência de R1 hospedada.
