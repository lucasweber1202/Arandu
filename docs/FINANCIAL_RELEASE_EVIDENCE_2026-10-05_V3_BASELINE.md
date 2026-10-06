# Reconciliação pós-merge e baseline v3 — 05/10/2026

**Objetivo da rodada: `CODE/CI BASELINE CLEAN`, não `PILOT GO`.**
**Pilot hosted remains NO-GO.** Nenhum deploy, migration, backup, restore, doctor,
canário ou jornada foi executado em ambiente hospedado nesta rodada: o executor não tem
credencial de Supabase, Vercel nem administração do GitHub. Tudo marcado "local" foi
executado neste executor e não atesta Pilot nem produção.

Fonte viva desde esta rodada (substitui `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md` como
estado atual; aquele documento continua válido como histórico da #125 e pela lista de
ações externas).

## Estado vivo confirmado no início (GitHub, 05/10 13:39Z)

| Item | Observado |
| --- | --- |
| `pilot` | `d828a44027506a9d4a4eddd807914f85dd8dde4c` — merge #127 (Guideline v3) sobre `399b7ac` (merge #125) |
| `main` | `ed5da41c5244040d9e3b1ddb501053280d692622` — merge #126 (Dependabot, Vite 8.3.1 → 8.3.2) |
| `main...pilot` | diverged: `pilot` ahead 87, behind 2 (`cba84af`, `ed5da41`) |
| #125 | mergeada 13:28:11Z; HEAD `e2212af` com quatro gates success (run `37258668278`); `merge-audit` run `37317037072` **success** |
| #126 | mergeada em `main` 13:28:22Z; quatro gates success no HEAD `cba84af` (run `37308022347`); `main` não tem `merge-audit` |
| #127 | mergeada 13:28:36Z com `validate`/`presentation` **in_progress** (run `37316477732`, HEAD `c16ae66` criado sobre `556258c`); `validate` terminou success às 13:39:46Z, depois do merge; `merge-audit` run `37317090124` **failure** ("validate: in_progress", "presentation: in_progress", "PR desatualizada") |
| PRs/commits adicionais depois disso | nenhum |
| proteção | `pilot` e `main` `protected=false` (API de branches, 05/10) |

`pilot@d828a44` **não** é baseline limpa: a árvore #125 + #127 nunca rodou CI.
Incidente registrado como MGI-2026-10-05-01 em `FINANCIAL_REPO_GOVERNANCE.md`.

## O que esta PR faz (sem feature nova)

