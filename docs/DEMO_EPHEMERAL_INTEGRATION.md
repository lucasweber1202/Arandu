# Integração efêmera da Demo canônica (GitHub Actions)

Workflow: `.github/workflows/demo-integration.yml` · Harness: `scripts/ci-demo/` ·
Teste estático: `scripts/test-ci-demo.mjs` (em `check:staging`).

## Para que serve

Prova, num runner Linux padrão e descartável, que o Arandu funciona de ponta a
ponta com **serviços reais e dados sintéticos**, sem depender do computador de
ninguém e sem tocar ambiente hospedado:

- PostgreSQL real (`supabase/postgres`), Supabase Auth (GoTrue), PostgREST e
  Storage, em Docker, com todas as migrations de `docs/supabase-migrations.json`
  (`cleanInstall`);
- a API e as páginas reais do Arandu (`scripts/pilot-local/app-server.mjs`, o
  mesmo roteamento de `vercel.json`) em `ARANDU_ENV=demo`;
- a Vitta Foods semeada pelo seed oficial (`scripts/demo/seed.mjs --reset`).

Não é um dos quatro gates obrigatórios e não altera nenhum deles nem a branch
protection. Maturidade: é evidência de M2 (CI no HEAD exato) para a Demo
integrada; não é M3 (hospedado) nem libera cutover da Demo.

## Composição mínima

| Serviço | Por quê | Imagem fixada (tag + digest) |
| --- | --- | --- |
| Postgres | banco real, RLS, funções, pg_cron | `supabase/postgres:15.14.1.064` |
| GoTrue | contas, login, JWT, MFA da jornada do operador | `supabase/gotrue:v2.181.0` |
| PostgREST | toda leitura/escrita da API passa por ele com o JWT do usuário | `supabase/postgrest:v12.2.9` |
| Storage | documentos do seed e da jornada (bucket privado `fin-documents`) | `supabase/storage-api:v1.25.3` |
| gateway HTTPS | `https://localhost:8443` no formato `/auth/v1`, `/rest/v1`, `/storage/v1` | `scripts/pilot-local/gateway.mjs` |
| app | API + estáticos do build atual | `scripts/pilot-local/app-server.mjs` |

Kong, Realtime, Studio, Edge Functions, imgproxy e analytics ficam de fora: o
Arandu não os usa. Os digests estão em `scripts/ci-demo/run.sh`; o pull tenta o
ECR público e, se recusar por cota, o Docker Hub com o **mesmo digest**.

## Fases

| Fase | Comando | O que prova |
| --- | --- | --- |
| preflight | `run.sh preflight` | ≥ 6 GB de memória e ≥ 12 GB de disco livres; Docker, psql e Node presentes |
| images | `run.sh images` | imagens com identidade fixa |
| up | `run.sh up` | stack sobe, migrations aplicam sem erro, app em modo demo |
| smoke | `run.sh smoke` | banco/versão de schema, RLS em todas as `fin_*`, banco vazio, Auth/PostgREST/Storage saudáveis, API em `demo` + `supabase`, senha errada recusada, login real com cookie `HttpOnly; Secure`, RLS para usuário sem organização e anônimo |
| seed | `run.sh seed` | seed oficial completo + checagens de sanidade |
| check | `run.sh check` | as mesmas checagens de novo, só leitura, com o app reiniciado |
| e2e | `run.sh e2e demo-desktop` / `demo-mobile` | `playwright.demo.config.js` (`demo-baseline.spec.js`): tesouraria → RFQ → propostas → comparação → aprovação → decisão → contrato → renovação; CFO; portal do provedor sem concorrentes; Passport; pós-contrato |
| journey | `run.sh journey` | `scripts/pilot-local/journey.mjs`: contas e login reais, allowlist, organizações, convites de membro e de provedor, RFQ, propostas com rascunho/versões, comentários, documentos no Storage, comparação, aprovação (com segregação), decisão, contrato e renovação, cron, e-mail em fila, console de operação com MFA, e dezenas de ataques de isolamento (RLS direto no PostgREST, Storage direto, provedor lendo concorrente, externo, anônimo) |
| adversarial | `run.sh adversarial` | `scripts/ci-demo/adversarial.mjs`, depois do E2E e da jornada (escreve na Demo efêmera): cookie adulterado e forjado, sessão depois do logout, JWT de outro segredo e `alg: none`; provedor contra contratos, tarefas, versões, aprovações, decisões e documentos da compradora pela API, PostgREST e RPC direta (com conferência de que nada mudou no banco); viewer sem escrita; seis registros simultâneos do mesmo contrato, seis pedidos simultâneos de renovação, dois votos simultâneos; aditivo de prorrogação e novo ciclo de renovação. Sonda sem pré-condição é SKIPPED, nunca PASS |
| recovery | `run.sh recovery` | `scripts/pilot-restore-drill.sh` sobre a Demo semeada (só dados sintéticos), depois das fases que escrevem: backup do banco e dos **binários do Storage** (`scripts/storage-recovery.mjs`, age por objeto, índice cifrado), restore num Supabase descartável **separado**, negativos (artefato ausente, adulterado, identidade errada), prova de que o restore só do banco falha (`missing_binary` em todos os objetos), restore dos binários pela API oficial, releitura com SHA-256, permissões diretas negadas, ACLs do Storage, probes, canário e `recovery_complete`. Clientes PostgreSQL vêm da própria imagem fixada (`PILOT_DRILL_PG_FROM_IMAGE=1`) |
| evidence / down | `run.sh evidence` / `run.sh down` | logs sanitizados; containers, volumes, chaves e certificados apagados |