1. **Reconciliação `main → pilot`.** Merge-base `201adb4`; `main` tem uma única mudança
   exclusiva: `cba84af` (Vite 8.3.1 → 8.3.2, #126). Merge consciente de `main@ed5da41`
   mantendo `package.json`/`package-lock.json` da `pilot` + o bump do Vite (lock
   regenerado com `npm install --package-lock-only`, 73+/73− linhas, igual em forma ao diff
   do Dependabot). A dependência `typescript` que só `main` ainda carrega é legado da arte
   removido deliberadamente na `pilot` (LEG-02) e **não** foi reintroduzida. Nenhum outro
   arquivo de `main` difere do merge-base. Depois do merge desta PR, `main...pilot` fica
   `behind_by=0`.
2. **Prevenção da divergência.** `.github/dependabot.yml` passa a usar
   `target-branch: "pilot"` nos dois ecossistemas, verificado em `check:governance` (prova
   negativa: removido em um bloco, o check falha). O Dependabot lê a configuração da branch
   padrão; vale depois da próxima promoção `pilot → main`.
3. **Autoridade v3.** `CLAUDE.md`, `CONTRIBUTING.md` e `OPERATIONS_INDEX.md` deixam de dizer
   que o addendum v2.1 prevalece; o addendum ganha cabeçalho histórico/superseded (mantido
   pelos IDs `Add. X.Y` citados em migrations e na matriz).
4. **`IMPLEMENTATION_MATRIX` em M0–M6.** Critérios objetivos de promoção, níveis de
   evidência, baselines de validação (`BL-125`, `BL-V3`) e registro de maturidade por
   capability (Maturity, Evidence level, ambiente, SHA, última validação, blockers, próximo
   gate). Nenhuma capability acima de M2; nenhuma M6.
5. **Baselines documentais.** `556258c`/`201adb4` passam a "histórico" onde eram
   apresentados como estado atual (`FINANCIAL_PILOT_GO_LIVE.md`, matriz, índices).
6. **Incidente da #127** registrado; histórico não reescrito.
7. **Capacity headroom** registrado em `FINANCIAL_BUNDLE_HEADROOM.md`.

## Validação local (árvore desta PR)

| Comando | Resultado |
| --- | --- |
| `npm ci --include=optional` | ok, 0 vulnerabilidades |
| `npm run audit:ci` | 0 vulnerabilidades |
| `npm run sbom:ci` | ok |
| `npm run check:all` | exit 0 (inclui `check:governance` com a nova regra do Dependabot) |
| `npm run build` + `check:build-size` + `check:dist-assets` + `check:seo:dist` + `check:financial-surface` + `check:financial-navigation` | ok (`ARANDU_SITE_URL=https://arandu.example.com`, como no CI) |
| `npm run build:demo` + `check:build-size` | ok; JS 799.005 / 800.000 |
| `npm run test:e2e:list` | ok |
| `npm run test:database` (PostgreSQL 16 local) | exit 0 |
| `npm run test:e2e` (Chromium desktop + mobile Chrome) | 167 passed, 7 skipped, 0 failed |
| `npm run test:e2e:presentation` (Chromium desktop + mobile Chrome) | 123 passed, 19 skipped, 0 failed |
| `git diff --check` | ok |

Firefox, WebKit e Safari móvel não existem neste executor (download proibido); rodam nos
jobs `validate` e `presentation` do CI. O Chromium local é o binário pré-instalado no
executor (rev. 1194) apontado para o caminho que o Playwright 1.63 espera; não altera
config, browsers nem retries do projeto. Skips são os condicionais documentados nos specs.

## CI no HEAD exato e merge (#128)

| Item | Resultado |
| --- | --- |
| HEAD | `4a93fa60b51ae4c094e95d25cee8be4748363cfb` |
| `database` | success (13:55:12Z) |
| `deploy-boundaries` | success (13:54:34Z) |
| `validate` | success (14:09:41Z) |
| `presentation` | success (14:15:20Z) |
| Run | `37320266260` |
| `merge:gates` | **não executado antes do merge**: a #128 foi mergeada às 13:56:23Z por ação manual, com `validate`/`presentation` ainda `in_progress` (teria bloqueado) |
| Merge | `pilot@d4d6c22`, árvore idêntica a `4a93fa6` |
| `merge-audit` | run `37320702496` **failure** (gates em execução no momento do merge) |
| `main...pilot` | `pilot` ahead 90, behind **0** |

Leitura: a **árvore** de `pilot` está CI-validada (quatro gates verdes no HEAD exato); a
**governança** do merge falhou de novo (MGI-2026-10-05-02 em `FINANCIAL_REPO_GOVERNANCE.md`).
A baseline só é declarada limpa quando a PR documental de seguimento for mergeada com os
quatro gates verdes, `merge:gates` verde e `merge-audit` pós-merge verde.

## Capacity headroom (v3 §24)

| Build | JS total / hard limit | Margem | Maior chunk / limite |
| --- | --- | --- | --- |
| Financeiro (Pilot/Produção) | 426.174 / 800.000 | 373.826 (46,7%) | 82.324 / 100.000 (17,7% de margem) |
| Demo independente | 799.005 / 800.000 | **995 (0,12%)** | 89.125 / 100.000 (10,9%) |

Demo: **technical capacity risk** (fora do envelope saudável de 10%). Limites inalterados.

## Maturidade resultante

| Dimensão | Estado |
| --- | --- |
| Código/CI | M2 em `BL-V3` (`4a93fa6`, quatro gates success); governança de merge pendente do seguimento (MGI-02) |
| Pilot hospedado | **NO-GO** — nenhuma capability M3/M4; último marker observado `financial-surface-hardening-1` (04/10) |
| Produção | não pronta — nenhuma capability M5 (`ARANDU_ENV=production` e Supabase próprio ausentes; API legada ainda roteada em 05/10) |
| Cliente | M6 = false para todas as capabilities |
| Rulesets | **OWNER_ACTION_REQUIRED** (`protected=false`) |
| P1.4 | NOT_STARTED (fora desta rodada) |

## Blockers externos (inalterados; ordem em `FINANCIAL_RELEASE_EVIDENCE_2026-10-05.md`)

1. Rulesets `pilot`/`main` — importar `.github/rulesets/{pilot,main}.json`; verificar
   `protected=true` (`BRANCH_PROTECTION.md`).
2. Recuperabilidade do Pilot — `PILOT_SOURCE_DATABASE_URL` por canal seguro; backup
   preflight + `pilot:restore:drill` hospedado **antes** de O3 e de qualquer upload.
3. Schema do Pilot — bundle em etapas a partir do marker observado, depois doctor.
4. Doctor, canário e jornada autenticada hospedados no SHA exato; `pilot:release:check` GO.
5. Produção — Supabase PROD dedicado, `ARANDU_ENV=production`, migrations próprias,
   restore, security/admin readiness.
6. Jurídico, contas, operador, e-mail, domínio e comercial (`FINANCIAL_PILOT_GO_LIVE.md`).

## Próxima ação correta (Guideline v3 §29, Stage 0)

Merge desta PR com gates limpos → owner aplica rulesets → Stage 0 hosted closure do Pilot
(restore drill, schema, doctor/canário/jornada, release gate). P1.4 só depois de Stage 0.

---

## Governança pós-#129 e tentativa de Stage 0 hospedado — 05/10/2026 (tarde)

### Estado vivo (14:55Z)

| Item | Observado |
| --- | --- |
| `pilot` | `280490b36b083a98bec720e0ac57bd22823bc8f3` (merge #129; árvore = `5cecd14`) |
| `main` | `ed5da41c5244040d9e3b1ddb501053280d692622` |
| `main...pilot` | ahead 92, **behind 0** |
| #129 | quatro gates success no HEAD `5cecd14`, mas mergeada com `presentation` em execução → `merge-audit` `37326353933` failure (**MGI-2026-10-05-03**) |
| PRs abertas / posteriores | nenhuma |
| Proteção | `pilot`/`main` `protected=false`; **rulesets indisponíveis no plano** (repositório privado em GitHub Free: API 403 "Upgrade to GitHub Pro or make this repository public") |
| Credenciais nesta sessão | nenhuma de Supabase, Vercel, `PILOT_SOURCE_DATABASE_URL`, `CRON_SECRET`, Resend ou IdP. O token GitHub do executor tem `admin` no repositório, o que não supera o limite do plano |

### Stage 0 — o que foi executado e com que resultado

| Passo (ordem v3) | Resultado | Evidência |
| --- | --- | --- |
| 1. Identificar o ambiente | **PARCIAL (público)** | `arandu-pilot.vercel.app`: `/api/health` 200 alive; `/api/finance/me` 401; `/api/jobs/{renewals,webhooks,governance}` 401 `cron_unauthorized`; `/api/email-dispatch` 503 `email_dispatch_disabled`; `/api/v1/rfqs` 401; `/api/catalog` 404 (legado fechado); `/demo/` 404. Assets de `/finance/dashboard.html` **idênticos** ao build local de `280490b` (4/4; consistência, não prova de SHA). Supabase `offgpyysgdhfemjlchod` responde 401 sem chave (o anon key é só de servidor, padrão BFF). Projeto/env/bucket/marker **não verificáveis** sem credencial |
| 2. Backup preflight | **BLOCKED** | `npm run pilot:backup:preflight` → `result: blocked`, `source_identity: Conexão administrativa ausente ou inválida`, backup/restore `NOT RUN` (fail-closed correto) |
| 3. Restore drill | **BLOCKED** | `npm run pilot:restore:drill` → "Sem PILOT_SOURCE_DATABASE_URL…", exit 1. Drill local com dados já PASS em 05/10 (28 sondas + canário) — não substitui o hospedado |
| 4. Plano de migration | **DONE (contra o último marker observado)** | a partir de `financial-surface-hardening-1` (observado em 04/10, **não reconfirmado**): **17 pendentes**. Etapa 1 segura: 12 arquivos até `financial-data-governance-1`, bundle `reports/supabase-migrations-existingDatabase-staged.sql` SHA-256 `ce5797561d35d3e02c1e0c889318cb2d34cd7df2dacb554f4cbe967ff3f7aac0`. Etapa 2: decommission da arte (exige ack do owner) + `p0-closure`, `value-realization`, `fee-intelligence`, `opportunity-engine` → `financial-opportunity-engine-1`; bundle completo SHA-256 `8abfeffa2a3a13bbd6ed77f3bb48f418afbd9364795e1d74aeb327d8b54d203a`. Bundles são determinísticos: regenerar com os mesmos argumentos deve reproduzir os hashes |
| 4b. Ensaio do rollout (local, banco descartável) | **PASS** | PostgreSQL 16 local: `cleanInstall` até `pilot-surface-hardening` + fixture de arte → marker `financial-surface-hardening-1`; bundle staged **exato** → `financial-data-governance-1`; reaplicação idempotente; decommission **sem ack recusado** ("legacy art data present (7 rows)…"), marker preservado; canário de isolamento PASS; continuação com ack **local de ensaio** → `financial-opportunity-engine-1`; `post-migration-probes` PASS; canário PASS |
| 5–6. Rollout + marker hospedados | **BLOCKED** | dependem de 2–3 PASS e de conexão administrativa |
| 7. Doctor | **NO-GO (sem credencial)** | `ARANDU_ENV=pilot finance:pilot:doctor --json`: 7 OK, 2 WARN, 10 ERROR — todos ausência de `ARANDU_SITE_URL`/`SUPABASE_*`/`CRON_SECRET` e conexões consequentes; 0 UNSAFE. Não é diagnóstico do Pilot, só prova do fail-closed |
| 8. Canário | **BLOCKED** | `pilot:canary` → "Defina PILOT_DATABASE_URL…", exit 1 |
| 9. Jornada autenticada | **BLOCKED** | sem contas/credenciais do Pilot. Jornada local com Supabase real (GoTrue/PostgREST/Storage) já PASS em 05/10 |
| 10. Jobs | **GAP OPERACIONAL** | `vercel.json` agenda tudo 1×/dia (`renewals` 09:15, `webhooks` 09:45, `governance` 04:30, `email-dispatch` 12:00 UTC). `approval_deadlines`/`opportunities` rodam dentro da cron diária. Webhooks e prazos de aprovação **não** são near-real-time. Não alterado: crons sub-diárias exigem plano Vercel que as suporte ou agendador externo com o mesmo `CRON_SECRET` |
| 11. Release evidence | **DONE** | esta seção |
| 12. `pilot:release:check` | **NO-GO** | sem evidência JSON, exit 1 (fail-closed; invalida resultado anterior antes de ler) |

E-mail: desligado de forma honesta no Pilot (`email_dispatch_disabled`). SSO, API pública,
data governance e storage: sem ambiente autenticado, nada além do M2 foi provado. Nenhum
upload, MFA ou dado foi criado.

### Maturidade

Nenhuma promoção. Nenhuma capability passa de M2: não houve migration, doctor, canário nem
probe autenticado no Pilot vinculado a release. **Pilot hosted remains NO-GO.**

### Runbook exato para o owner (ordem obrigatória)

1. Exportar no shell local, sem gravar em arquivo versionado: `PILOT_SOURCE_DATABASE_URL`
   (conexão administrativa direta, TLS, projeto `offgpyysgdhfemjlchod`).
2. `PATH=/usr/lib/postgresql/17/bin:$PATH npm run pilot:backup:preflight` → exigir `result: ok`
   e conferir `source_identity`, objetos de Storage e fatores MFA (o drill recusa se houver).
3. `PILOT_DRILL_KEEP=1 npm run pilot:restore:drill` → exigir `reports/pilot-restore-drill.json`
   `passed`; anotar SHA do backup e durações.
4. Ensaio sobre a cópia restaurada mantida (dados reais, banco descartável):
   ler o marker (`select value from public.fin_settings where key='schema_version'`), gerar
   `npm run migrations:bundle -- --flow=existingDatabase --after-schema=<marker observado>
   --stop-before=docs/supabase-financial-legacy-art-decommission.sql`, aplicar no contêiner
   indicado em "destino mantido" (`docker exec -i <contêiner> psql -U postgres -v ON_ERROR_STOP=1
   < reports/supabase-migrations-existingDatabase-staged.sql`), conferir marker
   `financial-data-governance-1` e rodar `ops/sql/post-migration-probes.sql` e
   `ops/sql/pilot-isolation-canary.sql`. Se o marker observado for `financial-surface-hardening-1`,
   o SHA-256 do bundle precisa ser `ce5797561d35…`.
5. Só então aplicar o mesmo bundle no Pilot hospedado; conferir marker; `ARANDU_ENV=pilot
   npm run finance:pilot:doctor -- --json` (exigir exit 0) e `PILOT_DATABASE_URL=… npm run
   pilot:canary`.
6. Decommission da arte: procedimento de `docs/LEGACY_ART_RETIREMENT.md` com export verificado e
   ack `export-verified:<ref real>` — **decisão do owner**; depois as 4 migrations restantes.
7. Jornada autenticada hospedada com contas de teste dedicadas; montar a evidência JSON e
   `npm run pilot:release:check -- --evidence=<arquivo> --commit=<SHA>`.