Cobertura pedida → onde está:

- autenticação: smoke + jornada (login, sessão expirada, MFA);
- persistência: seed (escrita pela API) + `check` (releitura com processo novo) + jornada (rascunho retomado, versões);
- isolamento organizacional e RLS: smoke + ataques da jornada + `Provedor não vê concorrentes` + spec do provedor;
- contrato existente, próxima ação e renovação: checagens `Contrato existente com revisão de renovação agendada`, `Contrato de crédito em janela de renovação`, `Marco de renovação D-90 registrado pelo cron` + spec da tesouraria;
- RFQ, propostas, aprovação e fluxo do provedor: seed + spec + jornada.

## Garantias

- **Só local.** `scripts/ci-demo/assert-local.mjs` recusa qualquer URL de fase
  cujo host não seja `localhost`/`127.0.0.1` e a presença de variáveis de
  ambiente hospedado; o seed tem as próprias travas (`lib/finance/demo-guard.mjs`,
  `ARANDU_DEMO_CONFIRM=local`). Além disso, o workflow aponta para `0.0.0.0`, no
  `/etc/hosts` do runner, todos os refs de `ACTIVE_SUPABASE_ASSIGNMENTS` e a API
  da Supabase.
- **Sem secrets.** O workflow não referencia `secrets.` nem `environment:`;
  chaves JWT, senha do Postgres, segredo do cron, certificado e senha das
  personas são gerados por execução e apagados no teardown.
- **Sem deploy, migration hospedada, recovery hospedado ou mudança de topologia.** O recovery da fase 6 é sintético: origem e destino são contêineres do próprio runner.
- **Falha é falha.** Sem `continue-on-error`, sem `|| true`, sem retries do
  Playwright. Etapa não executada aparece como `NÃO EXECUTADA` no resumo.
  O workflow declara `defaults.run.shell: bash` (`-eo pipefail`): sem isso o
  Actions usava `bash -e {0}` e `run.sh fase | tee` sairia com o código do
  `tee`, ou seja, uma fase reprovada apareceria como PASS. Conferido no log da
  execução da #191: nenhuma fase escondeu falha; o autoteste agora exige o shell.
- **Evidência sanitizada.** `scripts/ci-demo/sanitize.mjs` remove os valores
  gerados, JWTs, cookies, senhas em URL e e-mails fora de `*.example`, e falha se
  algo sobreviver. O Playwright roda com `--trace off` (o trace guardaria
  cookies). Os artifacts têm retenção de 14 dias.
- **Limpeza obrigatória.** Teardown com `if: always()` e verificação de que
  nenhum container do projeto sobrou.

## Recursos

Um job, `ubuntu-24.04` padrão (4 vCPU, 16 GB). Os quatro containers somam
~0,5 GB de memória em uso; as imagens ocupam ~6,4 GB de disco (o Postgres da
Supabase sozinho tem ~5,4 GB). Playwright só com Chromium e um worker; desktop e
mobile rodam em sequência, nunca a matriz de três motores junto com a stack. Se
o preflight acusar pressão, a separação prevista é mover as fases e2e para um
job próprio que suba a stack de novo — hoje não é necessário.

Duração observada em ensaio: imagens ~3 min (sem cache), up ~1 min, smoke < 5 s,
seed ~10 min, e2e ~2 min, jornada ~1 min.

## Limitações conhecidas

- O smoke prova a revogação de sessão no PostgREST direto (R1, mitigado por
  `docs/supabase-financial-session-revocation.sql`): token de sessão encerrada
  recebe 401 em tabela, leitura e escrita por RPC; a outra sessão segue valendo.
  Isso vale para esta stack efêmera; nos ambientes hospedados depende de aplicar
  a migration.

- O limitador de tentativas de login do app é por processo fora da Vercel; cada
  fase reinicia o app pelo caminho oficial (`scripts/demo/local.sh app`), como um
  deploy novo, em vez de afrouxar o limite. O limitador distribuído
  (`ARANDU_DISTRIBUTED_RATE_LIMIT`) não é exercitado aqui.
- O primeiro ataque da jornada ("allowlist vazia") roda depois do seed, que já
  cadastra os domínios da demo: o resultado registra "ambiente compartilhado" em
  vez do fail-closed. O fail-closed com allowlist vazia continua coberto por
  `npm run test:database`.
- `demo-workspaces.spec.js` (pool de visitantes) fica pulado: exige o pool
  abastecido (`ARANDU_DEMO_WORKSPACE_E2E=1`).
- Readiness (`/api/health?probe=ready`) responde `not_ready` localmente
  (configuração de e-mail/domínio de produção ausente por desenho); o smoke usa
  liveness + identidade do release.
- Só Chromium. Firefox/WebKit continuam cobertos pelos gates atuais, contra o
  build sem Supabase.

## Como disparar

Actions → *Arandu Demo Integration (ephemeral)* → *Run workflow* (após o merge na
`main`). Em PR, roda sozinho apenas quando o próprio harness muda. Localmente,
com Docker: `bash scripts/ci-demo/run.sh preflight` … `down`, na mesma ordem do
workflow (o Playwright aceita `PW_CHROMIUM` com um Chromium já instalado).

## Proposta de integração ao CI obrigatório

Só depois de pelo menos três execuções independentes verdes no mesmo SHA e sem
falha intermitente: proposta registrada no PR que introduziu o workflow; nada
muda nos gates até decisão explícita.
